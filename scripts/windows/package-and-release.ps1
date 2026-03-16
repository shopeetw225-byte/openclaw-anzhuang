#Requires -Version 5.1
<#
.SYNOPSIS
    OpenClaw 安装器 - 一键打包上传脚本
.DESCRIPTION
    自动完成：编译 → 打包 → 上传到 GitHub Release
.EXAMPLE
    .\package-and-release.ps1
    .\package-and-release.ps1 -Version "0.2.0"
    .\package-and-release.ps1 -Clean
#>
[CmdletBinding()]
param(
    [string]$Version,
    [switch]$Clean,
    [switch]$NoUpload,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ─────────────────────────────────────────────────────────────────────────────
# 配置
# ─────────────────────────────────────────────────────────────────────────────

$PROJECT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$OUTPUT_DIR = Join-Path $PROJECT_DIR "dist-windows"
$REPO = "shopeetw225-byte/openclaw-anzhuang"

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

function Write-Info($Message) {
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
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
# 第 1 步：获取版本号
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "🔍 获取版本信息"

if (-not $Version) {
    # 从 package.json 读取版本
    $packageJson = Get-Content "$PROJECT_DIR\package.json" | ConvertFrom-Json
    $Version = $packageJson.version
    Write-Info "从 package.json 读取版本: $Version"
}

Write-Success "版本号: $Version"

$TAG = "v$Version"
Write-Info "将创建标签: $TAG"

# ─────────────────────────────────────────────────────────────────────────────
# 第 2 步：检查 Git 状态
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "📦 检查 Git 状态"

Push-Location $PROJECT_DIR
try {
    $gitStatus = git status --porcelain
    if ($gitStatus) {
        Write-Warning-Custom "工作目录有未提交的更改："
        Write-Host $gitStatus
        $confirm = Read-Host "是否继续? (y/n)"
        if ($confirm -ne 'y') {
            exit 1
        }
    }
    Write-Success "Git 状态检查完成"
}
finally {
    Pop-Location
}

# ─────────────────────────────────────────────────────────────────────────────
# 第 3 步：编译项目
# ─────────────────────────────────────────────────────────────────────────────

if ($DryRun) {
    Write-Header "🧪 DRY RUN 模式 - 跳过编译"
    Write-Info "将执行以下步骤（不实际操作）："
    Write-Host "1. 编译项目"
    Write-Host "2. 创建标签: $TAG"
    Write-Host "3. 上传到 GitHub Release"
} else {
    Write-Header "🔨 开始编译项目"

    # 调用 build-windows.ps1
    $buildScript = Join-Path $PROJECT_DIR "build-windows.ps1"
    if (-not (Test-Path $buildScript)) {
        Write-Error-Custom "找不到编译脚本: $buildScript"
        exit 1
    }

    $buildArgs = @()
    if ($Clean) {
        $buildArgs += "-Clean"
    }

    Write-Info "运行编译脚本..."
    & $buildScript @buildArgs

    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "编译失败，退出码: $LASTEXITCODE"
        exit 1
    }

    Write-Success "编译完成"
}

# ─────────────────────────────────────────────────────────────────────────────
# 第 4 步：验证输出文件
# ─────────────────────────────────────────────────────────────────────────────

if (-not $DryRun) {
    Write-Header "📋 验证输出文件"

    if (-not (Test-Path $OUTPUT_DIR)) {
        Write-Error-Custom "输出目录不存在: $OUTPUT_DIR"
        exit 1
    }

    $files = Get-ChildItem -Path $OUTPUT_DIR -File
    if ($files.Count -eq 0) {
        Write-Error-Custom "没有生成任何安装程序文件"
        exit 1
    }

    Write-Success "找到 $($files.Count) 个安装程序文件:"
    $files | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  📦 $($_.Name) ($size MB)" -ForegroundColor Yellow
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 第 5 步：创建 Git 标签
# ─────────────────────────────────────────────────────────────────────────────

if ($DryRun) {
    Write-Header "📌 创建 Git 标签 (DRY RUN)"
    Write-Info "将执行: git tag $TAG"
    Write-Info "将执行: git push origin $TAG"
} else {
    Write-Header "📌 创建 Git 标签"

    Push-Location $PROJECT_DIR
    try {
        # 检查标签是否已存在
        $tagExists = git tag -l $TAG
        if ($tagExists) {
            Write-Warning-Custom "标签已存在: $TAG"
            $confirm = Read-Host "是否删除并重新创建? (y/n)"
            if ($confirm -eq 'y') {
                git tag -d $TAG
                git push origin :$TAG
            } else {
                Write-Info "跳过标签创建"
            }
        }

        if (-not $tagExists -or $confirm -eq 'y') {
            Write-Info "创建标签: $TAG"
            git tag -a $TAG -m "Release $Version"
            Write-Success "标签已创建"

            Write-Info "推送标签到 GitHub..."
            git push origin $TAG
            Write-Success "标签已推送"
        }
    }
    finally {
        Pop-Location
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 第 6 步：上传到 GitHub Release
# ─────────────────────────────────────────────────────────────────────────────

if ($NoUpload) {
    Write-Header "⏭️  跳过上传 (--NoUpload)"
    Write-Info "文件已准备好，位置: $OUTPUT_DIR"
    Write-Info "手动上传命令:"
    Write-Host "  gh release upload $TAG $OUTPUT_DIR\* --repo $REPO" -ForegroundColor Yellow
} elseif ($DryRun) {
    Write-Header "📤 上传到 GitHub Release (DRY RUN)"
    Write-Info "将上传以下文件到 Release $TAG:"
    Get-ChildItem -Path $OUTPUT_DIR -File | ForEach-Object {
        Write-Host "  📦 $($_.Name)" -ForegroundColor Yellow
    }
} else {
    Write-Header "📤 上传到 GitHub Release"

    # 检查 gh CLI
    if (-not (Test-Command gh)) {
        Write-Error-Custom "未安装 GitHub CLI (gh)"
        Write-Host "请从 https://cli.github.com/ 安装，或使用以下命令:"
        Write-Host "  choco install gh" -ForegroundColor Yellow
        exit 1
    }

    # 检查认证
    Write-Info "检查 GitHub 认证..."
    $authStatus = gh auth status 2>&1
    if ($authStatus -match "not logged in") {
        Write-Error-Custom "未登录 GitHub，请先认证"
        Write-Host "运行: gh auth login" -ForegroundColor Yellow
        exit 1
    }

    Write-Info "认证成功"

    # 获取输出文件
    $files = Get-ChildItem -Path $OUTPUT_DIR -File
    $filePaths = $files.FullName -join ' '

    Write-Info "上传 $($files.Count) 个文件到 Release $TAG..."

    # 检查 Release 是否存在
    $releaseExists = gh release view $TAG --repo $REPO 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Info "Release 已存在，添加文件..."
        gh release upload $TAG $filePaths --repo $REPO --clobber
    } else {
        Write-Info "创建新 Release..."
        $releaseNotes = @"
🎉 OpenClaw 安装器 v$Version 发布

## 📦 文件
- **Windows x64 MSI**：标准安装程序
- **Windows x64 EXE**：便携式安装程序
- **macOS (Apple Silicon)**：通用安装程序

## ✨ 功能
- ✅ 一键部署 AI Agent Gateway
- ✅ 实时监控 Dashboard
- ✅ 配置管理向导
- ✅ 深度卸载清理（集成 ByeByeClaw）
- ✅ 多平台支持（Windows/macOS/Linux）

## 📥 使用
1. 下载对应平台的安装程序
2. 运行安装程序
3. 跟随安装向导完成

[查看文档](https://github.com/$REPO#-文档) | [报告问题](https://github.com/$REPO/issues)
"@
        gh release create $TAG $filePaths `
            --title "OpenClaw 安装器 v$Version" `
            --notes $releaseNotes `
            --repo $REPO
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Success "文件已上传到 Release: $TAG"
        Write-Info "Release 链接: https://github.com/$REPO/releases/tag/$TAG"
    } else {
        Write-Error-Custom "上传失败"
        exit 1
    }
}

# ─────────────────────────────────────────────────────────────────────────────
# 完成
# ─────────────────────────────────────────────────────────────────────────────

Write-Header "✨ 全部完成！"

if ($DryRun) {
    Write-Info "这是 DRY RUN 模式，没有实际操作"
    Write-Info "如需实际执行，请移除 -DryRun 参数"
} else {
    Write-Host "📊 完成步骤:" -ForegroundColor Green
    Write-Host "  ✅ 编译项目" -ForegroundColor Green
    Write-Host "  ✅ 创建标签: $TAG" -ForegroundColor Green

    if (-not $NoUpload) {
        Write-Host "  ✅ 上传到 GitHub Release" -ForegroundColor Green
        Write-Host "`n📥 用户可以从以下链接下载:" -ForegroundColor Cyan
        Write-Host "  https://github.com/$REPO/releases/tag/$TAG" -ForegroundColor Cyan
    }
}

Write-Host "`n"
