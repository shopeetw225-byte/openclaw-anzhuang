@echo off
REM OpenClaw Windows 编译依赖快速安装脚本
REM 需要以管理员身份运行

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  OpenClaw Windows 编译环境安装
echo ============================================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 需要管理员权限，请以管理员身份运行此脚本
    echo 右键点击此文件 - 选择"以管理员身份运行"
    pause
    exit /b 1
)

echo [1/5] 安装 Chocolatey 包管理器...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (-not (Test-Path 'C:\ProgramData\chocolatey')) { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1')) }"

echo [2/5] 安装 Git...
choco install git -y

echo [3/5] 安装 Rust...
choco install rust-msvc -y

echo [4/5] 安装 Visual Studio Build Tools...
choco install visualstudio2022buildtools -y --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows10SDK.19041"

echo [5/5] 安装 WiX Toolset...
choco install wixtoolset -y

echo.
echo ============================================================
echo  安装完成！
echo ============================================================
echo.
echo 请关闭此窗口，然后打开新的 PowerShell 窗口（刷新环境变量）
echo.
echo 然后运行以下命令开始编译：
echo   git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git
echo   cd openclaw-anzhuang
echo   .\package-and-release.ps1
echo.
pause
