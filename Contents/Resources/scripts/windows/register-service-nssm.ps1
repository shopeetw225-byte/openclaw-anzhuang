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

$serviceName = 'openclaw-gateway'
$scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }

try {
  if (-not (Test-IsAdmin)) {
    Write-Log '注册 Windows 服务需要管理员权限，正在请求 UAC...'
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

  $nssmPath = Join-Path $HOME '.openclaw\bin\nssm.exe'
  if (-not (Test-Path $nssmPath)) {
    $nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($nssmCmd -and $nssmCmd.Source) {
      $nssmPath = $nssmCmd.Source
    }
  }
  if (-not (Test-Path $nssmPath)) {
    throw '未找到 nssm.exe（请先运行 install-nssm.ps1 或确保 nssm 在 PATH 中）'
  }

  $openclawCmd = Get-Command openclaw -ErrorAction SilentlyContinue
  if (-not $openclawCmd -or -not $openclawCmd.Source) {
    throw '未找到 openclaw 命令（请先运行 install-openclaw.ps1）'
  }
  $openclawPath = $openclawCmd.Source

  $logDir = Join-Path $HOME '.openclaw\logs'
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $logFile = Join-Path $logDir 'windows-service.log'

  try {
    if ($openclawPath.ToLower().EndsWith('.cmd')) {
      $app = $env:ComSpec
      $appArgs = @('/c', "`"$openclawPath`" gateway start")
      & $nssmPath install $serviceName $app @appArgs 2>&1 | ForEach-Object { Write-Output $_ }
    } else {
      & $nssmPath install $serviceName $openclawPath 'gateway' 'start' 2>&1 | ForEach-Object { Write-Output $_ }
    }
  } catch {
    Write-Log "nssm install 可能失败（服务已存在？）：$($_.Exception.Message)"
  }

  & $nssmPath set $serviceName Start SERVICE_AUTO_START 2>&1 | ForEach-Object { Write-Output $_ }
  & $nssmPath set $serviceName AppStdout $logFile 2>&1 | ForEach-Object { Write-Output $_ }
  & $nssmPath set $serviceName AppStderr $logFile 2>&1 | ForEach-Object { Write-Output $_ }
  & $nssmPath set $serviceName AppRotateFiles 1 2>&1 | ForEach-Object { Write-Output $_ }
  & $nssmPath set $serviceName AppRotateOnline 1 2>&1 | ForEach-Object { Write-Output $_ }

  Write-Log "服务已配置: $serviceName"
  Write-Log "日志: $logFile"

  Write-Output 'Done'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

