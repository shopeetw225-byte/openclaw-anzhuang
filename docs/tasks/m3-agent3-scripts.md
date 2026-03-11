# M3 Agent 3 任务：Linux 安装脚本

## 你的角色
你负责编写两个 Linux 安装脚本：`install-linux.sh`（主安装流程）和 `install-service-linux.sh`（systemd 服务注册）。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `scripts/install-linux.sh`（新建）
- `scripts/install-service-linux.sh`（新建）
- `docs/milestones/M3.md`（只在末尾追加你的日志区块）

## 工作规则
- 不修改任何现有脚本（install-macos.sh、diagnose.sh 等）
- 脚本必须在无 sudo 情况下尽可能完成安装（systemd --user 不需要 sudo）
- 输出进度关键词需与 Rust `process_runner.rs` 里的 `PROGRESS_RULES` 匹配（见下方）
- 如需记录执行日志：只能在 `docs/milestones/M3.md` **末尾追加** `## Agent 3 执行日志...` 区块，不改动既有内容

---

## 进度关键词对照表（必须输出这些词触发进度条）

```
"Checking Node"     → 5%
"[步骤 1"           → 5%
"Installing Node"   → 15%
"安装 Node"         → 15%
"Downloading node"  → 20%
"nvm install"       → 25%
"npm install -g openclaw" → 50%
"added"             → 70%
"openclaw gateway start"  → 85%
"gateway listening" → 95%
"安装完成"          → 100%
"Done"              → 100%
```

---

## 任务 1：scripts/install-linux.sh

```bash
#!/usr/bin/env bash
# install-linux.sh — OpenClaw Linux 安装脚本
# 支持 Ubuntu 22.04 / Debian 12 / Raspberry Pi OS
# 不需要 sudo（Node.js 通过 nvm 安装到用户目录）
set -uo pipefail

REQUIRED_NODE_MAJOR=20
OPENCLAW_PKG="openclaw"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
step() { echo ""; echo "=== $* ==="; }

# ─── 检测发行版 ────────────────────────────────────────────
detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "${ID:-unknown}"
    else
        echo "unknown"
    fi
}

DISTRO=$(detect_distro)
log "发行版: $DISTRO"
log "架构: $(uname -m)"

# ─── 步骤 1：检查 Node.js ──────────────────────────────────
step "步骤 1：检查 Node.js 环境"
echo "Checking Node"

NODE_OK=false
NODE_CMD=""

# 先检测已安装的 node
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
    echo "Downloading node"

    # 安装 nvm
    export NVM_DIR="$HOME/.nvm"
    if [ ! -d "$NVM_DIR" ]; then
        log "下载 nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi

    # 加载 nvm
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

    log "安装 Node.js ${REQUIRED_NODE_MAJOR}..."
    echo "nvm install ${REQUIRED_NODE_MAJOR}"
    nvm install "${REQUIRED_NODE_MAJOR}" 2>&1
    nvm use "${REQUIRED_NODE_MAJOR}" 2>&1
    nvm alias default "${REQUIRED_NODE_MAJOR}" 2>&1

    NODE_CMD="$(which node 2>/dev/null || true)"
    if [ -z "$NODE_CMD" ]; then
        # 尝试直接路径
        NODE_CMD=$(ls "$NVM_DIR/versions/node/"*/bin/node 2>/dev/null | sort -V | tail -1 || true)
    fi

    if [ -z "$NODE_CMD" ] || [ ! -x "$NODE_CMD" ]; then
        echo "[ERROR] Node.js 安装失败，请检查网络连接后重试"
        exit 1
    fi
    log "Node.js 安装完成: $($NODE_CMD -v)"
fi

# 确保 npm 可用
NPM_CMD="$(dirname "$NODE_CMD")/npm"
if [ ! -x "$NPM_CMD" ]; then
    NPM_CMD=$(which npm 2>/dev/null || true)
fi
log "npm: $($NPM_CMD -v 2>/dev/null || echo '未找到')"

# ─── 步骤 3：安装 OpenClaw ─────────────────────────────────
step "步骤 3：安装 OpenClaw"

if "$NPM_CMD" list -g "$OPENCLAW_PKG" 2>/dev/null | grep -q "$OPENCLAW_PKG"; then
    log "OpenClaw 已安装，升级到最新版..."
fi

log "安装 OpenClaw..."
echo "npm install -g openclaw"
"$NPM_CMD" install -g "$OPENCLAW_PKG" 2>&1

# 验证安装
OPENCLAW_CMD=$(which openclaw 2>/dev/null || "$(dirname "$NODE_CMD")/openclaw")
if [ ! -x "$OPENCLAW_CMD" ]; then
    echo "[ERROR] OpenClaw 安装失败"
    exit 1
fi

echo "added"
log "OpenClaw 安装成功: $($OPENCLAW_CMD --version 2>/dev/null | head -1)"

# ─── 步骤 4：注册 systemd 服务 ────────────────────────────
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

# ─── 步骤 5：启动 Gateway ─────────────────────────────────
step "步骤 5：启动 Gateway"
log "启动 OpenClaw Gateway..."
echo "openclaw gateway start"

# 先尝试 systemd
if command -v systemctl >/dev/null 2>&1; then
    systemctl --user start openclaw-gateway 2>/dev/null || true
    sleep 2
fi

# 检查端口是否监听
if nc -z 127.0.0.1 18789 2>/dev/null; then
    echo "gateway listening"
    log "Gateway 运行正常（端口 18789）"
else
    # 直接启动
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
```

---

## 任务 2：scripts/install-service-linux.sh

注册 systemd user service，开机自动启动 Gateway：

```bash
#!/usr/bin/env bash
# install-service-linux.sh — 注册 OpenClaw Gateway 为 systemd 用户服务
# 用法: install-service-linux.sh [openclaw 可执行路径]
set -uo pipefail

OPENCLAW_CMD="${1:-$(which openclaw 2>/dev/null || echo 'openclaw')}"
SERVICE_NAME="openclaw-gateway"
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/${SERVICE_NAME}.service"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# 检查 systemd --user 是否可用
if ! systemctl --user status >/dev/null 2>&1; then
    log "警告: systemd --user 不可用，跳过服务注册"
    exit 0
fi

# 创建目录
mkdir -p "$SERVICE_DIR"

# 写入 service 文件
cat > "$SERVICE_FILE" <<EOF
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

# 重载 systemd 配置
systemctl --user daemon-reload 2>/dev/null || true

# 启用开机自启
systemctl --user enable "$SERVICE_NAME" 2>/dev/null && \
    log "已启用 $SERVICE_NAME 开机自启" || \
    log "警告: 启用失败（可能 loginctl 未配置）"

# 尝试启用 linger（让用户服务在未登录时也运行）
if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$(whoami)" 2>/dev/null || true
fi

log "systemd 服务注册完成"
log "手动控制: systemctl --user start/stop/status $SERVICE_NAME"
```

---

## 测试验证

```bash
chmod +x scripts/install-linux.sh scripts/install-service-linux.sh
bash -n scripts/install-linux.sh && echo "语法检查通过"
bash -n scripts/install-service-linux.sh && echo "语法检查通过"
```

成功标准：`bash -n` 语法检查通过（不实际执行安装）。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M3.md` 末尾追加：
```
---
## Agent 3 执行日志（Linux 安装脚本）

### 测试 [填入日期时间]
命令: bash -n scripts/install-linux.sh && bash -n scripts/install-service-linux.sh
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: install-linux.sh / install-service-linux.sh 实现，语法检查通过
```
