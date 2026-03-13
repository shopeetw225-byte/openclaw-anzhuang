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
    Write-Log '需要管理员权限以启用 WSL2，正在请求 UAC...'
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

  $rebootRequired = $false

  Write-Log 'Installing WSL'
  try {
    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if (-not $wsl) {
      throw 'wsl.exe not found'
    }

    Write-Log '尝试使用: wsl --install -d Ubuntu'
    $out = & wsl.exe --install -d Ubuntu 2>&1
    $out | ForEach-Object { Write-Output $_ }

    if ($LASTEXITCODE -ne 0) {
      throw "wsl --install 失败（exit $LASTEXITCODE）"
    }

    if (($out -join "`n") -match '(?i)restart|reboot') {
      $rebootRequired = $true
    }
  } catch {
    Write-Log "wsl --install 不可用，回退到 DISM 开启功能：$($_.Exception.Message)"

    foreach ($feature in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')) {
      Write-Log "启用功能: $feature"
      & dism.exe /online /enable-feature /featurename:$feature /all /norestart 2>&1 | ForEach-Object { Write-Output $_ }

      if ($LASTEXITCODE -eq 3010) {
        $rebootRequired = $true
      } elseif ($LASTEXITCODE -ne 0) {
        throw "DISM 启用 $feature 失败（exit $LASTEXITCODE）"
      }
    }

    try {
      Write-Log '设置 WSL 默认版本为 2'
      & wsl.exe --set-default-version 2 2>&1 | ForEach-Object { Write-Output $_ }
    } catch {
      Write-Log "wsl --set-default-version 2 失败（可忽略）：$($_.Exception.Message)"
    }
  }

  if ($rebootRequired) {
    Write-Output 'REBOOT_REQUIRED'
    Write-Output 'Done'
    exit 0
  }

  Write-Output 'Done'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

