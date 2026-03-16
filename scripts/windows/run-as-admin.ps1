param([string]$ScriptPath)

function Test-Admin {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal $currentUser
    return $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
}

if (-not (Test-Admin)) {
    Write-Host "需要管理员权限，正在请求提升..." -ForegroundColor Yellow

    # 以管理员身份重新运行
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait
} else {
    & $ScriptPath
}
