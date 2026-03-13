#Requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$Purge  # 传入 -Purge 则同时删除 $HOME\.openclaw 数据目录
)

$ErrorActionPreference = 'Continue'

Write-Output "=== OpenClaw 卸载向导（Windows）==="

# 步骤 1：停止并注销 Windows 服务（NSSM 管理的 openclaw-gateway）
Write-Output "[步骤 1/3] 停止 Gateway 服务..."

$NssmPath = $null
$NssmLocal = "$HOME\.openclaw\bin\nssm.exe"
if (Test-Path $NssmLocal) {
    $NssmPath = $NssmLocal
} elseif (Get-Command nssm.exe -ErrorAction SilentlyContinue) {
    $NssmPath = (Get-Command nssm.exe).Source
}

$ServiceName = "openclaw-gateway"
if ($NssmPath) {
    & $NssmPath stop $ServiceName 2>$null
    & $NssmPath remove $ServiceName confirm 2>$null
    Write-Output "  已注销 NSSM 服务 $ServiceName"
} else {
    # 尝试原生 sc.exe
    sc.exe stop $ServiceName 2>$null
    sc.exe delete $ServiceName 2>$null
    Write-Output "  尝试用 sc.exe 注销服务（NSSM 未找到）"
}

# 兜底：kill openclaw 相关进程
try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -like "*openclaw*gateway*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {
    # ignore
}

# 步骤 2：卸载 npm 包
Write-Output "[步骤 2/3] 卸载 openclaw npm 包..."
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm uninstall -g openclaw 2>&1 | Write-Output
    Write-Output "  openclaw 已从 npm 全局包中移除"
} else {
    Write-Output "  未找到 npm，跳过"
}

# 步骤 3：可选删除数据目录
Write-Output "[步骤 3/3] 处理数据目录..."
$DataDir = "$HOME\.openclaw"
if ($Purge) {
    if (Test-Path $DataDir) {
        Remove-Item -Recurse -Force $DataDir
        Write-Output "  已删除 $DataDir"
    } else {
        Write-Output "  数据目录不存在，跳过"
    }
} else {
    Write-Output "  保留数据目录 $DataDir（传入 -Purge 可删除）"
}

Write-Output ""
Write-Output "Done"
Write-Output "=== 卸载完成 ==="

