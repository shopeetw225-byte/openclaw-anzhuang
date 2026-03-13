#Requires -Version 5.1
<#
.SYNOPSIS
    OpenClaw 安装器 Windows 打包脚本
.DESCRIPTION
    一键编译 OpenClaw 安装器为 Windows MSI 和 EXE 安装程序
.EXAMPLE
    .\build-windows.ps1
    .\build-windows.ps1 -Clean
    .\build-windows.ps1 -NoSign
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$NoSign
)

$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────────────────────────────────────

$PROJECT_NAME = "OpenClaw 安装器"
$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUTPUT_DIR = Join-Path $PROJECT_DIR "dist-windows"

# ─────────────────────────────────────────────────────────────────────────────
# 工具函数
# ─────────────────────────────────────────────────────────────────────────────

function Write-Header($Message) {
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "  $Message" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan
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

function Test-Command($Command) {
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 检查前置条件
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "检查构建环境"

# 检查 Node.js
if (-not (Test-Command node)) {
    Write-Error-Custom "未安装 Node.js"
    Write-Host "请从 https://nodejs.org/ 下载安装 Node.js v18+"
    exit 1
}
$nodeVersion = node -v
Write-Success "Node.js: $nodeVersion"

# 检查 npm
if (-not (Test-Command npm)) {
    Write-Error-Custom "未安装 npm"
    exit 1
}
$npmVersion = npm -v
Write-Success "npm: $npmVersion"

# 检查 Rust
if (-not (Test-Command cargo)) {
    Write-Error-Custom "未安装 Rust"
    Write-Host "请从 https://rustup.rs/ 运行安装程序"
    exit 1
}
$rustVersion = rustc --version
Write-Success "$rustVersion"

# 检查 MSVC 工具链
$hasToolchain = rustup target list | Select-String "x86_64-pc-windows-msvc (installed)"
if (-not $hasToolchain) {
    Write-Warning-Custom "未安装 MSVC 工具链，正在安装..."
    rustup target add x86_64-pc-windows-msvc
}
Write-Success "MSVC 工具链已安装"

# 检查 Visual Studio Build Tools
if (-not (Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat")) {
    Write-Warning-Custom "未检测到 Visual Studio Build Tools"
    Write-Host "请访问 https://visualstudio.microsoft.com/downloads/"
    Write-Host "选择 'Visual Studio Build Tools for Windows'"
    Write-Host "安装 'C++ 桌面开发工具'"
    exit 1
}
Write-Success "Visual Studio Build Tools: Found"

# 检查 WiX（可选但推荐）
if (-not (Test-Command heat.exe)) {
    Write-Warning-Custom "未检测到 WiX Toolset（可选）"
    Write-Host "MSI 生成需要 WiX，请运行："
    Write-Host "  choco install wixtoolset -y"
} else {
    Write-Success "WiX Toolset: Found"
}

# ─────────────────────────────────────────────────────────────────────────────
# 清理（如果指定）
# ─────────────────────────────────────────────────────────────────────────────

if ($Clean) {
    Write-Header "清理构建缓存"

    if (Test-Path "$PROJECT_DIR\dist") {
        Write-Host "删除 dist 目录..."
        Remove-Item -Recurse -Force "$PROJECT_DIR\dist"
        Write-Success "dist 目录已删除"
    }

    if (Test-Path "$PROJECT_DIR\src-tauri\target") {
        Write-Host "删除 Cargo 构建目录..."
        Remove-Item -Recurse -Force "$PROJECT_DIR\src-tauri\target"
        Write-Success "Cargo 构建目录已删除"
    }

    if (Test-Path "$PROJECT_DIR\node_modules") {
        Write-Host "删除 node_modules 目录..."
        Remove-Item -Recurse -Force "$PROJECT_DIR\node_modules"
        Write-Success "node_modules 已删除"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 安装依赖
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "安装 npm 依赖"

Push-Location $PROJECT_DIR
try {
    npm ci
    Write-Success "npm 依赖安装完成"
} catch {
    Write-Error-Custom "npm 依赖安装失败"
    exit 1
}
Pop-Location

# ─────────────────────────────────────────────────────────────────────────────
# 构建前端
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "构建前端应用"

Push-Location $PROJECT_DIR
try {
    npm run build
    Write-Success "前端构建完成"
} catch {
    Write-Error-Custom "前端构建失败"
    exit 1
}
Pop-Location

# ─────────────────────────────────────────────────────────────────────────────
# 构建 Tauri 应用
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "编译 Tauri 应用（可能需要 5-15 分钟）"
Write-Host "⏳ 正在构建... 请耐心等待`n"

Push-Location $PROJECT_DIR
try {
    npm run tauri build
    Write-Success "Tauri 应用构建完成"
} catch {
    Write-Error-Custom "Tauri 应用构建失败"
    Write-Host "`n排查步骤："
    Write-Host "1. 确保 Visual Studio Build Tools 已安装"
    Write-Host "2. 尝试运行: cargo clean"
    Write-Host "3. 重新运行此脚本"
    exit 1
}
Pop-Location

# ─────────────────────────────────────────────────────────────────────────────
# 收集输出文件
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "收集输出文件"

# 创建输出目录
$null = New-Item -ItemType Directory -Path $OUTPUT_DIR -Force

# 复制 MSI
$msiPath = Get-ChildItem -Path "$PROJECT_DIR\src-tauri\target\release\bundle\msi" -Filter "*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($msiPath) {
    Copy-Item -Path $msiPath.FullName -Destination $OUTPUT_DIR
    Write-Success "MSI 安装程序: $($msiPath.Name)"
} else {
    Write-Warning-Custom "未找到 MSI 文件（需要 WiX Toolset）"
}

# 复制 NSIS EXE
$exePath = Get-ChildItem -Path "$PROJECT_DIR\src-tauri\target\release\bundle\nsis" -Filter "*-setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($exePath) {
    Copy-Item -Path $exePath.FullName -Destination $OUTPUT_DIR
    Write-Success "NSIS 安装程序: $($exePath.Name)"
} else {
    Write-Warning-Custom "未找到 NSIS EXE 文件"
}

# ─────────────────────────────────────────────────────────────────────────────
# 验证
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "验证构建输出"

$outputFiles = Get-ChildItem -Path $OUTPUT_DIR -File
if ($outputFiles.Count -eq 0) {
    Write-Error-Custom "未生成任何安装程序"
    exit 1
}

Write-Success "生成了 $($outputFiles.Count) 个安装程序文件"
Write-Host ""
Write-Host "输出目录: $OUTPUT_DIR`n"
$outputFiles | ForEach-Object {
    $size = [math]::Round($_.Length / 1MB, 2)
    Write-Host "  📦 $($_.Name) ($size MB)"
}

# ─────────────────────────────────────────────────────────────────────────────
# 完成
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "构建完成 ✨"

Write-Host "下一步:"
Write-Host "1. 在本地测试安装程序："
Write-Host "   $($outputFiles[0].FullName)"
Write-Host ""
Write-Host "2. 上传到 GitHub Releases:"
Write-Host "   gh release create v0.1.0 $OUTPUT_DIR\*"
Write-Host ""
Write-Host "3. 分享给用户下载："
Write-Host "   https://github.com/你的用户名/openclaw-anzhuang/releases`n"

# 可选：在 Explorer 中打开输出目录
$openExplorer = Read-Host "是否在 Explorer 中打开输出目录? (y/n)"
if ($openExplorer -eq 'y') {
    explorer.exe $OUTPUT_DIR
}
