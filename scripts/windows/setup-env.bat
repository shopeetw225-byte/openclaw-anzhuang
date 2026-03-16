@echo off
REM OpenClaw Windows 编译环境配置脚本（批处理包装）
REM 自动请求管理员权限并运行 PowerShell 脚本

echo 正在以管理员身份运行环境配置脚本...
powershell -NoProfile -ExecutionPolicy Bypass -Command "& {Start-Process powershell.exe -Verb RunAs -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0setup-windows-env.ps1\"' -Wait}"

pause
