#!/usr/bin/env bash
# install-service-linux.sh — 注册 OpenClaw Gateway 为 systemd 用户服务
# 用法: install-service-linux.sh [openclaw 可执行路径]
set -uo pipefail

OPENCLAW_CMD="${1:-$(which openclaw 2>/dev/null || echo 'openclaw')}"
SERVICE_NAME="openclaw-gateway"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/${SERVICE_NAME}.service"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

if ! systemctl --user status >/dev/null 2>&1; then
  log "警告: systemd --user 不可用，跳过服务注册"
  exit 0
fi

mkdir -p "$SERVICE_DIR"

cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=OpenClaw AI Gateway
After=network.target

[Service]
Type=simple
ExecStart=${OPENCLAW_CMD} gateway start
ExecStop=${OPENCLAW_CMD} gateway stop
Restart=on-failure
RestartSec=5s
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

log "写入 service 文件: $SERVICE_FILE"

systemctl --user daemon-reload 2>/dev/null || true

systemctl --user enable "$SERVICE_NAME" 2>/dev/null && \
  log "已启用 $SERVICE_NAME 开机自启" || \
  log "警告: 启用失败（可能 loginctl 未配置）"

if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$(whoami)" 2>/dev/null || true
fi

log "systemd 服务注册完成"
log "手动控制: systemctl --user start/stop/status $SERVICE_NAME"

