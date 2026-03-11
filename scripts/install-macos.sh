#!/usr/bin/env bash
set -euo pipefail

# This script installs Node.js (if needed), installs OpenClaw, and starts the Gateway on macOS.

TOTAL_STEPS=7

step() {
  local n="$1"
  shift
  echo "[步骤 ${n}/${TOTAL_STEPS}] $*"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

node_major() {
  node -v 2>/dev/null | sed 's/v//' | cut -d. -f1
}

ensure_npm_global_bin_in_path() {
  if ! has_cmd npm; then
    return 0
  fi

  local prefix=""
  prefix="$(npm config get prefix 2>/dev/null || true)"
  if [ -z "$prefix" ] || [ "$prefix" = "undefined" ] || [ "$prefix" = "null" ]; then
    prefix="$(npm prefix -g 2>/dev/null || true)"
  fi

  if [ -n "$prefix" ] && [ -d "$prefix/bin" ]; then
    export PATH="$prefix/bin:$PATH"
  fi
}

install_node_with_brew() {
  step 2 "安装 Node（Installing Node）：检测到 Homebrew，将执行 brew install node@22"
  brew install node@22
  brew link --overwrite --force node@22 2>/dev/null || true

  local brew_prefix=""
  brew_prefix="$(brew --prefix node@22 2>/dev/null || true)"
  if [ -n "$brew_prefix" ] && [ -d "$brew_prefix/bin" ]; then
    export PATH="$brew_prefix/bin:$PATH"
  fi
}

install_node_with_nvm() {
  step 2 "安装 Node（Installing Node）：未检测到 Homebrew，将使用 nvm 用户级安装"
  step 2 "Downloading node：准备安装 nvm 并下载 Node"

  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1090
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
  else
    echo "❌ 未找到 nvm.sh，无法继续安装 Node"
    exit 1
  fi

  step 2 "nvm install 22：开始安装 Node 22"
  nvm install 22
}

main() {
  step 1 "开始安装 OpenClaw（macOS）"
  echo "----------------------------------------"
  echo "本脚本将检测 Node.js（需要 20+），安装 OpenClaw，并启动 Gateway。"
  echo "----------------------------------------"

  step 2 "检查 Node.js 版本 (Checking Node)"
  if has_cmd node; then
    local major=""
    major="$(node_major)"
    if [ "${major:-0}" -ge 20 ]; then
      echo "✅ 已检测到 Node.js：$(node -v)（满足要求，跳过安装）"
    else
      echo "⚠️  已检测到 Node.js：$(node -v)（需要 20+，将安装新版本）"
      if has_cmd brew; then
        install_node_with_brew
      else
        install_node_with_nvm
      fi
    fi
  else
    echo "❌ 未检测到 Node.js，将安装 Node 22"
    if has_cmd brew; then
      install_node_with_brew
    else
      install_node_with_nvm
    fi
  fi

  step 3 "验证 node 和 npm 可用"
  if ! has_cmd node; then
    echo "❌ node 不可用，请检查安装是否成功"
    exit 1
  fi
  if ! has_cmd npm; then
    echo "❌ npm 不可用，请检查安装是否成功"
    exit 1
  fi
  echo "✅ node: $(node -v)"
  echo "✅ npm: $(npm -v)"

  ensure_npm_global_bin_in_path

  step 4 "检测 OpenClaw 是否已安装"
  if has_cmd openclaw; then
    echo "✅ 已检测到 OpenClaw：$(openclaw --version 2>/dev/null || echo '已安装')（跳过安装，如需升级可手动运行 npm install -g openclaw）"
  else
    step 4 "执行 npm install -g openclaw"
    npm install -g openclaw
    ensure_npm_global_bin_in_path

    if ! has_cmd openclaw; then
      echo "❌ 已执行 npm 安装，但仍未找到 openclaw 命令，请检查 PATH 或 npm 全局安装目录"
      exit 1
    fi
  fi

  step 5 "启动 Gateway：openclaw gateway start"
  openclaw gateway start || true

  step 6 "等待 3 秒并检测 Gateway 状态"
  sleep 3
  openclaw gateway status 2>/dev/null || true

  if lsof -i :18789 >/dev/null 2>&1; then
    echo "gateway listening：端口 18789 正在监听"
  else
    echo "⚠️  未检测到端口 18789 监听（Gateway 可能未启动成功）"
  fi

  step 7 "安装完成 (Done)"
  echo "✅ 如需查看状态，可运行：openclaw gateway status"
}

main "$@"
