#!/usr/bin/env bash
# diagnose.sh — OpenClaw 环境诊断（7 项检测）
# 输出格式：每行 [PASS] 或 [FAIL] 开头，供 Rust 后端解析
set -uo pipefail

OPENCLAW_DIR="$HOME/.openclaw"
LOG_FILE="$OPENCLAW_DIR/logs/gateway.err.log"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
GATEWAY_PORT=18789

pass() { echo "[PASS] $1: $2"; }
fail() { echo "[FAIL] $1: $2"; }

check_openclaw_installed() {
  local name="OpenClaw 安装"
  local openclaw_path
  openclaw_path=$(which openclaw 2>/dev/null || true)

  if [ -z "$openclaw_path" ]; then
    for p in \
      "$HOME/.nvm/versions/node/"*/bin/openclaw \
      "$HOME/.volta/bin/openclaw" \
      "/usr/local/bin/openclaw" \
      "/opt/homebrew/bin/openclaw"; do
      if [ -x "$p" ]; then
        openclaw_path="$p"
        break
      fi
    done
  fi

  if [ -n "$openclaw_path" ] && [ -x "$openclaw_path" ]; then
    local version
    version=$("$openclaw_path" --version 2>/dev/null | head -1 | tr -d '\n' || true)
    pass "$name" "openclaw 命令可用 ($version)"
  else
    fail "$name" "未找到 openclaw 命令"
  fi
}

check_port() {
  local name="端口 $GATEWAY_PORT"
  if nc -z 127.0.0.1 "$GATEWAY_PORT" 2>/dev/null; then
    pass "$name" "端口 $GATEWAY_PORT 正在监听"
  else
    fail "$name" "端口 $GATEWAY_PORT 未监听"
  fi
}

check_launchagent() {
  local name="LaunchAgent"
  if launchctl list 2>/dev/null | grep -q "openclaw"; then
    pass "$name" "LaunchAgent 已加载"
  else
    fail "$name" "LaunchAgent 未加载"
  fi
}

check_config() {
  local name="配置文件"
  if [ ! -f "$CONFIG_FILE" ]; then
    fail "$name" "openclaw.json 不存在 ($CONFIG_FILE)"
    return
  fi
  if python3 -c "import json; json.load(open('$CONFIG_FILE'))" 2>/dev/null; then
    pass "$name" "openclaw.json 格式正确"
  else
    fail "$name" "openclaw.json JSON 格式错误"
  fi
}

check_plugin_paths() {
  local name="插件路径"
  if [ ! -f "$CONFIG_FILE" ]; then
    pass "$name" "无配置文件，跳过"
    return
  fi

  local bad_paths=0
  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    if [[ "$cmd" != /* ]]; then
      bad_paths=$((bad_paths + 1))
    fi
  done < <(
    python3 -c "
import json
try:
  cfg = json.load(open('$CONFIG_FILE'))
  servers = cfg.get('mcpServers', {})
  for v in servers.values():
    cmd = v.get('command', '')
    if cmd:
      print(cmd)
except:
  pass
" 2>/dev/null || true
  )

  if [ "$bad_paths" -eq 0 ]; then
    pass "$name" "所有插件路径有效"
  else
    fail "$name" "${bad_paths} 个插件使用了相对路径（可能导致启动失败）"
  fi
}

check_error_log() {
  local name="错误日志"
  if [ ! -f "$LOG_FILE" ]; then
    pass "$name" "日志文件不存在（正常，首次运行）"
    return
  fi
  if tail -30 "$LOG_FILE" | grep -qiE "FATAL|panic|critical" 2>/dev/null; then
    fail "$name" "日志中存在严重错误（FATAL/panic），请查看修复页面"
  else
    pass "$name" "最近 30 行日志无严重错误"
  fi
}

check_network() {
  local name="网络连通"
  if nc -z api.anthropic.com 443 2>/dev/null; then
    pass "$name" "可连接 api.anthropic.com:443"
  else
    fail "$name" "无法连接 api.anthropic.com:443（检查网络或代理）"
  fi
}

check_openclaw_installed
check_port
check_launchagent
check_config
check_plugin_paths
check_error_log
check_network

