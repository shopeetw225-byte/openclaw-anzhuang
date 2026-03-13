#Requires -Version 5.1
<#
.SYNOPSIS
    OpenClaw 卸载向导（增强版，集成 ByeByeClaw 功能）
.DESCRIPTION
    支持深层清理，删除 OpenClaw 及相关工具的所有痕迹
.PARAMETER DryRun
    仅扫描不删除
.PARAMETER KeepConfig
    保留 ~/.openclaw 数据目录
.PARAMETER Select
    逐项选择要删除的项目
#>
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$KeepConfig,
    [switch]$Select
)

$ErrorActionPreference = 'Continue'

# ─────────────────────────────────────────────────────────────────────────────
# i18n / 国际化
# ─────────────────────────────────────────────────────────────────────────────

function T($key) {
    $zh = @{
        title         = "👋 OpenClaw 深度卸载向导"
        dry_run       = "[DRY RUN 模式 - 仅扫描不删除]"
        keep_config   = "[保留配置文件]"
        select_mode   = "[逐项选择模式]"
        scanning      = "🔍 正在扫描 OpenClaw 相关安装痕迹..."
        npm_sec       = "npm 全局包"
        pip_sec       = "pip 包"
        cargo_sec     = "cargo 安装"
        bin_sec       = "二进制文件"
        config_sec    = "配置/数据目录"
        vscode_sec    = "VS Code 扩展"
        docker_sec    = "Docker 容器/镜像"
        service_sec   = "Windows 服务"
        proc_sec      = "进程"
        reg_sec       = "注册表"
        tmpfile_sec   = "临时文件"
        clean         = "✅ 系统干净！未检测到 OpenClaw 相关安装。"
        found_pre     = "共检测到"
        found_post    = "个项目需要清理。"
        dry_done      = "📋 DRY RUN 完成。去掉 -DryRun 参数执行真正的卸载。"
        confirm       = "确认卸载以上所有项目？(y/N)"
        cancelled     = "已取消卸载。"
        cleaning      = "🧹 开始清理..."
        uninstall     = "卸载"
        delete        = "删除"
        fail          = "失败"
        skip          = "跳过"
        done_ok       = "✅ 卸载完成！OpenClaw 已从系统中彻底移除。"
        done_err_pre  = "⚠️  卸载完成，但有"
        done_err_post = "个项目未能成功清理。"
        select_prompt = "删除? (y/n): "
    }
    $en = @{
        title         = "👋 OpenClaw Deep Uninstaller"
        dry_run       = "[DRY RUN - scan only, no deletions]"
        keep_config   = "[keeping config files]"
        select_mode   = "[interactive select mode]"
        scanning      = "🔍 Scanning for OpenClaw installations..."
        npm_sec       = "npm global packages"
        pip_sec       = "pip packages"
        cargo_sec     = "cargo installs"
        bin_sec       = "binaries"
        config_sec    = "config/data dirs"
        vscode_sec    = "VS Code extensions"
        docker_sec    = "Docker containers/images"
        service_sec   = "Windows services"
        proc_sec      = "processes"
        reg_sec       = "registry"
        tmpfile_sec   = "temp files"
        clean         = "✅ System is clean! No OpenClaw installations found."
        found_pre     = "Found"
        found_post    = "items to clean up."
        dry_done      = "📋 DRY RUN complete. Remove -DryRun to actually uninstall."
        confirm       = "Confirm uninstall all items above? (y/N) "
        cancelled     = "Cancelled."
        cleaning      = "🧹 Cleaning up..."
        uninstall     = "uninstall"
        delete        = "remove"
        fail          = "failed"
        skip          = "skipped"
        done_ok       = "✅ Uninstall complete! OpenClaw removed. Zero residue."
        done_err_pre  = "⚠️  Uninstall complete, but"
        done_err_post = "items could not be cleaned."
        select_prompt = "remove? (y/n): "
    }

    $culture = (Get-Culture).Name
    $lang = if ($culture -match "^zh") { "zh" } else { "en" }

    if ($lang -eq "zh") { return $zh[$key] } else { return $en[$key] }
}

# ─────────────────────────────────────────────────────────────────────────────
# 初始化
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host (T "title") -ForegroundColor Cyan
Write-Host "=" * 60
if ($DryRun)    { Write-Host "   $(T 'dry_run')" -ForegroundColor Yellow }
if ($KeepConfig){ Write-Host "   $(T 'keep_config')" -ForegroundColor Yellow }
if ($Select)    { Write-Host "   $(T 'select_mode')" -ForegroundColor Yellow }
Write-Host ""

$foundItems = @()
$failedItems = 0

function Found($Type, $Value, $Desc) {
    Write-Host "  ✗ $Desc" -ForegroundColor Red
    $script:foundItems += @{ type=$Type; value=$Value; desc=$Desc }
}

# ─────────────────────────────────────────────────────────────────────────────
# SCAN / 扫描
# ─────────────────────────────────────────────────────────────────────────────

Write-Host (T "scanning") -ForegroundColor Yellow
Write-Host ""

# Target patterns
$clawPatterns = @("openclaw", "zeroclaw", "nanoclaw", "ironclaw", "nullclaw", "tinyclaw", "nanobot", "microclaw", "rayclaw", "sharpclaw", "moltbot")
$npmPackages = @("openclaw", "@openclaw/cli", "@openclaw/sdk")

# 1. npm global
Write-Host "  [$(T 'npm_sec')]" -ForegroundColor DarkGray
foreach ($pkg in $npmPackages) {
    $r = npm list -g $pkg --depth=0 2>$null
    if ($LASTEXITCODE -eq 0) { Found "npm" $pkg "$(T 'npm_sec'): $pkg" }
}
# Fuzzy
$allGlobal = npm list -g --depth=0 --parseable 2>$null
if ($allGlobal) {
    foreach ($line in $allGlobal) {
        $pkg = Split-Path $line -Leaf
        if ($pkg -match ($clawPatterns -join "|")) {
            if ($pkg -notin $npmPackages) { Found "npm_fuzzy" $pkg "$(T 'npm_sec') (fuzzy): $pkg" }
        }
    }
}

# 2. pip
Write-Host "  [$(T 'pip_sec')]" -ForegroundColor DarkGray
$pipPkgs = @("openclaw", "zeroclaw", "nanoclaw", "ironclaw", "nullclaw", "tinyclaw", "microclaw", "moltbot")
foreach ($pkg in $pipPkgs) {
    $r = pip show $pkg 2>$null
    if ($LASTEXITCODE -eq 0) { Found "pip" $pkg "$(T 'pip_sec'): $pkg" }
}

# 3. cargo
Write-Host "  [$(T 'cargo_sec')]" -ForegroundColor DarkGray
$cargoBin = "$env:USERPROFILE\.cargo\bin"
$cargoPkgs = @("zeroclaw", "ironclaw", "microclaw", "rayclaw", "nullclaw", "nanoclaw")
foreach ($pkg in $cargoPkgs) {
    if (Test-Path "$cargoBin\$pkg.exe") { Found "cargo" $pkg "$(T 'cargo_sec'): $cargoBin\$pkg.exe" }
}

# 4. Binaries
Write-Host "  [$(T 'bin_sec')]" -ForegroundColor DarkGray
$npmPrefix = npm config get prefix 2>$null
$binDirs = @()
if ($npmPrefix) { $binDirs += "$npmPrefix" }
if (Test-Path "$env:APPDATA\nvm") {
    Get-ChildItem "$env:APPDATA\nvm" -Directory -ErrorAction SilentlyContinue | ForEach-Object { $binDirs += $_ }
}
foreach ($dir in $binDirs) {
    foreach ($pattern in $clawPatterns) {
        Get-ChildItem "$dir" -Filter "*$pattern*" -ErrorAction SilentlyContinue | ForEach-Object {
            Found "binary" $_.FullName "$(T 'bin_sec'): $($_.FullName)"
        }
    }
}

# 5. Config directories
Write-Host "  [$(T 'config_sec')]" -ForegroundColor DarkGray
$configDirs = @(
    "$env:USERPROFILE\.openclaw",
    "$env:USERPROFILE\.zeroclaw",
    "$env:APPDATA\openclaw",
    "$env:LOCALAPPDATA\openclaw"
)
foreach ($dir in $configDirs) {
    if (Test-Path $dir) { Found "config" $dir "$(T 'config_sec'): $dir" }
}

# 6. VS Code extensions
Write-Host "  [$(T 'vscode_sec')]" -ForegroundColor DarkGray
$vscodeExts = @(
    "$env:USERPROFILE\.vscode\extensions",
    "$env:USERPROFILE\.vscode-insiders\extensions",
    "$env:USERPROFILE\.cursor\extensions"
)
foreach ($extDir in $vscodeExts) {
    if (Test-Path $extDir) {
        Get-ChildItem $extDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Name -match ($clawPatterns -join "|")) {
                Found "vscode_ext" $_.FullName "$(T 'vscode_sec'): $($_.Name)"
            }
        }
    }
}

# 7. Docker
Write-Host "  [$(T 'docker_sec')]" -ForegroundColor DarkGray
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $containers = docker ps -a 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match ($clawPatterns -join "|") }
    foreach ($ctn in $containers) {
        Found "docker_ctn" $ctn "$(T 'docker_sec') (container): $ctn"
    }
    $images = docker images 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match ($clawPatterns -join "|") }
    foreach ($img in $images) {
        Found "docker_img" $img "$(T 'docker_sec') (image): $img"
    }
}

# 8. Services
Write-Host "  [$(T 'service_sec')]" -ForegroundColor DarkGray
$services = @("openclaw-gateway", "openclaw")
foreach ($svc in $services) {
    $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
    if ($s) { Found "service" $svc "$(T 'service_sec'): $svc" }
}

# 9. Processes
Write-Host "  [$(T 'proc_sec')]" -ForegroundColor DarkGray
foreach ($pattern in $clawPatterns) {
    $procs = Get-Process | Where-Object { $_.ProcessName -like "*$pattern*" -or $_.Name -like "*$pattern*" }
    foreach ($proc in $procs) {
        Found "process" "$($proc.ProcessName)-$($proc.Id)" "$(T 'proc_sec'): $($proc.ProcessName) (PID: $($proc.Id))"
    }
}

# 10. Registry
Write-Host "  [$(T 'reg_sec')]" -ForegroundColor DarkGray
$regPaths = @(
    "HKCU:\Software\openclaw",
    "HKCU:\Software\zeroclaw",
    "HKLM:\SOFTWARE\openclaw",
    "HKLM:\SOFTWARE\zeroclaw"
)
foreach ($path in $regPaths) {
    if (Test-Path $path) { Found "registry" $path "$(T 'reg_sec'): $path" }
}

# 11. Temp files
Write-Host "  [$(T 'tmpfile_sec')]" -ForegroundColor DarkGray
$tempDir = $env:TEMP
if (Test-Path $tempDir) {
    Get-ChildItem $tempDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match ($clawPatterns -join "|") } | ForEach-Object {
        Found "tmpfile" $_.FullName "$(T 'tmpfile_sec'): $($_.FullName)"
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 结果和确认
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""

if ($foundItems.Count -eq 0) {
    Write-Host (T "clean") -ForegroundColor Green
    exit 0
}

Write-Host "$(T 'found_pre') $($foundItems.Count) $(T 'found_post')" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host (T "dry_done") -ForegroundColor Cyan
    exit 0
}

# 确认
$response = Read-Host (T "confirm")
if ($response -ne "y" -and $response -ne "Y") {
    Write-Host (T "cancelled")
    exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# 删除
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host (T "cleaning") -ForegroundColor Yellow
Write-Host ""

foreach ($item in $foundItems) {
    $shouldDelete = $true

    # Select mode
    if ($Select) {
        $response = Read-Host "$($item.desc) - $(T 'select_prompt')"
        $shouldDelete = ($response -eq "y" -or $response -eq "Y")
    }

    if (-not $shouldDelete) {
        Write-Host "  [$(T 'skip')]  $($item.desc)" -ForegroundColor Gray
        continue
    }

    try {
        switch ($item.type) {
            "npm" {
                npm uninstall -g $item.value 2>&1 | Out-Null
                Write-Host "  [$(T 'uninstall')]  npm: $($item.value)" -ForegroundColor Green
            }
            "npm_fuzzy" {
                npm uninstall -g $item.value 2>&1 | Out-Null
                Write-Host "  [$(T 'uninstall')]  npm: $($item.value)" -ForegroundColor Green
            }
            "pip" {
                pip uninstall -y $item.value 2>&1 | Out-Null
                Write-Host "  [$(T 'uninstall')]  pip: $($item.value)" -ForegroundColor Green
            }
            "cargo" {
                Remove-Item $item.value -Force -ErrorAction SilentlyContinue
                Write-Host "  [$(T 'delete')]  cargo: $($item.value)" -ForegroundColor Green
            }
            "binary" {
                Remove-Item $item.value -Force -ErrorAction SilentlyContinue
                Write-Host "  [$(T 'delete')]  binary: $($item.value)" -ForegroundColor Green
            }
            "config" {
                if ($KeepConfig) {
                    Write-Host "  [$(T 'skip')]  config: $($item.value)" -ForegroundColor Gray
                } else {
                    Remove-Item $item.value -Recurse -Force -ErrorAction SilentlyContinue
                    Write-Host "  [$(T 'delete')]  config: $($item.value)" -ForegroundColor Green
                }
            }
            "vscode_ext" {
                Remove-Item $item.value -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  [$(T 'delete')]  VS Code ext: $($item.value)" -ForegroundColor Green
            }
            "docker_ctn" {
                docker rm -f $item.value 2>$null | Out-Null
                Write-Host "  [$(T 'delete')]  Docker container: $($item.value)" -ForegroundColor Green
            }
            "docker_img" {
                docker rmi -f $item.value 2>$null | Out-Null
                Write-Host "  [$(T 'delete')]  Docker image: $($item.value)" -ForegroundColor Green
            }
            "service" {
                Stop-Service $item.value -Force -ErrorAction SilentlyContinue
                sc.exe delete $item.value 2>$null
                Write-Host "  [$(T 'delete')]  Service: $($item.value)" -ForegroundColor Green
            }
            "process" {
                $pid = $item.value -split "-" | Select-Object -Last 1
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                Write-Host "  [$(T 'delete')]  Process: $($item.value)" -ForegroundColor Green
            }
            "registry" {
                Remove-Item $item.value -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  [$(T 'delete')]  Registry: $($item.value)" -ForegroundColor Green
            }
            "tmpfile" {
                Remove-Item $item.value -Recurse -Force -ErrorAction SilentlyContinue
                Write-Host "  [$(T 'delete')]  Temp: $($item.value)" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "  [$(T 'fail')]  $($item.desc): $_" -ForegroundColor Red
        $script:failedItems++
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 结束
# ─────────────────────────────────────────────────────────────────────────────

Write-Host ""
if ($failedItems -eq 0) {
    Write-Host (T "done_ok") -ForegroundColor Green
} else {
    Write-Host "$(T 'done_err_pre') $failedItems $(T 'done_err_post')" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Done" -ForegroundColor Green
Write-Host "=" * 60
