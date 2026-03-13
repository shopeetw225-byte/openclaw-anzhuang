#requires -Version 5.1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log([string]$Message) {
  $ts = Get-Date -Format 'HH:mm:ss'
  Write-Output "[$ts] $Message"
}

try {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm -or -not $npm.Source) {
    throw '未找到 npm（请先安装 Node.js）'
  }

  Write-Output 'npm install -g openclaw'
  & $npm.Source install -g openclaw 2>&1 | ForEach-Object { Write-Output $_ }
  if ($LASTEXITCODE -ne 0) {
    throw "npm install 失败（exit $LASTEXITCODE）"
  }

  $openclaw = Get-Command openclaw -ErrorAction SilentlyContinue
  if (-not $openclaw -or -not $openclaw.Source) {
    throw '安装完成后仍未找到 openclaw 命令'
  }

  Write-Output 'openclaw gateway start'
  & $openclaw.Source gateway start 2>&1 | ForEach-Object { Write-Output $_ }

  $listening = $false
  for ($i = 0; $i -lt 12; $i++) {
    try {
      $r = Test-NetConnection -ComputerName '127.0.0.1' -Port 18789 -WarningAction SilentlyContinue
      if ($r.TcpTestSucceeded) {
        $listening = $true
        break
      }
    } catch {
      # ignore
    }
    Start-Sleep -Seconds 1
  }

  if ($listening) {
    Write-Output 'gateway listening'
  } else {
    Write-Log '警告：未检测到 18789 端口监听（Gateway 可能仍在启动中）'
  }

  Write-Output 'Done'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

