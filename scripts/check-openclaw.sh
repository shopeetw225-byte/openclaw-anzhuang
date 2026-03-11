#!/usr/bin/env bash
set -euo pipefail

echo "=== OpenClaw 状态检测 ==="
echo "时间: $(date)"
echo ""

# OpenClaw version
if command -v openclaw >/dev/null 2>&1; then
  OPENCLAW_VERSION="$(openclaw --version 2>/dev/null || echo '未知')"
  echo "✅ OpenClaw 版本: ${OPENCLAW_VERSION}"
else
  echo "❌ OpenClaw 未安装"
  exit 1
fi

# Overall status
echo ""
echo "--- openclaw status ---"
openclaw status 2>/dev/null || echo "（无法获取状态）"

# Gateway status
echo ""
echo "--- gateway 状态 ---"
openclaw gateway status 2>/dev/null || echo "（Gateway 未运行）"

# Port check
echo ""
echo "--- 端口 18789 ---"
if lsof -i :18789 >/dev/null 2>&1; then
  echo "✅ 端口 18789 正在监听"
  lsof -i :18789 | head -3
else
  echo "❌ 端口 18789 未监听"
fi

# Error log (last 5 lines)
ERRLOG="$HOME/.openclaw/logs/gateway.err.log"
if [ -f "$ERRLOG" ]; then
  echo ""
  echo "--- 最近错误日志 ---"
  tail -5 "$ERRLOG"
fi
