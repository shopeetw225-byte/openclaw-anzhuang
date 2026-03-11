#!/usr/bin/env bash
# install-linux.sh — OpenClaw Linux 安装脚本
# 支持 Ubuntu 22.04 / Debian 12 / Raspberry Pi OS
# 不需要 sudo（Node.js 通过 nvm 安装到用户目录）
set -uo pipefail

REQUIRED_NODE_MAJOR=20
OPENCLAW_PKG="openclaw"

log() { echo "[$(date '+%H:%M:%S')] $*"; }
step() {
  echo ""
  echo "=== $* ==="
}

detect_distro() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

DISTRO=$(detect_distro)
log "发行版: $DISTRO"
log "架构: $(uname -m)"

step "步骤 1：检查 Node.js 环境"
echo "[步骤 1] 检查 Node.js"
echo "Checking Node"

NODE_OK=false
NODE_CMD=""

for node_candidate in \
  "$HOME/.nvm/versions/node/"*/bin/node \
  "$HOME/.volta/bin/node" \
  /usr/bin/node \
  /usr/local/bin/node \
  /snap/bin/node; do
  if [ -x "$node_candidate" ]; then
    version=$("$node_candidate" -v 2>/dev/null | tr -d 'v' | cut -d. -f1 || echo "0")
    if [ "$version" -ge "$REQUIRED_NODE_MAJOR" ] 2>/dev/null; then
      NODE_OK=true
      NODE_CMD="$node_candidate"
      log "已有 Node.js $(${NODE_CMD} -v)，跳过安装"
      break
    fi
  fi
done

if [ "$NODE_OK" = false ]; then
  step "步骤 2：安装 Node.js（通过 nvm）"
  echo "Installing Node"
  echo "安装 Node"
  echo "Downloading node"

  export NVM_DIR="$HOME/.nvm"
  if [ ! -d "$NVM_DIR" ]; then
    log "下载 nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  fi

  # shellcheck disable=SC1090
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  log "安装 Node.js ${REQUIRED_NODE_MAJOR}..."
  echo "nvm install ${REQUIRED_NODE_MAJOR}"
  nvm install "${REQUIRED_NODE_MAJOR}" 2>&1
  nvm use "${REQUIRED_NODE_MAJOR}" 2>&1
  nvm alias default "${REQUIRED_NODE_MAJOR}" 2>&1

  NODE_CMD="$(which node 2>/dev/null || true)"
  if [ -z "$NODE_CMD" ]; then
    NODE_CMD=$(ls "$NVM_DIR/versions/node/"*/bin/node 2>/dev/null | sort -V | tail -1 || true)
  fi

  if [ -z "$NODE_CMD" ] || [ ! -x "$NODE_CMD" ]; then
    echo "[ERROR] Node.js 安装失败，请检查网络连接后重试"
    exit 1
  fi
  log "Node.js 安装完成: $($NODE_CMD -v)"
fi

NPM_CMD="$(dirname "$NODE_CMD")/npm"
if [ ! -x "$NPM_CMD" ]; then
  NPM_CMD=$(which npm 2>/dev/null || true)
fi
log "npm: $($NPM_CMD -v 2>/dev/null || echo '未找到')"

step "步骤 3：安装 OpenClaw"

if "$NPM_CMD" list -g "$OPENCLAW_PKG" 2>/dev/null | grep -q "$OPENCLAW_PKG"; then
  log "OpenClaw 已安装，升级到最新版..."
fi

log "安装 OpenClaw..."
echo "npm install -g openclaw"
"$NPM_CMD" install -g "$OPENCLAW_PKG" 2>&1

OPENCLAW_CMD=$(which openclaw 2>/dev/null || "$(dirname "$NODE_CMD")/openclaw")
if [ ! -x "$OPENCLAW_CMD" ]; then
  echo "[ERROR] OpenClaw 安装失败"
  exit 1
fi

echo "added"
log "OpenClaw 安装成功: $($OPENCLAW_CMD --version 2>/dev/null | head -1)"

step "步骤 4：注册 systemd 用户服务"

if command -v systemctl >/dev/null 2>&1; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/install-service-linux.sh" ]; then
    bash "$SCRIPT_DIR/install-service-linux.sh" "$OPENCLAW_CMD"
  else
    log "警告: install-service-linux.sh 不存在，跳过服务注册"
  fi
else
  log "systemd 不可用，跳过服务注册"
fi

step "步骤 5：启动 Gateway"
log "启动 OpenClaw Gateway..."
echo "openclaw gateway start"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user start openclaw-gateway 2>/dev/null || true
  sleep 2
fi

if nc -z 127.0.0.1 18789 2>/dev/null; then
  echo "gateway listening"
  log "Gateway 运行正常（端口 18789）"
else
  "$OPENCLAW_CMD" gateway start &
  sleep 3
  if nc -z 127.0.0.1 18789 2>/dev/null; then
    echo "gateway listening"
    log "Gateway 运行正常（端口 18789）"
  else
    log "警告: Gateway 可能未正常启动，请手动检查"
  fi
fi

echo ""
echo "安装完成"
echo "Done"
log "OpenClaw 安装完成！"
log "打开 http://localhost:18789 使用 OpenClaw"

