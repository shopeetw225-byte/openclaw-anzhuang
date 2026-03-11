use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::core::process_runner;
use tauri::Manager;

#[tauri::command]
pub async fn run_install(app: tauri::AppHandle, script_name: String) -> Result<(), String> {
    let script_name = script_name.trim().to_string();
    if script_name.is_empty() {
        return Err("脚本名称不能为空".to_string());
    }
    if script_name.contains('\\') {
        return Err("脚本路径不支持反斜杠，请使用 /".to_string());
    }
    if script_name.contains("..") {
        return Err("脚本路径不允许包含 ..".to_string());
    }
    if script_name.starts_with('/') {
        return Err("脚本路径不允许使用绝对路径".to_string());
    }
    if script_name.contains(':') {
        return Err("脚本路径不允许包含盘符（例如 C:）".to_string());
    }

    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("无法获取资源目录: {e}"))?;

    let script_path = resolve_script_path(&resource_dir, &script_name)
        .ok_or_else(|| format!("找不到脚本: {script_name}"))?;

    let ext = script_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "sh" => {
            make_executable(&script_path)?;
            #[cfg(target_os = "windows")]
            {
                process_runner::run_wsl_bash_script(&app, &script_path)
            }
            #[cfg(not(target_os = "windows"))]
            {
                process_runner::run_bash_script(&app, &script_path)
            }
        }
        "ps1" => {
            #[cfg(target_os = "windows")]
            {
                process_runner::run_powershell_script(&app, &script_path)
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err("当前平台不支持执行 .ps1 脚本".to_string())
            }
        }
        _ => Err(format!("不支持的脚本类型: .{ext}")),
    }
}

fn resolve_script_path(resource_dir: &Path, script_name: &str) -> Option<PathBuf> {
    let direct = resource_dir.join(script_name);
    if direct.is_file() {
        return Some(direct);
    }

    let in_scripts = resource_dir.join("scripts").join(script_name);
    if in_scripts.is_file() {
        return Some(in_scripts);
    }

    None
}

fn make_executable(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let meta = fs::metadata(path)
            .map_err(|e| format!("读取脚本失败: {}: {e}", path.display()))?;
        let mut perms = meta.permissions();
        perms.set_mode(perms.mode() | 0o111);
        fs::set_permissions(path, perms)
            .map_err(|e| format!("chmod +x 失败: {}: {e}", path.display()))?;
    }
    Ok(())
}
