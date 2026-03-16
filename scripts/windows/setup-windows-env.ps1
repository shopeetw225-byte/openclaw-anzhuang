<#
.SYNOPSIS
    OpenClaw Windows 编译环境自动配置脚本
.DESCRIPTION
    一键安装所有依赖：Node.js、Rust、Visual Studio Build Tools、WiX、Git
.EXAMPLE
    .\setup-windows-env.ps1
#>

$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

function Write-Header($Message) {
    Write-Host "`n" -NoNewline
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
}

function Write-Success($Message) {
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error-Custom($Message) {
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Warning-Custom($Message) {
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Info($Message) {
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Test-Command($Command) {
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $currentUser
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

# ─────────────────────────────────────────────────────────────────────────────
# 检查权限
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "检查管理员权限"

if (-not (Test-Admin)) {
    Write-Warning-Custom "此脚本需要以管理员身份运行"
    Write-Info "正在请求提升权限..."

    $scriptPath = $MyInvocation.MyCommand.Path
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait
    exit 0
}

Write-Success "已获得管理员权限"

# ─────────────────────────────────────────────────────────────────────────────
# 1️⃣ 检查 Chocolatey
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "1️⃣ 检查 Chocolatey 包管理器"

if (-not (Test-Command choco)) {
    Write-Warning-Custom "未安装 Chocolatey，正在安装..."

    # 检查 PowerShell 执行策略
    $policy = Get-ExecutionPolicy
    if ($policy -eq "Restricted") {
        Write-Info "临时调整执行策略..."
        Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process -Force
    }

    # 安装 Chocolatey
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

    Write-Success "Chocolatey 安装完成"
} else {
    Write-Success "Chocolatey 已安装"
}

# ─────────────────────────────────────────────────────────────────────────────
# 2️⃣ 安装 Git
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "2️⃣ 安装/检查 Git"

if (-not (Test-Command git)) {
    Write-Warning-Custom "未安装 Git，正在安装..."
    choco install git -y
    Write-Success "Git 安装完成"
} else {
    $gitVersion = git --version
    Write-Success "$gitVersion"
}

# ─────────────────────────────────────────────────────────────────────────────
# 3️⃣ 安装 Node.js
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "3️⃣ 安装/检查 Node.js v18+"

if (-not (Test-Command node)) {
    Write-Warning-Custom "未安装 Node.js，正在安装..."
    choco install nodejs --version=latest -y
    Write-Success "Node.js 安装完成"
} else {
    $nodeVersion = node -v
    $npmVersion = npm -v
    Write-Success "Node.js: $nodeVersion"
    Write-Success "npm: $npmVersion"
}

# ─────────────────────────────────────────────────────────────────────────────
# 4️⃣ 安装 Rust
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "4️⃣ 安装/检查 Rust"

if (-not (Test-Command cargo)) {
    Write-Warning-Custom "未安装 Rust，正在安装..."
    Write-Info "下载 Rust 安装程序..."

    $rustUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
    $tempFile = "$env:TEMP\rustup-init.exe"

    (New-Object System.Net.WebClient).DownloadFile($rustUrl, $tempFile)

    Write-Info "运行 Rust 安装程序..."
    & $tempFile -y

    Remove-Item $tempFile

    Write-Success "Rust 安装完成"
} else {
    $rustVersion = rustc --version
    Write-Success "$rustVersion"
}

# ─────────────────────────────────────────────────────────────────────────────
# 5️⃣ 安装 MSVC 工具链
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "5️⃣ 检查 MSVC 工具链"

$msvcInstalled = rustup target list | Select-String "x86_64-pc-windows-msvc (installed)"
if (-not $msvcInstalled) {
    Write-Warning-Custom "未安装 MSVC 工具链，正在安装..."
    rustup target add x86_64-pc-windows-msvc
    Write-Success "MSVC 工具链安装完成"
} else {
    Write-Success "MSVC 工具链已安装"
}

# ─────────────────────────────────────────────────────────────────────────────
# 6️⃣ 安装 Visual Studio Build Tools
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "6️⃣ 检查 Visual Studio Build Tools"

$vsBuildToolsPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
if (Test-Path $vsBuildToolsPath) {
    Write-Success "Visual Studio Build Tools 已安装"
} else {
    Write-Warning-Custom "未检测到 Visual Studio Build Tools"
    Write-Info "正在安装..."

    $vsUrl = "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    $tempFile = "$env:TEMP\vs_BuildTools.exe"

    Write-Info "下载 Visual Studio Build Tools..."
    (New-Object System.Net.WebClient).DownloadFile($vsUrl, $tempFile)

    Write-Info "运行安装程序（可能需要 5-10 分钟）..."
    $process = Start-Process -FilePath $tempFile -ArgumentList @(
        "--add", "Microsoft.VisualStudio.Workload.VCTools",
        "--add", "Microsoft.VisualStudio.Component.Windows10SDK.19041",
        "-q",
        "--norestart"
    ) -Wait -PassThru

    if ($process.ExitCode -eq 0) {
        Write-Success "Visual Studio Build Tools 安装完成"
    } else {
        Write-Error-Custom "安装失败，退出码: $($process.ExitCode)"
        exit 1
    }

    Remove-Item $tempFile
}

# ─────────────────────────────────────────────────────────────────────────────
# 7️⃣ 安装 WiX Toolset
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "7️⃣ 安装/检查 WiX Toolset"

if (-not (Test-Command heat.exe)) {
    Write-Warning-Custom "未安装 WiX Toolset，正在安装..."
    choco install wixtoolset -y
    Write-Success "WiX Toolset 安装完成"
} else {
    Write-Success "WiX Toolset 已安装"
}

# ─────────────────────────────────────────────────────────────────────────────
# 完成
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "✨ 环境配置完成！"

Write-Host "已安装的工具:" -ForegroundColor Green
Write-Host "  ✅ Node.js" -ForegroundColor Green
Write-Host "  ✅ Rust" -ForegroundColor Green
Write-Host "  ✅ Visual Studio Build Tools" -ForegroundColor Green
Write-Host "  ✅ WiX Toolset" -ForegroundColor Green
Write-Host "  ✅ Git" -ForegroundColor Green

Write-Host "`n下一步:" -ForegroundColor Cyan
Write-Host "1. 打开新的 PowerShell 窗口（刷新环境变量）" -ForegroundColor Cyan
Write-Host "2. 克隆项目代码:" -ForegroundColor Cyan
Write-Host "   git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git" -ForegroundColor Yellow
Write-Host "   cd openclaw-anzhuang" -ForegroundColor Yellow
Write-Host "3. 运行编译脚本:" -ForegroundColor Cyan
Write-Host "   .\package-and-release.ps1" -ForegroundColor Yellow

Write-Host "`n"
Write-Host "需要重启系统吗？建议重启以确保所有环境变量生效。" -ForegroundColor Yellow
$restart = Read-Host "是否立即重启? (y/n)"
if ($restart -eq 'y') {
    Restart-Computer -Force
}
