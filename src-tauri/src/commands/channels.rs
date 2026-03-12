use std::{fs, path::PathBuf, process::Command};

use serde_json::{Map, Value};

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法获取用户目录（HOME/USERPROFILE）".to_string())
}

fn openclaw_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".openclaw"))
}

fn openclaw_json_path() -> Result<PathBuf, String> {
    Ok(openclaw_dir()?.join("openclaw.json"))
}

fn load_openclaw_json() -> Result<Value, String> {
    let path = openclaw_json_path()?;
    if !path.is_file() {
        return Err(format!("未找到配置文件：{}", path.display()));
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取配置失败: {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("解析 JSON 失败: {}: {e}", path.display()))
}

fn get_nested_value<'a>(root: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut cursor = root;
    for key in path {
        cursor = cursor.get(*key)?;
    }
    Some(cursor)
}

fn get_nested_string(root: &Value, path: &[&str]) -> Option<String> {
    get_nested_value(root, path)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

fn sanitize_secrets(mut s: String, secrets: &[&str]) -> String {
    for sec in secrets {
        let sec = sec.trim();
        if !sec.is_empty() {
            s = s.replace(sec, "***");
        }
    }
    s
}

fn resolve_node_bin() -> Result<PathBuf, String> {
    crate::core::platform::resolve_node_path()
        .ok_or_else(|| "未检测到 Node.js，请先完成安装或修复环境".to_string())
}

fn run_node_script(script: &str, envs: &[(&str, &str)]) -> Result<String, String> {
    let node = resolve_node_bin()?;
    let mut cmd = Command::new(node);
    cmd.args(["-e", script]);
    for (k, v) in envs {
        cmd.env(k, v);
    }

    let out = cmd.output().map_err(|e| format!("执行 node 失败: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if out.status.success() {
        return Ok(stdout);
    }

    let detail = if !stderr.is_empty() { stderr } else { stdout };
    let code = out.status.code().map(|c| c.to_string()).unwrap_or_else(|| "unknown".to_string());
    if detail.is_empty() {
        Err(format!("命令执行失败（退出码 {code}）"))
    } else {
        Err(format!("{detail}（退出码 {code}）"))
    }
}

fn resolve_telegram_bot_token(input: &str) -> Result<String, String> {
    let t = input.trim();
    if !t.is_empty() {
        return Ok(t.to_string());
    }
    let cfg = load_openclaw_json()?;
    let t = get_nested_string(&cfg, &["channels", "telegram", "botToken"])
        .unwrap_or_default()
        .trim()
        .to_string();
    if t.is_empty() {
        return Err("未提供 Telegram Bot Token，且 openclaw.json 未配置 channels.telegram.botToken".to_string());
    }
    Ok(t)
}

fn resolve_feishu_fields(domain: &str, app_id: &str, app_secret: &str) -> Result<(String, String, String), String> {
    let d = domain.trim().to_lowercase();
    let a = app_id.trim().to_string();
    let s = app_secret.trim().to_string();

    if !d.is_empty() && !a.is_empty() && !s.is_empty() {
        return Ok((d, a, s));
    }

    let cfg = load_openclaw_json()?;
    let domain_cfg = get_nested_string(&cfg, &["channels", "feishu", "domain"])
        .unwrap_or_else(|| "feishu".to_string());
    let app_id_cfg = get_nested_string(&cfg, &["channels", "feishu", "accounts", "main", "appId"])
        .unwrap_or_default();
    let app_secret_cfg = get_nested_string(&cfg, &["channels", "feishu", "accounts", "main", "appSecret"])
        .unwrap_or_default();

    let domain_out = if !d.is_empty() { d } else { domain_cfg.trim().to_lowercase() };
    let app_id_out = if !a.is_empty() { a } else { app_id_cfg.trim().to_string() };
    let app_secret_out = if !s.is_empty() { s } else { app_secret_cfg.trim().to_string() };

    Ok((domain_out, app_id_out, app_secret_out))
}

// ── Telegram ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_telegram(bot_token: String) -> Result<String, String> {
    let token = resolve_telegram_bot_token(&bot_token)?;

    let script = r#"
const token = process.env.TG_TOKEN || '';
if (!token) { console.error(JSON.stringify({ error: 'NO_TOKEN' })); process.exit(1); }
(async () => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) {
      console.error(JSON.stringify({ status: res.status, data }));
      process.exit(1);
    }
    const r = data.result || {};
    console.log(JSON.stringify({ id: r.id, username: r.username || '', first_name: r.first_name || '' }));
  } catch (e) {
    console.error(JSON.stringify({ error: (e && e.message) ? e.message : String(e) }));
    process.exit(1);
  }
})();
"#;

    let raw = run_node_script(script, &[("TG_TOKEN", &token)])
        .map_err(|e| sanitize_secrets(e, &[&token]))?;

    let v: Value = serde_json::from_str(&raw).map_err(|_| "解析响应失败".to_string())?;
    let id = v.get("id").and_then(|x| x.as_i64()).unwrap_or(0);
    let username = v.get("username").and_then(|x| x.as_str()).unwrap_or("").trim();
    let first_name = v.get("first_name").and_then(|x| x.as_str()).unwrap_or("").trim();

    let name = if !username.is_empty() {
        format!("@{username}")
    } else if !first_name.is_empty() {
        first_name.to_string()
    } else {
        "未知".to_string()
    };

    Ok(format!("Telegram 连接成功：{name}（bot id: {id}）"))
}

#[tauri::command]
pub async fn send_telegram_test_message(bot_token: String, chat_id: i64, text: String) -> Result<String, String> {
    let token = resolve_telegram_bot_token(&bot_token)?;
    if chat_id <= 0 {
        return Err("chat_id 必须为正整数".to_string());
    }
    let text = text.trim();
    if text.is_empty() {
        return Err("测试消息不能为空".to_string());
    }

    let chat_id_s = chat_id.to_string();

    let script = r#"
const token = process.env.TG_TOKEN || '';
const chatId = process.env.TG_CHAT_ID || '';
const text = process.env.TG_TEXT || '';
if (!token) { console.error(JSON.stringify({ error: 'NO_TOKEN' })); process.exit(1); }
if (!chatId) { console.error(JSON.stringify({ error: 'NO_CHAT_ID' })); process.exit(1); }
(async () => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok !== true) {
      console.error(JSON.stringify({ status: res.status, data }));
      process.exit(1);
    }
    console.log('OK');
  } catch (e) {
    console.error(JSON.stringify({ error: (e && e.message) ? e.message : String(e) }));
    process.exit(1);
  }
})();
"#;

    run_node_script(
        script,
        &[("TG_TOKEN", &token), ("TG_CHAT_ID", &chat_id_s), ("TG_TEXT", text)],
    )
    .map_err(|e| sanitize_secrets(e, &[&token]))?;

    Ok(format!("已发送测试消息到 chat_id={chat_id}"))
}

// ── Feishu / Lark ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_feishu(domain: String, app_id: String, app_secret: String) -> Result<String, String> {
    let (domain, app_id, app_secret) = resolve_feishu_fields(&domain, &app_id, &app_secret)?;

    if app_id.trim().is_empty() {
        return Err("未提供 App ID，且 openclaw.json 未配置".to_string());
    }
    if app_secret.trim().is_empty() {
        return Err("未提供 App Secret，且 openclaw.json 未配置".to_string());
    }

    let script = r#"
const domain = (process.env.FS_DOMAIN || 'feishu').toLowerCase();
const base = domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
const appId = process.env.FS_APP_ID || '';
const appSecret = process.env.FS_APP_SECRET || '';
if (!appId || !appSecret) { console.error(JSON.stringify({ error: 'NO_APP_CRED' })); process.exit(1); }
(async () => {
  try {
    const res = await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.code !== 0) {
      console.error(JSON.stringify({ status: res.status, data }));
      process.exit(1);
    }
    console.log(JSON.stringify({ expire: data.expire || null, tenant_key: data.tenant_key || null }));
  } catch (e) {
    console.error(JSON.stringify({ error: (e && e.message) ? e.message : String(e) }));
    process.exit(1);
  }
})();
"#;

    let raw = run_node_script(
        script,
        &[
            ("FS_DOMAIN", &domain),
            ("FS_APP_ID", &app_id),
            ("FS_APP_SECRET", &app_secret),
        ],
    )
    .map_err(|e| sanitize_secrets(e, &[&app_secret]))?;

    let v: Value = serde_json::from_str(&raw).map_err(|_| "解析响应失败".to_string())?;
    let expire = v.get("expire").and_then(|x| x.as_i64()).unwrap_or(0);

    Ok(format!("飞书/Lark 连接成功（domain: {domain}，token 有效期: {expire}s）"))
}

#[tauri::command]
pub async fn send_feishu_test_message(
    domain: String,
    app_id: String,
    app_secret: String,
    receive_id_type: String,
    receive_id: String,
    text: String,
) -> Result<String, String> {
    let (domain, app_id, app_secret) = resolve_feishu_fields(&domain, &app_id, &app_secret)?;

    let receive_id_type = receive_id_type.trim().to_string();
    let receive_id = receive_id.trim().to_string();
    let text = text.trim().to_string();

    if receive_id_type.is_empty() {
        return Err("receive_id_type 不能为空（例如 open_id / chat_id / user_id / email）".to_string());
    }
    if receive_id.is_empty() {
        return Err("receive_id 不能为空".to_string());
    }
    if text.is_empty() {
        return Err("测试消息不能为空".to_string());
    }

    let script = r#"
const domain = (process.env.FS_DOMAIN || 'feishu').toLowerCase();
const base = domain === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
const appId = process.env.FS_APP_ID || '';
const appSecret = process.env.FS_APP_SECRET || '';
const receiveIdType = process.env.FS_RECEIVE_ID_TYPE || 'open_id';
const receiveId = process.env.FS_RECEIVE_ID || '';
const text = process.env.FS_TEXT || '';
if (!appId || !appSecret) { console.error(JSON.stringify({ error: 'NO_APP_CRED' })); process.exit(1); }
if (!receiveId) { console.error(JSON.stringify({ error: 'NO_RECEIVE_ID' })); process.exit(1); }
(async () => {
  try {
    const tokenRes = await fetch(`${base}/open-apis/auth/v3/tenant_access_token/internal/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const tokenData = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok || !tokenData || tokenData.code !== 0) {
      console.error(JSON.stringify({ status: tokenRes.status, data: tokenData }));
      process.exit(1);
    }
    const token = tokenData.tenant_access_token;

    const url = `${base}/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(receiveIdType)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.code !== 0) {
      console.error(JSON.stringify({ status: res.status, data }));
      process.exit(1);
    }
    const messageId = data?.data?.message_id || null;
    console.log(JSON.stringify({ message_id: messageId }));
  } catch (e) {
    console.error(JSON.stringify({ error: (e && e.message) ? e.message : String(e) }));
    process.exit(1);
  }
})();
"#;

    let raw = run_node_script(
        script,
        &[
            ("FS_DOMAIN", &domain),
            ("FS_APP_ID", &app_id),
            ("FS_APP_SECRET", &app_secret),
            ("FS_RECEIVE_ID_TYPE", &receive_id_type),
            ("FS_RECEIVE_ID", &receive_id),
            ("FS_TEXT", &text),
        ],
    )
    .map_err(|e| sanitize_secrets(e, &[&app_secret]))?;

    let v: Value = serde_json::from_str(&raw).unwrap_or(Value::Object(Map::new()));
    let message_id = v.get("message_id").and_then(|x| x.as_str()).unwrap_or("").trim();
    if message_id.is_empty() {
        return Ok("已发送测试消息".to_string());
    }
    Ok(format!("已发送测试消息（message_id: {message_id}）"))
}
