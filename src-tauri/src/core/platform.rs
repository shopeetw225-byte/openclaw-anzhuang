use std::{
    env,
    fs,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};

const GATEWAY_PORT: u16 = 18_789;

pub fn collect_system_info() -> crate::SystemInfo {
    let os_name = {
        #[cfg(target_os = "macos")]
        {
            match run_command_simple("uname", &["-r"]) {
                Some(release) if !release.is_empty() => format!("macOS {release}"),
                _ => "macOS".to_string(),
            }
        }
        #[cfg(target_os = "linux")]
        {
            linux_pretty_name().unwrap_or_else(|| "Linux".to_string())
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        {
            env::consts::OS.to_string()
        }
    };

    let arch = env::consts::ARCH.to_string();
    let node_path = resolve_node();
    let npm_path = resolve_npm(&node_path);
    let openclaw_path = resolve_openclaw(&node_path);

    let node_version = node_path
        .as_deref()
        .and_then(|p| run_command_at(p, &["-v"]));
    let npm_version = npm_path
        .as_deref()
        .and_then(|p| run_command_at(p, &["-v"]));

    let openclaw_version = openclaw_path
        .as_deref()
        .and_then(|p| run_command_at(p, &["--version"]));

    let openclaw_installed = openclaw_path.is_some();
    let gateway_running = is_port_listening(GATEWAY_PORT);
    let homebrew_available = resolve_executable("brew", &[]).is_some();

    // Linux 额外字段
    #[cfg(target_os = "linux")]
    let (distro_id, systemd_available) = (linux_distro_id(), is_systemd_available());
    #[cfg(not(target_os = "linux"))]
    let (distro_id, systemd_available) = (None::<String>, false);

    let disk_free_mb = disk_free_mb();

    #[cfg(target_os = "windows")]
    let (powershell_version, wsl_state, wsl_default_distro, wsl_has_ubuntu, windows_admin) =
        windows_collect_install_prereq();

    #[cfg(not(target_os = "windows"))]
    let (powershell_version, wsl_state, wsl_default_distro, wsl_has_ubuntu, windows_admin) =
        (None::<String>, None::<String>, None::<String>, false, false);

    crate::SystemInfo {
        os_name,
        arch,
        node_version,
        npm_version,
        openclaw_version,
        openclaw_installed,
        gateway_running,
        gateway_port: GATEWAY_PORT,
        homebrew_available,
        disk_free_mb,
        distro_id,
        systemd_available,
        powershell_version,
        wsl_state,
        wsl_default_distro,
        wsl_has_ubuntu,
        windows_admin,
    }
}

pub fn collect_openclaw_status() -> crate::OpenClawStatus {
    let node_path = resolve_node();
    let openclaw_path = resolve_openclaw(&node_path);
    let version = openclaw_path
        .as_deref()
        .and_then(|p| run_command_at(p, &["--version"]));

    crate::OpenClawStatus {
        installed: openclaw_path.is_some(),
        version,
        gateway_running: is_port_listening(GATEWAY_PORT),
    }
}

fn run_command_simple(cmd: &str, args: &[&str]) -> Option<String> {
    std::process::Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn run_command_at(cmd: &Path, args: &[&str]) -> Option<String> {
    std::process::Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn is_port_listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn disk_free_mb() -> u64 {
    let home = home_dir().unwrap_or_else(|| PathBuf::from("."));
    let Some(home_str) = home.to_str() else {
        return 0;
    };

    // df -Pk prints Available in 1024-byte blocks (KB)
    let out = match run_command_simple("df", &["-Pk", home_str]) {
        Some(v) => v,
        None => return 0,
    };

    let mut lines = out.lines();
    let _header = lines.next();
    let Some(data_line) = lines.next() else {
        return 0;
    };
    let cols: Vec<&str> = data_line.split_whitespace().collect();
    if cols.len() < 4 {
        return 0;
    }

    let available_kb: u64 = match cols[3].parse() {
        Ok(v) => v,
        Err(_) => return 0,
    };

    available_kb / 1024
}

fn resolve_node() -> Option<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from("/usr/local/bin/node"));
        candidates.push(PathBuf::from("/opt/homebrew/bin/node"));
    }

    #[cfg(target_os = "linux")]
    {
        candidates.extend(linux_node_candidates());
    }

    candidates.extend(nvm_bin_candidates("node"));
    resolve_executable("node", &candidates)
}

fn resolve_npm(node_path: &Option<PathBuf>) -> Option<PathBuf> {
    if let Some(node) = node_path {
        if let Some(bin_dir) = node.parent() {
            let npm = bin_dir.join("npm");
            if npm.is_file() {
                return Some(npm);
            }
        }
    }

    let mut candidates = Vec::new();
    candidates.push(PathBuf::from("/usr/local/bin/npm"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/npm"));
    candidates.extend(nvm_bin_candidates("npm"));
    resolve_executable("npm", &candidates)
}

fn resolve_openclaw(node_path: &Option<PathBuf>) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    candidates.push(PathBuf::from("/usr/local/bin/openclaw"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/openclaw"));

    if let Some(home) = home_dir() {
        candidates.push(home.join(".npm-global/bin/openclaw"));
        candidates.push(home.join(".volta/bin/openclaw"));
        candidates.push(home.join(".local/bin/openclaw"));
    }

    if let Some(node) = node_path {
        if let Some(bin_dir) = node.parent() {
            let openclaw = bin_dir.join("openclaw");
            if openclaw.is_file() {
                candidates.insert(0, openclaw);
            }
        }
    }

    candidates.extend(nvm_bin_candidates("openclaw"));
    resolve_executable("openclaw", &candidates)
}

fn resolve_executable(cmd: &str, extra_candidates: &[PathBuf]) -> Option<PathBuf> {
    if let Some(path) = which(cmd) {
        return Some(path);
    }

    if let Some(path) = find_in_path(cmd) {
        return Some(path);
    }

    extra_candidates
        .iter()
        .find(|p| p.is_file())
        .cloned()
        .or_else(|| None)
}

fn which(cmd: &str) -> Option<PathBuf> {
    run_command_simple("which", &[cmd]).map(PathBuf::from)
}

fn find_in_path(cmd: &str) -> Option<PathBuf> {
    let path_var = env::var_os("PATH")?;
    for dir in env::split_paths(&path_var) {
        let candidate = dir.join(cmd);
        if candidate.is_file() {
            return Some(candidate);
        }

        #[cfg(windows)]
        {
            let candidate = dir.join(format!("{cmd}.exe"));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn nvm_bin_candidates(binary: &str) -> Vec<PathBuf> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };

    let base = home.join(".nvm/versions/node");
    let entries = match fs::read_dir(base) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut candidates = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path().join("bin").join(binary);
        if path.is_file() {
            candidates.push(path);
        }
    }

    candidates.sort();
    candidates.reverse();
    candidates
}

fn home_dir() -> Option<PathBuf> {
    if let Some(home) = env::var_os("HOME") {
        return Some(PathBuf::from(home));
    }
    #[cfg(windows)]
    {
        if let Some(home) = env::var_os("USERPROFILE") {
            return Some(PathBuf::from(home));
        }
    }
    None
}

/// 读取 /etc/os-release 里的 ID 字段（如 "ubuntu"、"debian"、"raspbian"）
#[cfg(target_os = "linux")]
pub fn linux_distro_id() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix("ID=") {
            return Some(val.trim().trim_matches('"').to_lowercase());
        }
    }
    None
}

/// 读取 /etc/os-release 里的 PRETTY_NAME（如 "Ubuntu 22.04.3 LTS"）
#[cfg(target_os = "linux")]
fn linux_pretty_name() -> Option<String> {
    let content = std::fs::read_to_string("/etc/os-release").ok()?;
    for line in content.lines() {
        if let Some(val) = line.strip_prefix("PRETTY_NAME=") {
            return Some(val.trim().trim_matches('"').to_string());
        }
    }
    None
}

/// 检测 systemd --user 是否可用
#[cfg(target_os = "linux")]
fn is_systemd_available() -> bool {
    std::process::Command::new("systemctl")
        .args(["--user", "status"])
        .output()
        .map(|o| o.status.code() != Some(1)) // exit 0 or 3 (inactive) = available
        .unwrap_or(false)
}

/// Linux 下常用的 Node.js bin 目录候选
#[cfg(target_os = "linux")]
fn linux_node_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = vec![
        std::path::PathBuf::from("/usr/bin/node"),
        std::path::PathBuf::from("/usr/local/bin/node"),
        std::path::PathBuf::from("/snap/bin/node"),
    ];
    candidates.extend(nvm_bin_candidates("node"));
    candidates
}

#[cfg(target_os = "windows")]
fn windows_collect_install_prereq() -> (Option<String>, Option<String>, Option<String>, bool, bool) {
    let powershell_version = windows_powershell_version();
    let (wsl_state, wsl_default_distro, wsl_has_ubuntu) = windows_wsl_status();
    let windows_admin = windows_is_admin();
    (
        powershell_version,
        Some(wsl_state),
        wsl_default_distro,
        wsl_has_ubuntu,
        windows_admin,
    )
}

#[cfg(target_os = "windows")]
fn windows_powershell_version() -> Option<String> {
    // 优先 powershell.exe（系统自带），不依赖 pwsh
    run_command_simple(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "$PSVersionTable.PSVersion.ToString()",
        ],
    )
}

#[cfg(target_os = "windows")]
fn windows_is_admin() -> bool {
    // 非管理员通常返回 “Access is denied.”
    std::process::Command::new("cmd")
        .args(["/C", "net", "session"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn windows_wsl_status() -> (String, Option<String>, bool) {
    // 返回：(state, default_distro, has_ubuntu)
    // state: available | needs_install | unsupported | unknown
    let out = std::process::Command::new("wsl").args(["-l", "-v"]).output();

    let Ok(out) = out else {
        return ("unsupported".to_string(), None, false);
    };

    // ⚠️ 重要：Windows 上 wsl -l -v 输出是 UTF-16 LE 编码（带 BOM），
    // 不能直接用 from_utf8_lossy，否则会乱码导致 wsl_state 一直返回 "unknown"。
    // 需要手动将 UTF-16 LE 字节转为 UTF-8 字符串：
    fn utf16le_to_string(bytes: &[u8]) -> String {
        // 跳过 BOM（0xFF 0xFE）
        let start = if bytes.starts_with(&[0xFF, 0xFE]) { 2 } else { 0 };
        let words: Vec<u16> = bytes[start..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&words)
    }
    let stdout = utf16le_to_string(&out.stdout);
    let stderr = utf16le_to_string(&out.stderr);
    let all = format!("{stdout}\n{stderr}").to_lowercase();

    if out.status.success() {
        // 解析默认 distro（带 * 的那行）
        let mut default_distro: Option<String> = None;
        let mut has_ubuntu = false;
        for line in stdout.lines() {
            let raw = line.trim();
            if raw.is_empty() {
                continue;
            }
            if raw.to_lowercase().contains("ubuntu") {
                has_ubuntu = true;
            }
            // 典型：* Ubuntu-22.04    Running    2
            if raw.starts_with('*') {
                let name = raw.trim_start_matches('*').trim();
                let name = name.split_whitespace().next().unwrap_or("").to_string();
                if !name.is_empty() {
                    default_distro = Some(name);
                }
            }
        }

        return ("available".to_string(), default_distro, has_ubuntu);
    }

    // 常见错误关键词：WSL feature 未启用/未安装
    if all.contains("subsystem for linux")
        || all.contains("wsl") && all.contains("not") && all.contains("enabled")
    {
        return ("needs_install".to_string(), None, false);
    }

    ("unknown".to_string(), None, false)
}
