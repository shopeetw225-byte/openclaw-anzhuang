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
                process_runner::run_bash_script(&app, &script_path, &[])
            }
        }
        "ps1" => {
            #[cfg(target_os = "windows")]
            {
                process_runner::run_powershell_script(&app, &script_path, &[])
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

/// 卸载 OpenClaw。
/// 参数：
/// - purge: 删除 ~/.openclaw 数据目录
/// - dry_run: 仅扫描不删除
/// - select_mode: 逐项选择
#[tauri::command]
pub async fn run_uninstall(
    app: tauri::AppHandle,
    purge: bool,
    dry_run: Option<bool>,
    select_mode: Option<bool>,
) -> Result<(), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("无法获取资源目录: {e}"))?;

    let mut extra_args = Vec::new();

    // 处理参数
    if dry_run.unwrap_or(false) {
        #[cfg(target_os = "windows")]
        extra_args.push("-DryRun");
        #[cfg(not(target_os = "windows"))]
        extra_args.push("--dry-run");
    }

    if !purge && !dry_run.unwrap_or(false) {
        #[cfg(target_os = "windows")]
        extra_args.push("-KeepConfig");
        #[cfg(not(target_os = "windows"))]
        extra_args.push("--keep-config");
    }

    if select_mode.unwrap_or(false) {
        #[cfg(target_os = "windows")]
        extra_args.push("-Select");
        #[cfg(not(target_os = "windows"))]
        extra_args.push("--select");
    }

    #[cfg(target_os = "windows")]
    {
        let script_path = resolve_script_path(&resource_dir, "windows/uninstall-openclaw.ps1")
            .ok_or_else(|| "找不到卸载脚本 windows/uninstall-openclaw.ps1".to_string())?;
        let extra_strs: Vec<&str> = extra_args.iter().map(|s| *s).collect();
        process_runner::run_powershell_script(&app, &script_path, &extra_strs)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let script_path = resolve_script_path(&resource_dir, "uninstall-openclaw.sh")
            .ok_or_else(|| "找不到卸载脚本 uninstall-openclaw.sh".to_string())?;
        make_executable(&script_path)?;
        let extra_strs: Vec<&str> = extra_args.iter().map(|s| *s).collect();
        process_runner::run_bash_script(&app, &script_path, &extra_strs)
    }
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
