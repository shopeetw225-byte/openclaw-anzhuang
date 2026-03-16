@echo off
REM OpenClaw Windows 一键编译和上传脚本
REM 在配置好环境后，直接运行此脚本完成编译和上传

setlocal enabledelayedexpansion
color 0A
title OpenClaw 编译和上传

echo.
echo ================================================
echo  OpenClaw Windows 编译 + GitHub 上传
echo ================================================
echo.

REM 检查 Node.js
echo 检查 Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：未找到 Node.js
    echo 请先运行 quick-setup.bat 安装依赖
    pause
    exit /b 1
)

REM 检查 npm
echo 检查 npm...
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：未找到 npm
    pause
    exit /b 1
)

REM 检查 Git
echo 检查 Git...
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：未找到 Git
    pause
    exit /b 1
)

REM 检查 cargo
echo 检查 Rust...
where cargo >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：未找到 Rust/Cargo
    pause
    exit /b 1
)

echo.
echo [1/3] 检查 GitHub 认证...
where gh >nul 2>&1
if %errorLevel% neq 0 (
    echo 警告：未安装 GitHub CLI (gh)
    echo 请访问 https://cli.github.com/ 安装
    echo 或运行：choco install gh
    set "SKIP_UPLOAD=1"
) else (
    echo GitHub CLI 已安装
)

echo.
echo ================================================
echo  开始编译项目...
echo ================================================
echo.

REM 获取当前目录
cd /d "%~dp0"

REM 安装依赖
echo [2/3] 安装 npm 依赖...
call npm ci
if %errorLevel% neq 0 (
    echo npm 安装失败
    pause
    exit /b 1
)

REM 编译前端
echo [3/3] 编译前端...
call npm run build
if %errorLevel% neq 0 (
    echo 前端编译失败
    pause
    exit /b 1
)

REM 编译 Tauri
echo [4/4] 编译 Tauri 应用（需要 5-15 分钟）...
call npm run tauri build
if %errorLevel% neq 0 (
    echo Tauri 编译失败
    pause
    exit /b 1
)

echo.
echo ================================================
echo  编译完成！
echo ================================================
echo.

REM 检查输出文件
set "OUTPUT_DIR=%~dp0dist-windows"
if not exist "!OUTPUT_DIR!" mkdir "!OUTPUT_DIR!"

REM 复制 MSI 文件
for /r "src-tauri\target\release\bundle\msi" %%f in (*.msi) do (
    echo 复制: %%~nxf
    copy "%%f" "!OUTPUT_DIR!\" >nul
)

REM 复制 EXE 文件
for /r "src-tauri\target\release\bundle\nsis" %%f in (*-setup.exe) do (
    echo 复制: %%~nxf
    copy "%%f" "!OUTPUT_DIR!\" >nul
)

echo.
if "%SKIP_UPLOAD%"=="1" (
    echo 编译完成！安装程序已保存到 dist-windows 目录
    echo 请手动上传到 GitHub Release：
    echo   gh release upload v0.1.0 dist-windows\* --repo shopeetw225-byte/openclaw-anzhuang
) else (
    echo 上传到 GitHub Release...
    call gh release upload v0.1.0 "!OUTPUT_DIR!\*" --repo shopeetw225-byte/openclaw-anzhuang --clobber
    if !errorLevel! equ 0 (
        echo 上传成功！
        echo 下载链接：https://github.com/shopeetw225-byte/openclaw-anzhuang/releases/tag/v0.1.0
    ) else (
        echo 上传失败，请手动上传文件
    )
)

echo.
pause
