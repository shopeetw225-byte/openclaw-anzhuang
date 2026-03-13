#!/usr/bin/env bash
# fix-gateway.sh — OpenClaw Gateway 自动修复
# 修复项：插件路径、端口冲突、LaunchAgent 重载
set -uo pipefail

OPENCLAW_DIR="$HOME/.openclaw"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
GATEWAY_PORT=18789

ok() { echo "[FIX-OK] $1: $2"; }
skip() { echo "[SKIP]   $1: $2"; }
err() { echo "[FIX-ERR] $1: $2"; }

find_openclaw() {
  local p
  p=$(which openclaw 2>/dev/null || true)
  if [ -n "$p" ] && [ -x "$p" ]; then
    echo "$p"
    return
  fi

  for candidate in \
    "$HOME/.nvm/versions/node/"*/bin/openclaw \
    "$HOME/.volta/bin/openclaw" \
    "/usr/local/bin/openclaw" \
    "/opt/homebrew/bin/openclaw"; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

find_plist() {
  local la_dir="$HOME/Library/LaunchAgents"
  if [ -d "$la_dir" ]; then
    find "$la_dir" -name "*openclaw*.plist" -maxdepth 1 2>/dev/null | head -1
  fi
}

fix_plugin_paths() {
  local name="插件路径"
  if [ ! -f "$CONFIG_FILE" ]; then
    skip "$name" "无配置文件"
    return
  fi

  python3 - "$CONFIG_FILE" <<'PYEOF' && ok "$name" "插件路径已修复为绝对路径" || err "$name" "修复失败"
import json, sys, os, shutil

config_path = sys.argv[1]

with open(config_path) as f:
  cfg = json.load(f)

changed = 0
servers = cfg.get("mcpServers", {})
for key, val in servers.items():
  cmd = val.get("command", "")
  if cmd and not os.path.isabs(cmd):
    found = shutil.which(cmd)
    if found:
      cfg["mcpServers"][key]["command"] = found
      changed += 1

if changed > 0:
  backup = config_path + ".bak"
  shutil.copy2(config_path, backup)
  tmp = config_path + ".tmp"
  with open(tmp, "w") as f:
    json.dump(cfg, f, indent=2, ensure_ascii=False)
  os.replace(tmp, config_path)
  print(f"修复了 {changed} 个插件路径")
else:
  print("无需修复（路径均已是绝对路径）")
PYEOF
}

fix_port_conflict() {
  local name="端口冲突"
  local pid
  pid=$(lsof -ti :"$GATEWAY_PORT" 2>/dev/null | head -1 || true)
  if [ -z "$pid" ]; then
    skip "$name" "端口 $GATEWAY_PORT 未被占用"
    return
  fi

  local proc_name
  proc_name=$(ps -p "$pid" -o comm= 2>/dev/null || echo "未知进程")
  if echo "$proc_name" | grep -q "openclaw\\|node"; then
    skip "$name" "端口被 openclaw/node 使用（正常），将通过重启修复"
  else
    kill "$pid" 2>/dev/null || true
    ok "$name" "已终止占用端口 $GATEWAY_PORT 的进程 $pid ($proc_name)"
  fi
}

fix_restart_gateway() {
  local name="重启 Gateway"
  local openclaw
  openclaw=$(find_openclaw)

  if [ -z "$openclaw" ]; then
    err "$name" "未找到 openclaw 命令，无法重启"
    return
  fi

  "$openclaw" gateway stop 2>/dev/null || true
  sleep 1

  local plist
  plist=$(find_plist)
  if [ -n "$plist" ]; then
    launchctl unload "$plist" 2>/dev/null || true
    sleep 0.5
    if launchctl load "$plist" 2>/dev/null; then
      ok "$name" "通过 LaunchAgent 重启成功"
      return
    fi
  fi

  if "$openclaw" gateway start 2>/dev/null; then
    ok "$name" "Gateway 直接启动成功"
  else
    err "$name" "Gateway 启动失败，请手动检查"
  fi
}

fix_reload_launchagent() {
  local name="LaunchAgent 重载"
  local plist
  plist=$(find_plist)

  if [ -z "$plist" ]; then
    skip "$name" "未找到 LaunchAgent plist 文件"
    return
  fi

  launchctl unload "$plist" 2>/dev/null || true
  sleep 0.3
  if launchctl load "$plist" 2>/dev/null; then
    ok "$name" "LaunchAgent 已重新加载 ($plist)"
  else
    err "$name" "LaunchAgent 加载失败 ($plist)"
  fi
}

fix_plugin_paths
fix_port_conflict
fix_restart_gateway
fix_reload_launchagent

sleep 2
if nc -z 127.0.0.1 "$GATEWAY_PORT" 2>/dev/null; then
  echo "[STATUS] Gateway 现在运行正常（端口 $GATEWAY_PORT 已监听）"
else
  echo "[STATUS] Gateway 可能仍未启动，建议手动检查日志"
fi

