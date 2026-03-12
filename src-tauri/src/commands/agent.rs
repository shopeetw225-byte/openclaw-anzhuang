use std::{collections::HashMap, fs, path::PathBuf};

// ── Agent 配置结构 ────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct AgentConfig {
    pub provider: String,   // "anthropic" | "openai_compat"
    pub base_url: String,   // OpenAI 兼容模式的 API 基础 URL
    pub model: String,
    pub max_tokens: u32,
    pub api_key_set: bool,
}

/// 读取 AI 助手配置（~/.openclaw/agent.json）
#[tauri::command]
pub async fn get_agent_config() -> Result<AgentConfig, String> {
    let home = home_dir()?;
    let agent_json = home.join(".openclaw").join("agent.json");

    let (provider, base_url, model, max_tokens) = if agent_json.is_file() {
        let raw = fs::read_to_string(&agent_json)
            .map_err(|e| format!("读取 agent.json 失败: {e}"))?;
        let v: serde_json::Value = serde_json::from_str(&raw)
            .unwrap_or(serde_json::Value::Object(Default::default()));
        let p = v.get("provider").and_then(|x| x.as_str()).unwrap_or("anthropic").to_string();
        let u = v.get("base_url").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let m = v.get("model").and_then(|x| x.as_str()).unwrap_or("claude-sonnet-4-6").to_string();
        let t = v.get("max_tokens").and_then(|x| x.as_u64()).unwrap_or(4096) as u32;
        (p, u, m, t)
    } else {
        ("anthropic".to_string(), "".to_string(), "claude-sonnet-4-6".to_string(), 4096)
    };

    let _ = migrate_agent_api_key_best_effort();
    let env_path = agent_env_path()?;
    let api_key_set = if env_path.is_file() {
        read_env_as_map(&env_path)
            .ok()
            .map(|m| {
                m.get("AGENT_API_KEY").map(|v| !v.trim().is_empty()).unwrap_or(false)
                    || m.get("ANTHROPIC_API_KEY").map(|v| !v.trim().is_empty()).unwrap_or(false)
            })
            .unwrap_or(false)
    } else {
        false
    };

    Ok(AgentConfig { provider, base_url, model, max_tokens, api_key_set })
}

/// 保存 AI 助手配置（model + max_tokens + provider + base_url 到 agent.json，api_key 到 agent.env）
#[tauri::command]
pub async fn save_agent_config(
    provider: String,
    base_url: String,
    model: String,
    max_tokens: u32,
    api_key: String,
) -> Result<(), String> {
    let home = home_dir()?;
    let dir = home.join(".openclaw");
    fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败: {e}"))?;

    // 保存 agent.json
    let cfg = serde_json::json!({
        "provider": provider.trim(),
        "base_url": base_url.trim(),
        "model": model.trim(),
        "max_tokens": max_tokens,
    });
    fs::write(
        dir.join("agent.json"),
        serde_json::to_string_pretty(&cfg).unwrap(),
    )
    .map_err(|e| format!("保存 agent.json 失败: {e}"))?;

    // 更新 agent.env 中的 AGENT_API_KEY（如果提供）
    let key = api_key.trim();
    if !key.is_empty() {
        let env_path = agent_env_path()?;
        let mut map = read_env_as_map(&env_path).unwrap_or_default();
        map.insert("AGENT_API_KEY".to_string(), key.to_string());

        let mut entries: Vec<(String, String)> = map.into_iter().collect();
        entries.sort_by(|a, b| a.0.cmp(&b.0));
        let content: String = entries.iter().map(|(k, v)| format!("{k}={v}\n")).collect();

        fs::write(&env_path, content)
            .map_err(|e| format!("保存 API Key 失败: {e}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&env_path, fs::Permissions::from_mode(0o600));
        }
    }

    Ok(())
}

/// 读取 Agent 专用 API Key（~/.openclaw/agent.env，与主配置完全分离）
#[tauri::command]
pub async fn get_agent_api_key() -> Result<String, String> {
    let _ = migrate_agent_api_key_best_effort();
    let env_path = agent_env_path()?;

    if env_path.is_file() {
        let map = read_env_as_map(&env_path)?;
        if let Some(v) = map
            .get("AGENT_API_KEY")
            .filter(|v| !v.trim().is_empty())
            .or_else(|| map.get("ANTHROPIC_API_KEY").filter(|v| !v.trim().is_empty()))
        {
            return Ok(v.trim().to_string());
        }
    }

    // 兼容旧版本：如果 Key 曾误写入 ~/.openclaw/.env，则读出并尝试迁移到 agent.env
    let legacy_env_path = openclaw_dotenv_path()?;
    if legacy_env_path.is_file() {
        if let Ok(map) = read_env_as_map(&legacy_env_path) {
            if let Some(v) = map
                .get("AGENT_API_KEY")
                .filter(|v| !v.trim().is_empty())
            {
                let _ = migrate_agent_api_key_best_effort();
                return Ok(v.trim().to_string());
            }
        }
    }

    Err("未配置 API Key，请在「AI 助手配置」中填写".to_string())
}

/// 执行受限的诊断 shell 命令（由 Agent 调用，用户授权后执行）
///
/// 安全策略：
/// - 拒绝管道、分号、重定向等 shell 特殊字符
/// - 仅允许白名单程序（npm、node、which、ls、cat、launchctl、systemctl、openclaw、echo）
/// - cat/ls 只允许访问 ~/.openclaw/ 目录
/// - 不允许 sudo
/// - 输出截断至 4000 字节
#[tauri::command]
pub async fn execute_agent_shell(cmd: String) -> Result<String, String> {
    let cmd = cmd.trim();

    // ── 安全检查：拒绝 shell 特殊字符 ───────────────────────────────────────
    for banned in &["|", ";", "&&", "||", "`", "$(", ">", "<", "\n", "\r"] {
        if cmd.contains(banned) {
            return Err(format!("命令中包含不允许的字符: {banned}"));
        }
    }

    // ── 拆分命令和参数 ───────────────────────────────────────────────────────
    let parts: Vec<String> = cmd.split_whitespace().map(|s| expand_home(s)).collect();
    if parts.is_empty() {
        return Err("命令不能为空".to_string());
    }

    let program_name = &parts[0];
    let args: Vec<&str> = parts[1..].iter().map(|s| s.as_str()).collect();

    // ── 不允许 sudo ──────────────────────────────────────────────────────────
    if program_name == "sudo" || args.contains(&"sudo") {
        return Err("不允许使用 sudo".to_string());
    }

    // ── 白名单程序 ───────────────────────────────────────────────────────────
    const ALLOWED: &[&str] = &[
        "npm", "node", "which", "ls", "cat", "launchctl", "systemctl", "openclaw", "echo", "npx",
        "ps", "lsof", "brew", "top", "df", "du", "whoami", "hostname", "uname",
        "sw_vers", "ifconfig", "netstat", "curl", "ping", "head", "tail",
        "grep", "find", "wc", "sort", "mkdir", "cp", "mv", "rm", "touch", "chmod", "chown",
    ];

    let bare_name = std::path::Path::new(program_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(program_name);

    if !ALLOWED.contains(&bare_name) {
        return Err(format!(
            "不允许执行程序: {bare_name}（允许: {}）",
            ALLOWED.join(", ")
        ));
    }

    // ── cat/ls 路径限制 ──────────────────────────────────────────────────────
    if bare_name == "cat" || bare_name == "ls" {
        let home = std::env::var("HOME").unwrap_or_default();
        let allowed_prefix = format!("{home}/.openclaw");
        for arg in &args {
            let expanded = expand_home(arg);
            if expanded.starts_with('/') && !expanded.starts_with(&allowed_prefix) {
                return Err(format!(
                    "cat/ls 只允许访问 ~/.openclaw/ 目录，拒绝: {arg}"
                ));
            }
        }
    }

    // ── 查找程序路径 ─────────────────────────────────────────────────────────
    let program_path = locate_program(program_name)?;

    // ── 构建 PATH（注入 node bin 目录）───────────────────────────────────────
    let base_path = std::env::var("PATH").unwrap_or_default();
    let injected_path = match crate::core::platform::node_bin_dir() {
        Some(dir) => format!("{}:{base_path}", dir.display()),
        None => base_path,
    };

    // ── 执行 ─────────────────────────────────────────────────────────────────
    let output = std::process::Command::new(&program_path)
        .args(&args)
        .env("PATH", &injected_path)
        .output()
        .map_err(|e| format!("执行失败: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let mut result = stdout.trim().to_string();
    if !stderr.trim().is_empty() {
        if !result.is_empty() {
            result.push('\n');
        }
        result.push_str(&format!("[stderr] {}", stderr.trim()));
    }
    if result.is_empty() {
        result = if output.status.success() {
            "(命令执行成功，无输出)".to_string()
        } else {
            format!("(退出码: {:?})", output.status.code())
        };
    }

    // 截断超长输出
    if result.len() > 4000 {
        result = format!("{}…[已截断，原长 {} 字节]", &result[..3900], result.len());
    }

    Ok(result)
}

/// 执行需要管理员权限的 shell 命令（由 Agent 调用，用户授权后执行）
///
/// 安全策略：
/// - 拒绝管道、分号、重定向等 shell 特殊字符
/// - 仅允许白名单程序（chown、chmod、npm、kill、killall、rm、mkdir、mv、cp、ln）
/// - rm 不允许 -rf /（防止误删系统）
/// - macOS：通过 osascript 弹出系统密码对话框
/// - Linux：通过 pkexec 提权执行
/// - Windows：提示用户以管理员身份运行应用
/// - 输出截断至 4000 字节
#[tauri::command]
pub async fn execute_agent_sudo_shell(cmd: String) -> Result<String, String> {
    let cmd = cmd.trim();

    // ── 安全检查：拒绝 shell 特殊字符 ───────────────────────────────────────
    for banned in &["|", ";", "&&", "||", "`", "$(", ">", "<", "\n", "\r"] {
        if cmd.contains(banned) {
            return Err(format!("命令中包含不允许的字符: {banned}"));
        }
    }

    // ── 去掉可能携带的 sudo 前缀 ─────────────────────────────────────────────
    let cmd = cmd.strip_prefix("sudo ").unwrap_or(cmd).trim();

    // ── 拆分命令和参数 ───────────────────────────────────────────────────────
    let parts: Vec<String> = cmd.split_whitespace().map(|s| expand_home(s)).collect();
    if parts.is_empty() {
        return Err("命令不能为空".to_string());
    }

    let program_name = &parts[0];

    // ── 白名单程序（提权专用） ────────────────────────────────────────────────
    const SUDO_ALLOWED: &[&str] = &[
        "chown", "chmod", "npm", "kill", "killall", "rm", "mkdir", "mv", "cp", "ln",
        "launchctl", "systemctl", "brew", "lsof", "netstat",
    ];

    let bare_name = std::path::Path::new(program_name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(program_name);

    if !SUDO_ALLOWED.contains(&bare_name) {
        return Err(format!(
            "不允许提权执行程序: {bare_name}（允许: {}）",
            SUDO_ALLOWED.join(", ")
        ));
    }

    // ── rm 安全检查：禁止 -rf / 或 /* ─────────────────────────────────────
    if bare_name == "rm" {
        let args_str = parts[1..].join(" ");
        let dangerous = ["-rf /", "-rf /*", "-rf ~/", "/ ", "/* "];
        for d in &dangerous {
            if args_str.contains(d) || args_str.ends_with(d.trim()) {
                return Err("不允许递归删除根目录或家目录".to_string());
            }
        }
    }

    // ── 执行（平台分支） ─────────────────────────────────────────────────────

    #[cfg(target_os = "macos")]
    {
        // osascript 会弹出 macOS 系统密码对话框
        // 用单引号包裹命令，对命令内部的单引号进行转义
        let escaped = cmd.replace('\'', "'\\''");
        let script = format!("do shell script '{escaped}' with administrator privileges");
        let output = std::process::Command::new("osascript")
            .args(["-e", &script])
            .output()
            .map_err(|e| format!("执行 osascript 失败: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            // 用户取消密码输入时 osascript 返回 -128
            if stderr.contains("-128") || stderr.contains("User canceled") {
                return Err("用户取消了密码输入".to_string());
            }
            let msg = if !stderr.is_empty() { stderr } else { format!("退出码: {:?}", output.status.code()) };
            return Err(format!("命令执行失败: {msg}"));
        }

        let mut result = stdout;
        if result.is_empty() {
            result = "(命令执行成功，无输出)".to_string();
        }
        if result.len() > 4000 {
            result = format!("{}…[已截断，原长 {} 字节]", &result[..3900], result.len());
        }
        return Ok(result);
    }

    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("pkexec")
            .args(["--user", "root", "/bin/sh", "-c", cmd])
            .output()
            .map_err(|e| format!("执行 pkexec 失败: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            if output.status.code() == Some(126) || output.status.code() == Some(127) {
                return Err("用户取消了授权或 pkexec 不可用".to_string());
            }
            let msg = if !stderr.is_empty() { stderr } else { format!("退出码: {:?}", output.status.code()) };
            return Err(format!("命令执行失败: {msg}"));
        }

        let mut result = stdout;
        if !stderr.is_empty() && result.is_empty() {
            result = stderr;
        }
        if result.is_empty() {
            result = "(命令执行成功，无输出)".to_string();
        }
        if result.len() > 4000 {
            result = format!("{}…[已截断，原长 {} 字节]", &result[..3900], result.len());
        }
        return Ok(result);
    }

    #[cfg(target_os = "windows")]
    {
        return Err("Windows 暂不支持提权执行。请以管理员身份重新启动本应用后操作。".to_string());
    }

    #[allow(unreachable_code)]
    Err("当前平台不支持提权执行".to_string())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn home_dir() -> Result<PathBuf, String> {
    std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法获取用户目录（HOME/USERPROFILE）".to_string())
}

/// Agent 专用 API Key 文件（与 OpenClaw 主配置 ~/.openclaw/.env 完全分离）
fn agent_env_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".openclaw").join("agent.env"))
}

fn openclaw_dotenv_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".openclaw").join(".env"))
}

/// 兼容旧版本：如果 Key 曾误写入 ~/.openclaw/.env，则迁移到 agent.env
fn migrate_agent_api_key_best_effort() -> Result<(), String> {
    let agent_env = agent_env_path()?;

    // 已在 agent.env 配置过则无需迁移
    if agent_env.is_file() {
        if let Ok(m) = read_env_as_map(&agent_env) {
            if m.get("AGENT_API_KEY").map(|v| !v.trim().is_empty()).unwrap_or(false) {
                return Ok(());
            }
        }
    }

    let legacy = openclaw_dotenv_path()?;
    if !legacy.is_file() {
        return Ok(());
    }

    let legacy_map = match read_env_as_map(&legacy) {
        Ok(m) => m,
        Err(_) => return Ok(()),
    };

    let Some(key) = legacy_map
        .get("AGENT_API_KEY")
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
    else {
        return Ok(());
    };

    let mut map = if agent_env.is_file() {
        read_env_as_map(&agent_env).unwrap_or_default()
    } else {
        HashMap::new()
    };

    if map.get("AGENT_API_KEY").map(|v| !v.trim().is_empty()).unwrap_or(false) {
        return Ok(());
    }

    map.insert("AGENT_API_KEY".to_string(), key);

    let mut entries: Vec<(String, String)> = map.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let content: String = entries.iter().map(|(k, v)| format!("{k}={v}\n")).collect();

    if let Some(parent) = agent_env.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let _ = fs::write(&agent_env, content);

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&agent_env, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn read_env_as_map(env_path: &std::path::Path) -> Result<HashMap<String, String>, String> {
    let raw = fs::read_to_string(env_path).map_err(|e| format!("读取 .env 失败: {e}"))?;
    let mut map = HashMap::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line);
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let key = k.trim();
        if !key.is_empty() {
            map.insert(key.to_string(), v.to_string());
        }
    }
    Ok(map)
}

fn expand_home(s: &str) -> String {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    if s == "~" {
        return home;
    }
    if let Some(rest) = s.strip_prefix("~/") {
        return format!("{home}/{rest}");
    }
    s.to_string()
}

/// 在 PATH 及常用目录中查找程序路径
fn locate_program(name: &str) -> Result<String, String> {
    // 已经是绝对路径
    if name.starts_with('/') {
        return Ok(name.to_string());
    }

    let path_env = std::env::var("PATH").unwrap_or_default();

    // 额外搜索目录（常见 node 安装位置）
    let extra = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin",
    ];

    for dir in path_env.split(':').chain(extra.iter().copied()) {
        let candidate = std::path::Path::new(dir).join(name);
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }

    // 检查 node bin 目录
    if let Some(node_bin) = crate::core::platform::node_bin_dir() {
        let candidate = node_bin.join(name);
        if candidate.is_file() {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }

    Err(format!("找不到程序: {name}"))
}
