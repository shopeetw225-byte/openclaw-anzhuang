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
    } = payload;

    let openclaw_dir = openclaw_dir()?;
    fs::create_dir_all(&openclaw_dir)
        .map_err(|e| format!("创建目录失败: {}: {e}", openclaw_dir.display()))?;

    write_env_file(&openclaw_dir, api_keys)?;

    let config_path = openclaw_dir.join("openclaw.json");
    let backup_path = openclaw_dir.join("openclaw.json.bak");
    let tmp_path = openclaw_dir.join("openclaw.json.tmp");

    let mut config: Value = if config_path.is_file() {
        let raw = fs::read_to_string(&config_path)
            .map_err(|e| format!("读取配置失败: {}: {e}", config_path.display()))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("解析 JSON 失败: {}: {e}", config_path.display()))?
    } else {
        Value::Object(Map::new())
    };

    if config_path.is_file() {
        fs::copy(&config_path, &backup_path).map_err(|e| {
            format!(
                "备份配置失败: {} -> {}: {e}",
                config_path.display(),
                backup_path.display()
            )
        })?;
    }

    set_nested(
        &mut config,
        &["agents", "defaults", "model", "primary"],
        Value::String(model_primary),
    );
    set_nested(
        &mut config,
        &["channels", "telegram", "enabled"],
        Value::Bool(telegram_enabled),
    );
    set_nested(
        &mut config,
        &["channels", "telegram", "botToken"],
        Value::String(telegram_bot_token),
    );
    set_nested(
        &mut config,
        &["channels", "telegram", "allowFrom"],
        serde_json::to_value(telegram_allow_from).unwrap_or(Value::Array(Vec::new())),
    );

    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("序列化 JSON 失败: {e}"))?;
    fs::write(&tmp_path, json)
        .map_err(|e| format!("写入临时文件失败: {}: {e}", tmp_path.display()))?;

    fs::rename(&tmp_path, &config_path)
        .map_err(|e| format!("写入配置失败: {}: {e}", config_path.display()))?;

    Ok(())
}

fn write_env_file(dir: &Path, api_keys: HashMap<String, String>) -> Result<(), String> {
    let env_path = dir.join(".env");

    let mut entries: Vec<(String, String)> = api_keys.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));

    let mut content = String::new();
    for (key, value) in entries {
        let key = key.trim().to_string();
        if key.is_empty() {
            continue;
        }
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
        .map(PathBuf::from)
        .ok_or_else(|| "无法获取 HOME 目录".to_string())?;
    Ok(home.join(".openclaw"))
}

