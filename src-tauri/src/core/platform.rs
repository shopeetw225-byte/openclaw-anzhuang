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
        #[cfg(target_os = "windows")]
        {
            windows_os_name().unwrap_or_else(|| "Windows".to_string())
        }
        #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
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

    // npm 脚本内部用 #!/usr/bin/env node，打包 app 的 PATH 里没有 node，
    // 需要把 node 所在 bin 目录预置到 PATH 里才能执行成功。
    let node_bin_dir = node_path.as_ref().and_then(|n| n.parent().map(|p| p.to_path_buf()));
    let npm_version = npm_path
        .as_ref()
        .and_then(|p| run_command_at_with_node_path(p, &["-v"], node_bin_dir.as_deref()));

    let openclaw_version = openclaw_path
        .as_ref()
        .and_then(|p| run_command_at_with_node_path(p, &["--version"], node_bin_dir.as_deref()));

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

/// 返回 Node.js 所在的 bin 目录，供 process_runner 注入到 PATH，
/// 确保运行 openclaw / npm 等 Node.js 脚本时 shebang 可找到 node。
pub fn node_bin_dir() -> Option<std::path::PathBuf> {
    resolve_node().and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

pub fn resolve_node_path() -> Option<PathBuf> {
    resolve_node()
}

pub fn resolve_npm_path() -> Option<PathBuf> {
    let node = resolve_node();
    resolve_npm(&node)
}

pub fn resolve_openclaw_path() -> Option<PathBuf> {
    let node = resolve_node();
    resolve_openclaw(&node)
}

pub fn collect_openclaw_status() -> crate::OpenClawStatus {
    let node_path = resolve_node();
    let openclaw_path = resolve_openclaw(&node_path);
    let node_bin_dir = node_path.as_ref().and_then(|n| n.parent().map(|p| p.to_path_buf()));
    let version = openclaw_path
        .as_ref()
        .and_then(|p| run_command_at_with_node_path(p, &["--version"], node_bin_dir.as_deref()));

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
    let mut command = build_command_for_path(cmd);
    command.args(args);
    command
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

/// 与 run_command_at 相同，但额外将 extra_path_dir 预置到 PATH，
/// 用于运行 npm 等带 #!/usr/bin/env node shebang 的脚本。
fn run_command_at_with_node_path(cmd: &Path, args: &[&str], extra_path_dir: Option<&Path>) -> Option<String> {
    let mut command = build_command_for_path(cmd);
    command.args(args);
    if let Some(dir) = extra_path_dir {
        let base = env::var_os("PATH").unwrap_or_default();
        let mut paths: Vec<PathBuf> = Vec::new();
        paths.push(dir.to_path_buf());
        paths.extend(env::split_paths(&base));
        if let Ok(joined) = env::join_paths(paths) {
            command.env("PATH", joined);
        } else {
            let sep = if cfg!(windows) { ";" } else { ":" };
            command.env("PATH", format!("{}{}{}", dir.display(), sep, base.to_string_lossy()));
        }
    }
    command
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty())
}

fn build_command_for_path(cmd: &Path) -> std::process::Command {
    #[cfg(target_os = "windows")]
    {
        let ext = cmd
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ext == "cmd" || ext == "bat" {
            let mut c = std::process::Command::new("cmd");
            c.arg("/C").arg(cmd);
            return c;
        }
    }

    std::process::Command::new(cmd)
}

fn is_port_listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

fn disk_free_mb() -> u64 {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use std::ptr::null_mut;

        #[repr(C)]
        struct ULARGE_INTEGER {
            quad_part: u64,
        }

        #[link(name = "Kernel32")]
        extern "system" {
            fn GetDiskFreeSpaceExW(
                lp_directory_name: *const u16,
                lp_free_bytes_available: *mut ULARGE_INTEGER,
                lp_total_number_of_bytes: *mut ULARGE_INTEGER,
                lp_total_number_of_free_bytes: *mut ULARGE_INTEGER,
            ) -> i32;
        }

        let path = home_dir().unwrap_or_else(|| PathBuf::from("C:\\"));
        let mut wide: Vec<u16> = path.as_os_str().encode_wide().collect();
        wide.push(0);

        let mut free = ULARGE_INTEGER { quad_part: 0 };
        let ok = unsafe { GetDiskFreeSpaceExW(wide.as_ptr(), &mut free, null_mut(), null_mut()) };
        if ok == 0 {
            return 0;
        }
        return free.quad_part / 1024 / 1024;
    }

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

        // 扫描 ~/node-v* 和 ~/node-* 目录（用户直接下载解压的 Node.js）
        if let Some(home) = home_dir() {
            if let Ok(entries) = fs::read_dir(&home) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("node-v") || name_str.starts_with("node-") {
                        let candidate = entry.path().join("bin").join("node");
                        if candidate.is_file() {
                            candidates.push(candidate);
                        }
                    }
                }
            }
            // fnm
            candidates.push(home.join(".local/share/fnm/aliases/default/bin/node"));
            // volta
            candidates.push(home.join(".volta/bin/node"));
            // asdf
            if let Ok(entries) = fs::read_dir(home.join(".asdf/installs/nodejs")) {
                for entry in entries.flatten() {
                    candidates.push(entry.path().join("bin").join("node"));
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        candidates.extend(linux_node_candidates());
    }

    #[cfg(target_os = "windows")]
    {
        candidates.extend(windows_node_candidates());
    }

    candidates.extend(nvm_bin_candidates("node"));

    if let Some(found) = resolve_executable("node", &candidates) {
        return Some(found);
    }

    // 最终回退：通过用户 login shell 查找（包含 ~/.zshrc / ~/.zprofile 里的 PATH）
    #[cfg(not(target_os = "windows"))]
    {
        which_in_login_shell("node")
    }
    #[cfg(target_os = "windows")]
    None
}

fn resolve_npm(node_path: &Option<PathBuf>) -> Option<PathBuf> {
    if let Some(node) = node_path {
        if let Some(bin_dir) = node.parent() {
            let npm = bin_dir.join("npm");
            if npm.is_file() {
                return Some(npm);
            }
            #[cfg(target_os = "windows")]
            {
                let npm = bin_dir.join("npm.cmd");
                if npm.is_file() {
                    return Some(npm);
                }
            }
        }
    }

    let mut candidates = Vec::new();
    candidates.push(PathBuf::from("/usr/local/bin/npm"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/npm"));
    #[cfg(target_os = "windows")]
    {
        candidates.extend(windows_npm_candidates());
    }
    candidates.extend(nvm_bin_candidates("npm"));
    if let Some(found) = resolve_executable("npm", &candidates) {
        return Some(found);
    }

    // 最终回退：通过用户 login shell 查找（与 resolve_node 保持一致）
    #[cfg(not(target_os = "windows"))]
    {
        which_in_login_shell("npm")
    }
    #[cfg(target_os = "windows")]
    None
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

    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = env::var_os("APPDATA").map(PathBuf::from) {
            candidates.push(appdata.join("npm").join("openclaw.cmd"));
            candidates.push(appdata.join("npm").join("openclaw"));
        }
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
    #[cfg(target_os = "windows")]
    {
        run_command_simple("where", &[cmd])
            .and_then(|s| s.lines().next().map(|l| l.trim().to_string()))
            .filter(|s| !s.is_empty())
            .map(PathBuf::from)
    }
    #[cfg(not(target_os = "windows"))]
    {
        run_command_simple("which", &[cmd]).map(PathBuf::from)
    }
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
            for ext in ["exe", "cmd", "bat"] {
                let candidate = dir.join(format!("{cmd}.{ext}"));
                if candidate.is_file() {
                    return Some(candidate);
                }
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

/// 通过用户 shell 查找命令路径（macOS/Linux）
/// 用于打包后 app PATH 极简、静态候选全部失败时的最终回退
/// 依次尝试：
///   1. zsh/bash -i -l（交互+登录，同时加载 .zshrc 和 .zprofile）
///   2. 直接读取 ~/.zshrc / ~/.bash_profile 中的 export PATH 行
#[cfg(not(target_os = "windows"))]
fn which_in_login_shell(cmd: &str) -> Option<PathBuf> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    // 尝试交互+登录 shell（zsh -i -l 会同时读 .zprofile 和 .zshrc）
    let script = format!("which {cmd} 2>/dev/null || command -v {cmd} 2>/dev/null");
    let output = std::process::Command::new(&shell)
        .args(["-i", "-l", "-c", &script])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok();

    if let Some(out) = output {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            let first = s.lines().next().unwrap_or("").trim();
            if !first.is_empty() && !first.starts_with("no ") && !first.contains("not found") {
                let p = PathBuf::from(first);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }

    // 回退：解析 ~/.zshrc 和 ~/.bash_profile 里的 export PATH=... 行，拼出候选路径
    if let Some(found) = find_cmd_via_shell_rc(cmd) {
        return Some(found);
    }

    None
}

/// 解析常见 shell 配置文件里的 export PATH 行，提取路径目录后查找命令
#[cfg(not(target_os = "windows"))]
fn find_cmd_via_shell_rc(cmd: &str) -> Option<PathBuf> {
    let home = home_dir()?;
    let rc_files = [
        home.join(".zshrc"),
        home.join(".zprofile"),
        home.join(".bash_profile"),
        home.join(".bashrc"),
        home.join(".profile"),
    ];

    let mut extra_dirs: Vec<PathBuf> = Vec::new();
    for rc in &rc_files {
        let Ok(content) = fs::read_to_string(rc) else { continue };
        for line in content.lines() {
            let line = line.trim();
            // 匹配 export PATH="$HOME/xxx/bin:..." 或 export PATH=/xxx/bin:...
            if !line.starts_with("export PATH") { continue }
            // 提取引号内或等号后的内容
            let val = line
                .splitn(2, '=')
                .nth(1)
                .unwrap_or("")
                .trim_matches('"')
                .trim_matches('\'');
            for segment in val.split(':') {
                let segment = segment
                    .replace("$HOME", home.to_str().unwrap_or(""))
                    .replace("${HOME}", home.to_str().unwrap_or(""));
                if segment.is_empty() || segment == "$PATH" || segment == "${PATH}" {
                    continue;
                }
                extra_dirs.push(PathBuf::from(&segment));
            }
        }
    }

    extra_dirs.iter().find_map(|dir| {
        let p = dir.join(cmd);
        if p.is_file() { Some(p) } else { None }
    })
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
fn windows_node_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = Vec::new();
    if let Some(pf) = env::var_os("ProgramFiles").map(PathBuf::from) {
        candidates.push(pf.join("nodejs").join("node.exe"));
    }
    if let Some(pf86) = env::var_os("ProgramFiles(x86)").map(PathBuf::from) {
        candidates.push(pf86.join("nodejs").join("node.exe"));
    }
    if let Some(local) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        candidates.push(local.join("Programs").join("nodejs").join("node.exe"));
        // nvm-windows: %APPDATA%\nvm\v*\node.exe
        if let Ok(entries) = fs::read_dir(&local.join("nvm")) {
            for entry in entries.flatten() {
                let node_exe = entry.path().join("node.exe");
                if node_exe.is_file() {
                    candidates.push(node_exe);
                }
            }
        }
    }
    candidates
}

#[cfg(target_os = "windows")]
fn windows_npm_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = Vec::new();
    if let Some(pf) = env::var_os("ProgramFiles").map(PathBuf::from) {
        candidates.push(pf.join("nodejs").join("npm.cmd"));
        candidates.push(pf.join("nodejs").join("npm"));
    }
    if let Some(pf86) = env::var_os("ProgramFiles(x86)").map(PathBuf::from) {
        candidates.push(pf86.join("nodejs").join("npm.cmd"));
        candidates.push(pf86.join("nodejs").join("npm"));
    }
    if let Some(local) = env::var_os("LOCALAPPDATA").map(PathBuf::from) {
        candidates.push(local.join("Programs").join("nodejs").join("npm.cmd"));
        candidates.push(local.join("Programs").join("nodejs").join("npm"));
    }
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
fn windows_os_name() -> Option<String> {
    // 示例输出：Microsoft Windows [Version 10.0.22631.3155]
    run_command_simple("cmd", &["/C", "ver"])
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
            .chunks(2)
            .filter(|c| c.len() == 2)  // 跳过不完整的最后一对字节，避免 panic
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
