#!/usr/bin/env bash
set -euo pipefail

# ── 可选参数：--purge 同时删除 ~/.openclaw 数据目录 ──────────────────────────
PURGE=false
for arg in "$@"; do
  [[ "$arg" == "--purge" ]] && PURGE=true
done

echo "=== OpenClaw 卸载向导 ==="

# 步骤 1：停止 Gateway
echo "[步骤 1/3] 停止 Gateway 服务..."

# 优先用 openclaw gateway uninstall（官方方式，会自动处理 LaunchAgent/systemd）
OPENCLAW_BIN=""
for candidate in \
    "$(which openclaw 2>/dev/null)" \
    "$HOME/node-v"*"/bin/openclaw" \
    "$HOME/.nvm/versions/node/"*"/bin/openclaw" \
    "$HOME/.volta/bin/openclaw" \
    "/usr/local/bin/openclaw" \
    "/opt/homebrew/bin/openclaw"; do
  # 展开 glob
  for bin in $candidate; do
    [[ -x "$bin" ]] && OPENCLAW_BIN="$bin" && break 2
  done
done

if [[ -n "$OPENCLAW_BIN" ]]; then
  echo "  使用 $OPENCLAW_BIN gateway uninstall"
  "$OPENCLAW_BIN" gateway stop 2>/dev/null || true
  "$OPENCLAW_BIN" gateway uninstall 2>/dev/null || echo "  gateway uninstall 失败（可能已注销）"
else
  echo "  未找到 openclaw 命令，降级为手动清理..."
fi

# macOS 兜底：手动移除 LaunchAgent
if [[ "$(uname)" == "Darwin" ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.openclaw.gateway.plist"
  if [[ -f "$PLIST" ]]; then
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "  已移除 LaunchAgent"
  fi
fi

# Linux：停止 systemd user service
if command -v systemctl &>/dev/null; then
  systemctl --user stop openclaw-gateway.service 2>/dev/null || true
  systemctl --user disable openclaw-gateway.service 2>/dev/null || true
  SERVICE_FILE="$HOME/.config/systemd/user/openclaw-gateway.service"
  [[ -f "$SERVICE_FILE" ]] && rm -f "$SERVICE_FILE"
  systemctl --user daemon-reload 2>/dev/null || true
  echo "  已移除 systemd 服务"
fi

# 兜底：直接 kill openclaw gateway 进程
pkill -f "openclaw gateway" 2>/dev/null || true

# 步骤 2：卸载 npm 包
echo "[步骤 2/3] 卸载 openclaw npm 包..."
if command -v npm &>/dev/null; then
  npm uninstall -g openclaw 2>&1 || echo "  npm uninstall 失败（可能已卸载）"
  echo "  openclaw 已从 npm 全局包中移除"
else
  echo "  未找到 npm，跳过"
fi

# 步骤 3：可选删除数据目录
echo "[步骤 3/3] 处理数据目录..."
DATA_DIR="$HOME/.openclaw"
if [[ "$PURGE" == "true" ]]; then
  if [[ -d "$DATA_DIR" ]]; then
    rm -rf "$DATA_DIR"
    echo "  已删除 $DATA_DIR"
  else
    echo "  数据目录不存在，跳过"
  fi
else
  echo "  保留数据目录 $DATA_DIR（如需删除，手动执行 rm -rf ~/.openclaw）"
fi

echo ""
echo "Done"
echo "=== 卸载完成 ==="

