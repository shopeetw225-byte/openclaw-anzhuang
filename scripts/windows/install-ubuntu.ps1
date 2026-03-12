#requires -Version 5.1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message) {
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Output "[$ts] $Message"
}

function Test-IsAdmin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }

try {
  if (-not (Test-IsAdmin)) {
    Write-Log '安装 Ubuntu 发行版到 WSL 需要管理员权限，正在请求 UAC...'
    $argList = @(
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', "`"$scriptPath`""
    )
    $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -Wait -PassThru
    if ($p.ExitCode -ne 0) {
      throw "以管理员执行失败（exit $($p.ExitCode)）"
    }
    Write-Output 'Done'
    exit 0
  }

  Write-Log 'Checking WSL availability'
  $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
  if (-not $wsl) {
    throw 'wsl.exe not found - WSL2 is not installed'
  }

  Write-Log 'Checking existing distributions'
  $distros = & wsl.exe -l --quiet 2>&1
  $hasUbuntu = $false
  foreach ($distro in $distros) {
    if ($distro -match '(?i)ubuntu') {
      $hasUbuntu = $true
      Write-Log "Found existing Ubuntu: $distro"
    }
  }

  if ($hasUbuntu) {
    Write-Log 'Ubuntu is already installed'
    Write-Output 'Done'
    exit 0
  }

  Write-Log 'Installing Ubuntu distribution'
  Write-Log '尝试使用: wsl --install -d Ubuntu'
  $out = & wsl.exe --install -d Ubuntu 2>&1
  $out | ForEach-Object { Write-Output $_ }

  if ($LASTEXITCODE -ne 0) {
    throw "wsl --install -d Ubuntu failed（exit $LASTEXITCODE）"
  }

  # 检查是否需要重启（一般 wsl --install 需要重启）
  if (($out -join "`n") -match '(?i)restart|reboot|requires restart') {
    Write-Log 'System restart required for Ubuntu installation to complete'
    Write-Output 'REBOOT_REQUIRED'
  }

  Write-Output 'Done'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
