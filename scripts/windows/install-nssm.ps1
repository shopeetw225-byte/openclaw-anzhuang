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
  $destExe = Join-Path (Join-Path $HOME '.openclaw\bin') 'nssm.exe'
  Write-Log "目标路径: $destExe"

  try {
    # MUST use the fixed URL + extraction logic below.
    $NssmUrl   = "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip"
    $ZipPath   = "$env:TEMP\nssm.zip"
    $ExtractTo = "$env:TEMP\nssm-extract"
    Invoke-WebRequest -Uri $NssmUrl -OutFile $ZipPath -UseBasicParsing
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractTo -Force
    # x64 目录固定为 win64
    $NssmExe = Join-Path $ExtractTo "nssm-2.24-101-g897c7ad\win64\nssm.exe"
    $Dest = "$HOME\.openclaw\bin"
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
    Copy-Item $NssmExe -Destination "$Dest\nssm.exe" -Force

    Write-Log "已安装: $destExe"
  } catch {
    Write-Log "从 nssm.cc 下载失败：$($_.Exception.Message)"
    Write-Log '尝试回退：从 PATH/winget 获取 nssm.exe 并复制到用户目录'

    $nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if (-not $nssmCmd) {
      $winget = Get-Command winget -ErrorAction SilentlyContinue
      if ($winget) {
        & winget install nssm --silent --accept-package-agreements --accept-source-agreements 2>&1 | ForEach-Object { Write-Output $_ }
        $nssmCmd = Get-Command nssm.exe -ErrorAction SilentlyContinue
      }
    }

    if (-not $nssmCmd -or -not $nssmCmd.Source) {
      throw '无法获取 nssm.exe（下载与回退方案均失败）'
    }

    $destDir = Join-Path $HOME '.openclaw\bin'
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item $nssmCmd.Source -Destination (Join-Path $destDir 'nssm.exe') -Force
    Write-Log "已复制 nssm.exe 到: $destExe"
  }

  Write-Output $destExe
  Write-Output 'Done'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

