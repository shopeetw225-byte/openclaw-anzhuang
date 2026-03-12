use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use serde_json::{Map, Value};

pub fn save_config(payload: crate::SaveConfigPayload) -> Result<(), String> {
    let crate::SaveConfigPayload {
        model_primary,
        api_keys,
        telegram_enabled,
        telegram_bot_token,
        telegram_allow_from,
        feishu_enabled,
        feishu_domain,
        feishu_app_id,
        feishu_app_secret,
        feishu_bot_name,
    } = payload;

    let openclaw_dir = openclaw_dir()?;
    fs::create_dir_all(&openclaw_dir)
        .map_err(|e| format!("创建目录失败: {}: {e}", openclaw_dir.display()))?;

    merge_env_file(&openclaw_dir, api_keys)?;

    let config_path = openclaw_dir.join("openclaw.json");
    let backup_path = openclaw_dir.join("openclaw.json.bak");
    let tmp_path = openclaw_dir.join("openclaw.json.tmp");

    // 先备份，再解析（即使 JSON 损坏也能保留原文件）
    if config_path.is_file() {
        fs::copy(&config_path, &backup_path).map_err(|e| {
            format!(
                "备份配置失败: {} -> {}: {e}",
                config_path.display(),
                backup_path.display()
            )
        })?;
    }

    let mut config: Value = if config_path.is_file() {
        let raw = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置失败: {}: {e}", config_path.display()))?;
        match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(e) => {
                // JSON 损坏：继续用空对象写回（相当于“修复”），原文件已备份到 .bak
                eprintln!("config parse failed (will reset): {}: {e}", config_path.display());
                Value::Object(Map::new())
            }
        }
    } else {
        Value::Object(Map::new())
    };

    let model_primary = model_primary.trim().to_string();
    let telegram_bot_token = telegram_bot_token.trim().to_string();

    let existing_bot_token = get_nested_string(&config, &["channels", "telegram", "botToken"]);
    let existing_allow_from = get_nested_i64_vec(&config, &["channels", "telegram", "allowFrom"]);

    let feishu_domain = feishu_domain.trim().to_string();
    let feishu_app_id = feishu_app_id.trim().to_string();
    let feishu_app_secret = feishu_app_secret.trim().to_string();
    let feishu_bot_name = feishu_bot_name.trim().to_string();

    let existing_feishu_domain = get_nested_string(&config, &["channels", "feishu", "domain"]);
    let existing_feishu_app_id = get_nested_string(&config, &["channels", "feishu", "accounts", "main", "appId"]);
    let existing_feishu_app_secret = get_nested_string(&config, &["channels", "feishu", "accounts", "main", "appSecret"]);
    let existing_feishu_bot_name = get_nested_string(&config, &["channels", "feishu", "accounts", "main", "botName"]);

    set_nested(
        &mut config,
        &["agents", "defaults", "model", "primary"],
        Value::String(model_primary),
    );

    if !telegram_enabled {
        set_nested(
            &mut config,
            &["channels", "telegram", "enabled"],
            Value::Bool(false),
        );
        set_nested(
            &mut config,
            &["channels", "telegram", "botToken"],
            Value::String(String::new()),
        );
        set_nested(
            &mut config,
            &["channels", "telegram", "allowFrom"],
            Value::Array(Vec::new()),
        );
    } else {
        let bot_token_to_write = if !telegram_bot_token.is_empty() {
            telegram_bot_token
        } else {
            existing_bot_token.unwrap_or_default()
        };

        if bot_token_to_write.trim().is_empty() {
            return Err("已启用 Telegram，但未填写 Bot Token".to_string());
        }

        let allow_from_to_write = if !telegram_allow_from.is_empty() {
            telegram_allow_from
        } else {
            existing_allow_from.unwrap_or_default()
        };

        if allow_from_to_write.is_empty() {
            return Err("已启用 Telegram，但未填写允许的用户 ID（AllowFrom）".to_string());
        }

        set_nested(
            &mut config,
            &["channels", "telegram", "enabled"],
            Value::Bool(true),
        );
        set_nested(
            &mut config,
            &["channels", "telegram", "botToken"],
            Value::String(bot_token_to_write),
        );
        set_nested(
            &mut config,
            &["channels", "telegram", "allowFrom"],
            serde_json::to_value(allow_from_to_write).unwrap_or(Value::Array(Vec::new())),
        );
    }

    // ── Feishu / Lark ───────────────────────────────────────────────────────

    if !feishu_enabled {
        // 仅在已存在飞书配置时写入 enabled=false，避免给旧版 OpenClaw 写入未知字段
        if get_nested_value(&config, &["channels", "feishu"]).is_some() {
            set_nested(
                &mut config,
                &["channels", "feishu", "enabled"],
                Value::Bool(false),
            );
        }
    } else {
        let domain_to_write = if !feishu_domain.is_empty() {
            feishu_domain
        } else {
            existing_feishu_domain.unwrap_or_else(|| "feishu".to_string())
        };

        let app_id_to_write = if !feishu_app_id.is_empty() {
            feishu_app_id
        } else {
            existing_feishu_app_id.unwrap_or_default()
        };

        let app_secret_to_write = if !feishu_app_secret.is_empty() {
            feishu_app_secret
        } else {
            existing_feishu_app_secret.unwrap_or_default()
        };

        if app_id_to_write.trim().is_empty() {
            return Err("已启用飞书/Lark，但未填写 App ID".to_string());
        }
        if app_secret_to_write.trim().is_empty() {
            return Err("已启用飞书/Lark，但未填写 App Secret".to_string());
        }

        let bot_name_to_write = if !feishu_bot_name.is_empty() {
            feishu_bot_name
        } else {
            existing_feishu_bot_name.unwrap_or_default()
        };

        set_nested(
            &mut config,
            &["channels", "feishu", "enabled"],
            Value::Bool(true),
        );
        set_nested(
            &mut config,
            &["channels", "feishu", "domain"],
            Value::String(domain_to_write),
        );
        set_nested(
            &mut config,
            &["channels", "feishu", "accounts", "main", "appId"],
            Value::String(app_id_to_write),
        );
        set_nested(
            &mut config,
            &["channels", "feishu", "accounts", "main", "appSecret"],
            Value::String(app_secret_to_write),
        );
        if !bot_name_to_write.trim().is_empty() {
            set_nested(
                &mut config,
                &["channels", "feishu", "accounts", "main", "botName"],
                Value::String(bot_name_to_write),
            );
        }
    }

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化 JSON 失败: {e}"))?;
    fs::write(&tmp_path, json)
        .map_err(|e| format!("写入临时文件失败: {}: {e}", tmp_path.display()))?;

    replace_file(&tmp_path, &config_path)
        .map_err(|e| format!("写入配置失败: {}: {e}", config_path.display()))?;

    // openclaw.json 里可能包含敏感字段（如 Telegram botToken、飞书 appSecret），尽量收紧权限
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&config_path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn replace_file(src: &Path, dest: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        if dest.is_file() {
            fs::remove_file(dest)?;
        }
    }
    fs::rename(src, dest)
}

pub fn load_config_snapshot() -> Result<crate::ConfigSnapshot, String> {
    let dir = openclaw_dir()?;
    let config_path = dir.join("openclaw.json");

    let config: Value = if config_path.is_file() {
        let raw = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置失败: {}: {e}", config_path.display()))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("解析 JSON 失败: {}: {e}", config_path.display()))?
    } else {
        Value::Object(Map::new())
    };

    let model_primary = get_nested_string(&config, &["agents", "defaults", "model", "primary"]);
    let telegram_enabled = get_nested_bool(&config, &["channels", "telegram", "enabled"]).unwrap_or(false);
    let telegram_bot_token_set = get_nested_string(&config, &["channels", "telegram", "botToken"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let telegram_allow_from = get_nested_i64_vec(&config, &["channels", "telegram", "allowFrom"])
        .unwrap_or_default();

    let feishu_enabled = get_nested_bool(&config, &["channels", "feishu", "enabled"]).unwrap_or(false);
    let feishu_domain = get_nested_string(&config, &["channels", "feishu", "domain"]);
    let feishu_app_id_set = get_nested_string(&config, &["channels", "feishu", "accounts", "main", "appId"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let feishu_app_secret_set = get_nested_string(&config, &["channels", "feishu", "accounts", "main", "appSecret"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let feishu_bot_name = get_nested_string(&config, &["channels", "feishu", "accounts", "main", "botName"])
        .and_then(|s| if s.trim().is_empty() { None } else { Some(s) });

    let env_keys_present = read_env_keys_present(&dir).unwrap_or_default();

    Ok(crate::ConfigSnapshot {
        model_primary,
        telegram_enabled,
        telegram_bot_token_set,
        telegram_allow_from,
        env_keys_present,
        feishu_enabled,
        feishu_domain,
        feishu_app_id_set,
        feishu_app_secret_set,
        feishu_bot_name,
    })
}

fn merge_env_file(dir: &Path, api_keys: HashMap<String, String>) -> Result<(), String> {
    if api_keys.is_empty() {
        return Ok(());
    }

    let env_path = dir.join(".env");

    let mut merged = read_env_as_map(&env_path).unwrap_or_default();

    let mut content = String::new();
    for (key, value) in api_keys {
        let key = key.trim().to_string();
        let value = value.trim().to_string();
        if key.is_empty() {
            continue;
        }
        if value.is_empty() {
            merged.remove(&key);
        } else {
            merged.insert(key, value);
        }
    }

    let mut entries: Vec<(String, String)> = merged.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    for (key, value) in entries {
        let safe_value = value.replace('\n', "\\n");
        content.push_str(&format!("{key}={safe_value}\n"));
    }

    fs::write(&env_path, content)
        .map_err(|e| format!("写入 .env 失败: {}: {e}", env_path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&env_path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn read_env_as_map(env_path: &Path) -> Result<HashMap<String, String>, String> {
    if !env_path.is_file() {
        return Ok(HashMap::new());
    }

    let raw = fs::read_to_string(env_path)
        .map_err(|e| format!("读取 .env 失败: {}: {e}", env_path.display()))?;

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
        if key.is_empty() {
            continue;
        }

        map.insert(key.to_string(), v.to_string());
    }

    Ok(map)
}

fn read_env_keys_present(dir: &Path) -> Result<Vec<String>, String> {
    let env_path = dir.join(".env");
    let map = read_env_as_map(&env_path)?;
    let mut keys: Vec<String> = map.keys().cloned().collect();
    keys.sort();
    Ok(keys)
}

fn set_nested(root: &mut Value, path: &[&str], value: Value) {
    if path.is_empty() {
        return;
    }

    let mut cursor = root;
    for key in &path[..path.len() - 1] {
        if !cursor.is_object() {
            *cursor = Value::Object(Map::new());
        }

        let obj = cursor.as_object_mut().expect("cursor must be an object");
        cursor = obj
            .entry(key.to_string())
            .or_insert_with(|| Value::Object(Map::new()));
    }

    if !cursor.is_object() {
        *cursor = Value::Object(Map::new());
    }

    if let Some(obj) = cursor.as_object_mut() {
        obj.insert(path[path.len() - 1].to_string(), value);
    }
}

fn openclaw_dir() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "无法获取用户目录（HOME/USERPROFILE）".to_string())?;
    Ok(home.join(".openclaw"))
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

fn get_nested_bool(root: &Value, path: &[&str]) -> Option<bool> {
    get_nested_value(root, path).and_then(|v| v.as_bool())
}

fn get_nested_i64_vec(root: &Value, path: &[&str]) -> Option<Vec<i64>> {
    let arr = get_nested_value(root, path)?.as_array()?;
    let mut out = Vec::new();
    for v in arr {
        if let Some(n) = v.as_i64() {
            out.push(n);
            continue;
        }
        if let Some(n) = v.as_u64() {
            out.push(n.min(i64::MAX as u64) as i64);
            continue;
        }
        if let Some(s) = v.as_str() {
            if let Ok(n) = s.trim().parse::<i64>() {
                out.push(n);
            }
        }
    }
    Some(out)
}
