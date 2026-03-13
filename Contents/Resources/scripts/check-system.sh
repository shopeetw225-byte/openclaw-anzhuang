#!/usr/bin/env bash
set -euo pipefail

echo "=== 系统环境检测 ==="
echo "时间: $(date)"
echo "用户: $(whoami)"
echo "主机: $(hostname)"
echo "系统: $(uname -a)"
echo ""

# Node.js
if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v)
  NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 20 ]; then
    echo "✅ Node.js: ${NODE_VERSION}（满足要求）"
  else
    echo "⚠️  Node.js: ${NODE_VERSION}（需要 20+）"
  fi
else
  echo "❌ Node.js: 未安装"
fi

# npm
if command -v npm >/dev/null 2>&1; then
  echo "✅ npm: $(npm -v)"
else
  echo "❌ npm: 未安装"
fi

# Homebrew
if command -v brew >/dev/null 2>&1; then
  echo "✅ Homebrew: 已安装"
else
  echo "ℹ️  Homebrew: 未安装（将使用 nvm 安装 Node）"
fi

# OpenClaw
if command -v openclaw >/dev/null 2>&1; then
  echo "✅ OpenClaw: $(openclaw --version 2>/dev/null || echo '已安装')"
else
  echo "❌ OpenClaw: 未安装"
fi

# Port 18789
if lsof -i :18789 >/dev/null 2>&1; then
  echo "✅ Gateway: 端口 18789 监听中"
else
  echo "❌ Gateway: 端口 18789 未监听"
fi

# Disk space
DISK_FREE=$(df -m ~ | tail -1 | awk '{print $4}')
if [ "$DISK_FREE" -gt 500 ]; then
  echo "✅ 磁盘空间: ${DISK_FREE}MB 可用"
else
  echo "⚠️  磁盘空间: ${DISK_FREE}MB 可用（建议 500MB 以上）"
fi
