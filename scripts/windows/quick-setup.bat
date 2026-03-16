@echo off
REM OpenClaw Windows 快速安装脚本
REM 自动以管理员身份运行，安装所有编译依赖
color 0B
title OpenClaw 环境配置

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 正在请求管理员权限...
    powershell -NoProfile -Command "Start-Process cmd.exe -Verb RunAs -ArgumentList '/c \"%~f0\"' -Wait"
    exit /b
)

echo.
echo ================================================
echo  OpenClaw Windows 编译环境快速安装
echo ================================================
echo.

REM 刷新环境变量
set "PATH=%PATH%;C:\Program Files\Git\cmd;C:\Program Files\nodejs;C:\Users\%USERNAME%\.cargo\bin"

REM 1. 检查和安装 Chocolatey
echo [1/5] 检查 Chocolatey...
where choco >nul 2>&1
if %errorLevel% neq 0 (
    echo 安装 Chocolatey 包管理器...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "^
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;^
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    if !errorLevel! equ 0 (
        echo Chocolatey 安装成功
    ) else (
        echo Chocolatey 安装失败，尝试继续...
    )
) else (
    echo Chocolatey 已安装
)

REM 刷新 PATH（refreshenv 由 Chocolatey 提供，首次安装后可能不可用）
call refreshenv >nul 2>&1
if %errorLevel% neq 0 (
    echo refreshenv 不可用，手动刷新 PATH...
    for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "PATH=%%B;%PATH%"
)

REM 2. 安装 Git
echo [2/5] 安装 Git...
where git >nul 2>&1
if %errorLevel% neq 0 (
    choco install git -y --force 2>nul
) else (
    echo Git 已安装
)

REM 3. 安装 Node.js
echo [3/5] 安装 Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    choco install nodejs -y --force 2>nul
) else (
    echo Node.js 已安装
)

REM 4. 安装 Rust
echo [4/5] 安装 Rust...
where cargo >nul 2>&1
if %errorLevel% neq 0 (
    choco install rustup.install -y --force 2>nul
    if !errorLevel! equ 0 (
        echo 等待 Rust 初始化...
        timeout /t 5 /nobreak
        rustup target add x86_64-pc-windows-msvc
    )
) else (
    echo Rust 已安装
)

REM 5. 安装 Visual Studio Build Tools
echo [5/5] 安装 Visual Studio Build Tools...
if not exist "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" (
    echo 下载 Visual Studio Build Tools（~15MB）...
    choco install visualstudio2022buildtools -y --force --package-parameters "^
        --add Microsoft.VisualStudio.Workload.VCTools ^
        --add Microsoft.VisualStudio.Component.Windows10SDK.19041" 2>nul
) else (
    echo Visual Studio Build Tools 已安装
)

REM 6. 安装 WiX Toolset
echo [6/6] 安装 WiX Toolset...
where heat.exe >nul 2>&1
if %errorLevel% neq 0 (
    choco install wixtoolset -y --force 2>nul
) else (
    echo WiX Toolset 已安装
)

REM 完成
echo.
echo ================================================
echo  安装完成！
echo ================================================
echo.
echo 下一步：
echo 1. 关闭此窗口
echo 2. 打开新的 PowerShell（刷新环境变量）
echo 3. 运行以下命令：
echo.
echo    git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git
echo    cd openclaw-anzhuang
echo    .\package-and-release.ps1
echo.
pause
