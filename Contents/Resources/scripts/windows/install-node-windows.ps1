#requires -Version 5.1
[CmdletBinding()]
param(
  [ValidateSet('auto', 'msi')]
  [string]$Mode = 'auto'
)

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

function Parse-NodeMajor([string]$VersionText) {
  if ($VersionText -match 'v?(\d+)\.') {
    return [int]$Matches[1]
  }
  return $null
}

function Find-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd -and $cmd.Source) {
    return $cmd.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($candidates.Count -gt 0) {
    return $candidates[0]
  }
  return $null
}

function Install-NodeViaWinget {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    return $false
  }

  $common = @('--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements')

  Write-Log '检测到 winget，优先尝试安装 OpenJS.NodeJS（建议 Node 22）'
  & winget install --id OpenJS.NodeJS @common --scope user 2>&1 | ForEach-Object { Write-Output $_ }
  if ($LASTEXITCODE -eq 0) { return $true }

  Write-Log "OpenJS.NodeJS（user scope）失败（exit $LASTEXITCODE），重试不指定 scope（可能触发 UAC）"
  & winget install --id OpenJS.NodeJS @common 2>&1 | ForEach-Object { Write-Output $_ }
  if ($LASTEXITCODE -eq 0) { return $true }

  Write-Log "OpenJS.NodeJS 失败（exit $LASTEXITCODE），回退到 OpenJS.NodeJS.LTS"
  & winget install --id OpenJS.NodeJS.LTS @common --scope user 2>&1 | ForEach-Object { Write-Output $_ }
  if ($LASTEXITCODE -eq 0) { return $true }

  & winget install --id OpenJS.NodeJS.LTS @common 2>&1 | ForEach-Object { Write-Output $_ }
  return ($LASTEXITCODE -eq 0)
}

function Get-NodeArch {
  if ($env:PROCESSOR_ARCHITECTURE -match 'ARM64') { return 'arm64' }
  return 'x64'
}

function Install-NodeViaMsi {
  $arch = Get-NodeArch
  $tempDir = $env:TEMP
  if (-not $tempDir) { $tempDir = '.' }

  foreach ($major in @(22, 20)) {
    try {
      $dir = "latest-v$major.x"
      $shasumsUrl = "https://nodejs.org/dist/$dir/SHASUMS256.txt"
      Write-Log "获取 Node 发行信息: $shasumsUrl"
      $resp = Invoke-WebRequest -Uri $shasumsUrl -UseBasicParsing -ErrorAction Stop

      $line = ($resp.Content -split "`n" | Where-Object { $_ -match "node-v\\d+\\.\\d+\\.\\d+-$arch\\.msi" } | Select-Object -First 1)
      if (-not $line) { throw "未找到 $arch MSI 文件名（$dir）" }
      $parts = ($line.Trim() -split '\s+')
      if ($parts.Count -lt 2) { throw "SHASUMS 行解析失败: $line" }
      $fileName = $parts[-1]

      $msiUrl = "https://nodejs.org/dist/$dir/$fileName"
      $msiPath = Join-Path $tempDir $fileName
      Write-Log "下载 MSI: $msiUrl"
      Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing -ErrorAction Stop

      Write-Log "静默安装 MSI（可能需要管理员权限）: $msiPath"
      $args = "/i `"$msiPath`" /qn /norestart"
      $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList $args -Wait -PassThru
      if ($p.ExitCode -eq 0 -or $p.ExitCode -eq 3010) {
        if ($p.ExitCode -eq 3010) { Write-Log 'Node 安装完成，但需要重启' }
        return
      }
      throw "msiexec 失败（exit $($p.ExitCode)）"
    } catch {
      Write-Log "Node v$major MSI 安装尝试失败：$($_.Exception.Message)"
    }
  }

  throw 'Node MSI 安装失败（已尝试 v22 与 v20）'
}

Write-Output 'Checking Node'

try {
  $nodePath = Find-NodePath
  if ($nodePath) {
    $ver = & $nodePath -v 2>$null
    Write-Log "已检测到 Node: $ver"
    $major = Parse-NodeMajor $ver
    if ($major -ne $null -and $major -ge 20) {
      Write-Log 'Node.js 版本满足要求（>=20），跳过安装'
      Write-Output $ver
      Write-Output 'Done'
      exit 0
    }
  } else {
    Write-Log '未检测到 Node'
  }

  Write-Output 'Installing Node'

  $installed = $false
  if ($Mode -eq 'auto') {
    $installed = Install-NodeViaWinget
  }

  if (-not $installed -and $Mode -ne 'msi') {
    Write-Log 'winget 路径不可用/失败，准备回退到 MSI 安装'
  }

  if (-not $installed) {
    if ($Mode -eq 'auto' -and -not (Test-IsAdmin)) {
      Write-Log 'MSI 安装可能需要管理员权限，正在请求 UAC...'
      $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { $MyInvocation.MyCommand.Path }
      $argList = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$scriptPath`"",
        '-Mode', 'msi'
      )
      $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList -Wait -PassThru
      if ($p.ExitCode -ne 0) {
        throw "以管理员执行 MSI 安装失败（exit $($p.ExitCode)）"
      }
    } else {
      if ($Mode -ne 'msi' -and -not (Test-IsAdmin)) {
        Write-Log '提示：当前非管理员，MSI 安装可能失败；建议允许 UAC 或改用 winget'
      }
      Install-NodeViaMsi
    }
  }

  $nodePath = Find-NodePath
  if (-not $nodePath) {
    throw '安装完成后仍未找到 node.exe（PATH 可能未刷新）'
  }

  $ver = & $nodePath -v 2>$null
  if (-not $ver) { throw '无法获取 node -v' }

  Write-Output $ver
  Write-Output 'Done'
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}

