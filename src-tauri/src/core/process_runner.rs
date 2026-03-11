use std::{
    io::{BufRead, BufReader},
    path::Path,
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Emitter};

use crate::InstallLogPayload;

const PROGRESS_RULES: [(&str, u8); 12] = [
    ("Checking Node", 5),
    ("[步骤 1", 5),
    ("Installing Node", 15),
    ("安装 Node", 15),
    ("Downloading node", 20),
    ("nvm install", 25),
    ("npm install -g openclaw", 50),
    ("added", 70),
    ("openclaw gateway start", 85),
    ("gateway listening", 95),
    ("安装完成", 100),
    ("Done", 100),
];

pub fn run_bash_script(app: &AppHandle, script_path: &Path) -> Result<(), String> {
    emit_log(app, "Starting", 0, format!("开始执行脚本: {}", script_path.display()));

    let child = Command::new("bash")
        .arg(script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动脚本失败: {e}"))?;

    run_child_with_logs(app, child, "脚本执行失败")
}

#[cfg(target_os = "windows")]
pub fn run_powershell_script(app: &AppHandle, script_path: &Path) -> Result<(), String> {
    use std::io::ErrorKind;

    emit_log(
        app,
        "Starting",
        0,
        format!("开始执行 PowerShell 脚本: {}", script_path.display()),
    );

    let child = Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .arg(script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "未检测到 PowerShell（powershell），请确认 Windows 环境可用".to_string()
            } else {
                format!("启动 PowerShell 失败: {e}")
            }
        })?;

    run_child_with_logs(app, child, "PowerShell 脚本执行失败")
}

#[cfg(target_os = "windows")]
pub fn run_wsl_bash_script(app: &AppHandle, script_path: &Path) -> Result<(), String> {
    use std::{io::ErrorKind, io::Write};

    emit_log(
        app,
        "Starting",
        0,
        format!("开始通过 WSL bash 执行脚本: {}", script_path.display()),
    );

    let script_bytes =
        std::fs::read(script_path).map_err(|e| format!("读取脚本失败: {e}"))?;

    let mut child = Command::new("wsl")
        .args(["--", "bash", "-s"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                "未检测到 WSL，请先安装 WSL2".to_string()
            } else {
                format!("启动 WSL 失败: {e}")
            }
        })?;

    // Write stdin in a separate thread to avoid deadlock when pipes are full.
    let mut stdin = child.stdin.take().ok_or_else(|| "无法获取 stdin".to_string())?;
    std::thread::spawn(move || {
        let _ = stdin.write_all(&script_bytes);
        // drop(stdin) -> send EOF
    });

    run_child_with_logs(app, child, "WSL bash 脚本执行失败（可能未安装或未配置 WSL2）")
}

#[derive(Clone, Copy)]
enum Stream {
    Stdout,
    Stderr,
}

fn read_lines<R: std::io::Read + Send + 'static>(stream: Stream, reader: R, tx: mpsc::Sender<(Stream, String)>) {
    let reader = BufReader::new(reader);
    for line in reader.lines().flatten() {
        let _ = tx.send((stream, line));
    }
}

fn run_child_with_logs(
    app: &AppHandle,
    mut child: std::process::Child,
    fail_msg: &str,
) -> Result<(), String> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法捕获 stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法捕获 stderr".to_string())?;

    let (tx, rx) = mpsc::channel::<(Stream, String)>();

    let tx_out = tx.clone();
    let out_handle = thread::spawn(move || read_lines(Stream::Stdout, stdout, tx_out));

    let tx_err = tx.clone();
    let err_handle = thread::spawn(move || read_lines(Stream::Stderr, stderr, tx_err));

    drop(tx);

    let mut current_percentage: u8 = 0;
    let mut current_step: String = "Starting".to_string();

    for (stream, line) in rx.iter() {
        if let Some((step, percentage)) = infer_progress(&line) {
            current_step = step.to_string();
            current_percentage = current_percentage.max(percentage);
        }

        let message = match stream {
            Stream::Stdout => line,
            Stream::Stderr => format!("[stderr] {line}"),
        };

        emit_log(app, &current_step, current_percentage, message);
    }

    let status = child
        .wait()
        .map_err(|e| format!("等待脚本退出失败: {e}"))?;

    let _ = out_handle.join();
    let _ = err_handle.join();

    if !status.success() {
        return Err(format!("{fail_msg}: {status}"));
    }

    Ok(())
}

fn infer_progress(line: &str) -> Option<(&'static str, u8)> {
    PROGRESS_RULES
        .iter()
        .find(|(keyword, _)| line.contains(keyword))
        .map(|(keyword, percentage)| (*keyword, *percentage))
}

fn emit_log(app: &AppHandle, step: &str, percentage: u8, message: String) {
    let payload = InstallLogPayload {
        step: step.to_string(),
        percentage,
        message,
        timestamp: now_ms(),
    };
    let _ = app.emit("install-log", payload);
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 流式运行任意命令，将 stdout/stderr 实时 emit 为 install-log 事件
pub fn stream_command(app: &AppHandle, program: &str, args: &[&str]) -> Result<(), String> {
    emit_log(app, "Starting", 0, format!("运行: {} {}", program, args.join(" ")));

    let child = std::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动命令失败: {e}"))?;

    run_child_with_logs(app, child, "命令执行失败")
}
