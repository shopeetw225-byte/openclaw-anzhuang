# M2 Agent 3 任务：诊断与修复 Shell 脚本

## 你的角色
你负责编写两个 Shell 脚本：`diagnose.sh`（诊断检测）和 `fix-gateway.sh`（自动修复），供 Rust 后端或用户手动调用。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `scripts/diagnose.sh`（新建）
- `scripts/fix-gateway.sh`（新建）

## 工作规则
- 不修改任何现有文件（install-macos.sh、check-system.sh、check-openclaw.sh 等）
- 脚本必须是幂等的（多次执行不造成副作用）
- 所有错误用 `|| true` 容忍，脚本不能因单一检测失败而终止
- 输出格式要机器可解析（每行 `[PASS]` 或 `[FAIL]` 开头）

---

## 任务 1：scripts/diagnose.sh

诊断脚本输出格式（每行一个检测结果）：

```
[PASS] OpenClaw 安装: openclaw 命令可用 (v1.2.3)
[FAIL] 端口 18789: 端口未监听
[PASS] LaunchAgent: LaunchAgent 已加载
[FAIL] 配置文件: openclaw.json 不存在
[PASS] 插件路径: 所有插件路径有效
[PASS] 错误日志: 最近 30 行无 FATAL
[FAIL] 网络连通: 无法连接 api.anthropic.com:443
```

完整脚本内容：

```bash
#!/usr/bin/env bash
# diagnose.sh — OpenClaw 环境诊断（7 项检测）
# 输出格式：每行 [PASS] 或 [FAIL] 开头，供 Rust 后端解析
set -uo pipefail

OPENCLAW_DIR="$HOME/.openclaw"
LOG_FILE="$OPENCLAW_DIR/logs/gateway.err.log"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
GATEWAY_PORT=18789

# ─── 工具函数 ──────────────────────────────────────────────
pass() { echo "[PASS] $1: $2"; }
fail() { echo "[FAIL] $1: $2"; }

# ─── 检测 1：OpenClaw 是否安装 ────────────────────────────
check_openclaw_installed() {
    local name="OpenClaw 安装"
    local openclaw_path
    openclaw_path=$(which openclaw 2>/dev/null || true)

    if [ -z "$openclaw_path" ]; then
        # 尝试常见路径
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

# ─── 检测 2：端口 18789 是否监听 ─────────────────────────
check_port() {
    local name="端口 $GATEWAY_PORT"
    if nc -z 127.0.0.1 "$GATEWAY_PORT" 2>/dev/null; then
        pass "$name" "端口 $GATEWAY_PORT 正在监听"
    else
        fail "$name" "端口 $GATEWAY_PORT 未监听"
    fi
}

# ─── 检测 3：LaunchAgent 状态 ─────────────────────────────
check_launchagent() {
    local name="LaunchAgent"
    if launchctl list 2>/dev/null | grep -q "openclaw"; then
        pass "$name" "LaunchAgent 已加载"
    else
        fail "$name" "LaunchAgent 未加载"
    fi
}

# ─── 检测 4：openclaw.json 存在且有效 ────────────────────
check_config() {
    local name="配置文件"
    if [ ! -f "$CONFIG_FILE" ]; then
        fail "$name" "openclaw.json 不存在 ($CONFIG_FILE)"
        return
    fi
    if python3 -c "import json,sys; json.load(open('$CONFIG_FILE'))" 2>/dev/null; then
        pass "$name" "openclaw.json 格式正确"
    else
        fail "$name" "openclaw.json JSON 格式错误"
    fi
}

# ─── 检测 5：插件路径是否有效（绝对路径）─────────────────
check_plugin_paths() {
    local name="插件路径"
    if [ ! -f "$CONFIG_FILE" ]; then
        pass "$name" "无配置文件，跳过"
        return
    fi

    # 提取 mcpServers 下所有 command 字段
    local bad_paths=0
    while IFS= read -r cmd; do
        [ -z "$cmd" ] && continue
        # 相对路径视为错误
        if [[ "$cmd" != /* ]]; then
            bad_paths=$((bad_paths + 1))
        fi
    done < <(python3 -c "
import json, sys
try:
    cfg = json.load(open('$CONFIG_FILE'))
    servers = cfg.get('mcpServers', {})
    for v in servers.values():
        cmd = v.get('command', '')
        if cmd:
            print(cmd)
except: pass
" 2>/dev/null || true)

    if [ "$bad_paths" -eq 0 ]; then
        pass "$name" "所有插件路径有效"
    else
        fail "$name" "${bad_paths} 个插件使用了相对路径（可能导致启动失败）"
    fi
}

# ─── 检测 6：错误日志最近 30 行是否有 FATAL ──────────────
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

# ─── 检测 7：网络连通性 ────────────────────────────────────
check_network() {
    local name="网络连通"
    if nc -z api.anthropic.com 443 2>/dev/null; then
        pass "$name" "可连接 api.anthropic.com:443"
    else
        fail "$name" "无法连接 api.anthropic.com:443（检查网络或代理）"
    fi
}

# ─── 执行所有检测 ──────────────────────────────────────────
echo "=== OpenClaw 环境诊断 $(date '+%Y-%m-%d %H:%M:%S') ==="
check_openclaw_installed
check_port
check_launchagent
check_config
check_plugin_paths
check_error_log
check_network
echo "=== 诊断完成 ==="
```

---

## 任务 2：scripts/fix-gateway.sh

自动修复脚本，幂等执行：

```bash
#!/usr/bin/env bash
# fix-gateway.sh — OpenClaw Gateway 自动修复
# 修复项：插件路径、端口冲突、LaunchAgent 重载
set -uo pipefail

OPENCLAW_DIR="$HOME/.openclaw"
CONFIG_FILE="$OPENCLAW_DIR/openclaw.json"
GATEWAY_PORT=18789

ok()   { echo "[FIX-OK] $1: $2"; }
skip() { echo "[SKIP]   $1: $2"; }
err()  { echo "[FIX-ERR] $1: $2"; }

# ─── 找到 openclaw 可执行路径 ─────────────────────────────
find_openclaw() {
    local p
    p=$(which openclaw 2>/dev/null || true)
    if [ -n "$p" ] && [ -x "$p" ]; then echo "$p"; return; fi

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

# ─── 找到 LaunchAgent plist ───────────────────────────────
find_plist() {
    local la_dir="$HOME/Library/LaunchAgents"
    if [ -d "$la_dir" ]; then
        find "$la_dir" -name "*openclaw*.plist" -maxdepth 1 2>/dev/null | head -1
    fi
}

# ─── 修复 1：插件路径相对→绝对 ───────────────────────────
fix_plugin_paths() {
    local name="插件路径"
    if [ ! -f "$CONFIG_FILE" ]; then
        skip "$name" "无配置文件"
        return
    fi

    python3 - "$CONFIG_FILE" <<'PYEOF' && ok "$name" "插件路径已修复为绝对路径" || err "$name" "修复失败"
import json, sys, os, shutil, tempfile

config_path = sys.argv[1]
home = os.path.expanduser("~")

with open(config_path) as f:
    cfg = json.load(f)

changed = 0
servers = cfg.get("mcpServers", {})
for key, val in servers.items():
    cmd = val.get("command", "")
    if cmd and not os.path.isabs(cmd):
        # 尝试在常见路径查找
        candidates = [
            os.path.join(home, ".nvm", "versions", "node"),
            "/usr/local/bin",
            "/opt/homebrew/bin",
        ]
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

# ─── 修复 2：释放端口冲突 ─────────────────────────────────
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
    if echo "$proc_name" | grep -q "openclaw\|node"; then
        # 是 Gateway 自己，重启即可
        skip "$name" "端口被 openclaw/node 使用（正常），将通过重启修复"
    else
        kill "$pid" 2>/dev/null || true
        ok "$name" "已终止占用端口 $GATEWAY_PORT 的进程 $pid ($proc_name)"
    fi
}

# ─── 修复 3：重启 Gateway ─────────────────────────────────
fix_restart_gateway() {
    local name="重启 Gateway"
    local openclaw
    openclaw=$(find_openclaw)

    if [ -z "$openclaw" ]; then
        err "$name" "未找到 openclaw 命令，无法重启"
        return
    fi

    # 先停止
    "$openclaw" gateway stop 2>/dev/null || true
    # 等待端口释放
    sleep 1

    # 尝试通过 LaunchAgent 启动
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

    # 直接启动
    if "$openclaw" gateway start 2>/dev/null; then
        ok "$name" "Gateway 直接启动成功"
    else
        err "$name" "Gateway 启动失败，请手动检查"
    fi
}

# ─── 修复 4：重载 LaunchAgent ─────────────────────────────
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

# ─── 执行修复 ─────────────────────────────────────────────
echo "=== OpenClaw 自动修复 $(date '+%Y-%m-%d %H:%M:%S') ==="
fix_plugin_paths
fix_port_conflict
fix_restart_gateway
fix_reload_launchagent
echo "=== 修复完成 ==="

# 等待 Gateway 启动
sleep 2
if nc -z 127.0.0.1 "$GATEWAY_PORT" 2>/dev/null; then
    echo "[STATUS] Gateway 现在运行正常（端口 $GATEWAY_PORT 已监听）"
else
    echo "[STATUS] Gateway 可能仍未启动，建议手动检查日志"
fi
```

---

## 测试验证

```bash
chmod +x scripts/diagnose.sh scripts/fix-gateway.sh
bash scripts/diagnose.sh
```

成功标准：脚本可执行，每行输出以 `[PASS]` 或 `[FAIL]` 开头，脚本不崩溃退出。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M2.md` 末尾追加：
```
---
## Agent 3 执行日志（诊断修复脚本）

### 测试 [填入日期时间]
命令: bash scripts/diagnose.sh
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: diagnose.sh / fix-gateway.sh 全部实现，脚本可执行且输出格式正确
```
