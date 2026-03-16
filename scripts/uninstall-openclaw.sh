#!/usr/bin/env bash
# OpenClaw 卸载向导（增强版，集成 ByeByeClaw 功能）
# https://github.com/openclaw/openclaw-anzhuang

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# i18n / 国际化
# ─────────────────────────────────────────────────────────────────────────────

detect_lang() {
    local lang="${LANG:-${LC_ALL:-${LANGUAGE:-en}}}"
    if [[ "$lang" =~ ^zh ]]; then
        echo "zh"
    else
        echo "en"
    fi
}

LANG_CODE="${BYEBYECLAW_LANG:-$(detect_lang)}"

t() {
    local key="$1"
    if [ "$LANG_CODE" = "zh" ]; then
        case "$key" in
            title)         echo "👋 OpenClaw 深度卸载向导" ;;
            dry_run)       echo "[DRY RUN 模式 - 仅扫描不删除]" ;;
            keep_config)   echo "[保留配置文件]" ;;
            select_mode)   echo "[逐项选择模式]" ;;
            scanning)      echo "🔍 正在扫描 OpenClaw 相关安装痕迹..." ;;
            npm_sec)       echo "npm 全局包" ;;
            pip_sec)       echo "pip/pipx 包" ;;
            cargo_sec)     echo "cargo 安装" ;;
            bin_sec)       echo "二进制文件" ;;
            config_sec)    echo "配置/数据目录" ;;
            vscode_sec)    echo "VS Code 扩展" ;;
            docker_sec)    echo "Docker 容器/镜像" ;;
            systemd_sec)   echo "systemd 服务" ;;
            launchd_sec)   echo "launchd 服务" ;;
            proc_sec)      echo "进程" ;;
            cron_sec)      echo "cron 任务" ;;
            shell_sec)     echo "Shell 配置残留" ;;
            tmpfile_sec)   echo "临时文件" ;;
            clean)         echo "✅ 系统干净！未检测到 OpenClaw 相关安装。" ;;
            found_pre)     echo "共检测到" ;;
            found_post)    echo "个项目需要清理。" ;;
            dry_done)      echo "📋 DRY RUN 完成。去掉 --dry-run 参数执行真正的卸载。" ;;
            confirm)       echo "确认卸载以上所有项目？(y/N) " ;;
            cancelled)     echo "已取消卸载。" ;;
            cleaning)      echo "🧹 开始清理..." ;;
            uninstall)     echo "卸载" ;;
            delete)        echo "删除" ;;
            skip)          echo "跳过" ;;
            fail)          echo "失败" ;;
            done_ok)       echo "✅ 卸载完成！OpenClaw 已从系统中彻底移除。" ;;
            done_err_pre)  echo "⚠️  卸载完成，但有" ;;
            done_err_post) echo "个项目未能成功清理。" ;;
            select_prompt) echo "删除? (y/n) " ;;
        esac
    else
        case "$key" in
            title)         echo "👋 OpenClaw Deep Uninstaller" ;;
            dry_run)       echo "[DRY RUN - scan only, no deletions]" ;;
            keep_config)   echo "[keeping config files]" ;;
            select_mode)   echo "[interactive select mode]" ;;
            scanning)      echo "🔍 Scanning for OpenClaw installations..." ;;
            npm_sec)       echo "npm global packages" ;;
            pip_sec)       echo "pip/pipx packages" ;;
            cargo_sec)     echo "cargo installs" ;;
            bin_sec)       echo "binaries" ;;
            config_sec)    echo "config/data dirs" ;;
            vscode_sec)    echo "VS Code extensions" ;;
            docker_sec)    echo "Docker containers/images" ;;
            systemd_sec)   echo "systemd services" ;;
            launchd_sec)   echo "launchd services" ;;
            proc_sec)      echo "processes" ;;
            cron_sec)      echo "cron jobs" ;;
            shell_sec)     echo "shell config residue" ;;
            tmpfile_sec)   echo "temp files" ;;
            clean)         echo "✅ System is clean! No OpenClaw installations found." ;;
            found_pre)     echo "Found" ;;
            found_post)    echo "items to clean up." ;;
            dry_done)      echo "📋 DRY RUN complete. Remove --dry-run to actually uninstall." ;;
            confirm)       echo "Confirm uninstall all items above? (y/N) " ;;
            cancelled)     echo "Cancelled." ;;
            cleaning)      echo "🧹 Cleaning up..." ;;
            uninstall)     echo "uninstall" ;;
            delete)        echo "remove" ;;
            skip)          echo "skipped" ;;
            fail)          echo "failed" ;;
            done_ok)       echo "✅ Uninstall complete! OpenClaw removed. Zero residue." ;;
            done_err_pre)  echo "⚠️  Uninstall complete, but" ;;
            done_err_post) echo "items could not be cleaned." ;;
            select_prompt) echo "remove? (y/n) " ;;
        esac
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Colors
# ─────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m'

# ─────────────────────────────────────────────────────────────────────────────
# 参数
# ─────────────────────────────────────────────────────────────────────────────

DRY_RUN=false
KEEP_CONFIG=false
SELECT_MODE=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)     DRY_RUN=true ;;
        --keep-config) KEEP_CONFIG=true ;;
        --select)      SELECT_MODE=true ;;
        -Purge|--purge) KEEP_CONFIG=false ;;  # 兼容 Tauri 的 -Purge 参数
        -DryRun)       DRY_RUN=true ;;         # 兼容 PowerShell 风格
        -KeepConfig)   KEEP_CONFIG=true ;;
        -Select)       SELECT_MODE=true ;;
        --help|-h)
            echo "$(t title)"
            echo "Usage: $0 [--dry-run] [--keep-config] [--select]"
            echo "  --dry-run      $(t scanning)"
            echo "  --keep-config  keep ~/.openclaw"
            echo "  --select       interactive mode"
            exit 0
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# 初始化
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${CYAN}$(t title)${NC}"
echo "=============================================================="
$DRY_RUN && echo -e "${YELLOW}   $(t dry_run)${NC}"
$KEEP_CONFIG && echo -e "${YELLOW}   $(t keep_config)${NC}"
$SELECT_MODE && echo -e "${YELLOW}   $(t select_mode)${NC}"
echo ""

FOUND_ITEMS=()
FOUND_COUNT=0
FAILED_COUNT=0

found() {
    local type="$1" value="$2" desc="$3"
    echo -e "  ${RED}✗${NC} $desc"
    FOUND_ITEMS+=("$type:$value")
    FOUND_COUNT=$((FOUND_COUNT + 1))
}

# ─────────────────────────────────────────────────────────────────────────────
# SCAN / 扫描
# ─────────────────────────────────────────────────────────────────────────────

echo -e "${YELLOW}$(t scanning)${NC}"
echo ""

CLAW_REGEX="openclaw|zeroclaw|nanoclaw|ironclaw|nullclaw|tinyclaw|microclaw|rayclaw|sharpclaw|moltbot|nanobot"

# 1. npm global
echo -e "${DIM}  [$(t npm_sec)]${NC}"
if command -v npm &>/dev/null; then
    npm list -g openclaw --depth=0 &>/dev/null && found "npm" "openclaw" "$(t npm_sec): openclaw"
    # Fuzzy
    while IFS= read -r pkg; do
        [ -n "$pkg" ] && found "npm" "$pkg" "$(t npm_sec) (fuzzy): $pkg"
    done < <(npm list -g --depth=0 --parseable 2>/dev/null | xargs -I{} basename {} | grep -iE "$CLAW_REGEX" || true)
fi

# 2. pip/pipx
echo -e "${DIM}  [$(t pip_sec)]${NC}"
for pkg in openclaw zeroclaw nanoclaw ironclaw nullclaw tinyclaw microclaw moltbot; do
    pip3 show "$pkg" &>/dev/null && found "pip" "$pkg" "$(t pip_sec): $pkg"
    command -v pipx &>/dev/null && pipx list 2>/dev/null | grep -qi "$pkg" && found "pipx" "$pkg" "$(t pip_sec): $pkg"
done

# 3. cargo
echo -e "${DIM}  [$(t cargo_sec)]${NC}"
[ -d "$HOME/.cargo/bin" ] && {
    for pkg in zeroclaw ironclaw microclaw rayclaw nullclaw nanoclaw; do
        [ -f "$HOME/.cargo/bin/$pkg" ] && found "cargo" "$pkg" "$(t cargo_sec): ~/.cargo/bin/$pkg"
    done
}

# 4. Binaries
echo -e "${DIM}  [$(t bin_sec)]${NC}"
for dir in /usr/local/bin /opt/homebrew/bin "$HOME/.local/bin"; do
    [ -d "$dir" ] && {
        for bin in $(ls "$dir" 2>/dev/null | grep -iE "$CLAW_REGEX" || true); do
            found "binary" "$dir/$bin" "$(t bin_sec): $dir/$bin"
        done
    }
done

# 5. Config directories
echo -e "${DIM}  [$(t config_sec)]${NC}"
for dir in "$HOME/.openclaw" "$HOME/.zeroclaw" "$HOME/.config/openclaw" "$HOME/.config/zeroclaw"; do
    [ -d "$dir" ] && found "config" "$dir" "$(t config_sec): $dir"
done

# 6. VS Code extensions
echo -e "${DIM}  [$(t vscode_sec)]${NC}"
for extdir in "$HOME/.vscode/extensions" "$HOME/.vscode-insiders/extensions" "$HOME/.cursor/extensions"; do
    if [ -d "$extdir" ]; then
        while IFS= read -r ext; do
            [ -n "$ext" ] && found "vscode_ext" "$ext" "$(t vscode_sec): $ext"
        done < <(find "$extdir" -maxdepth 1 -type d -name "*claw*" -o -name "*openclaw*" 2>/dev/null || true)
    fi
done

# 7. Docker
echo -e "${DIM}  [$(t docker_sec)]${NC}"
if command -v docker &>/dev/null; then
    while IFS= read -r ctn; do
        [ -n "$ctn" ] && found "docker_ctn" "$ctn" "$(t docker_sec) (container): $ctn"
    done < <(docker ps -a --format "{{.Names}}" 2>/dev/null | grep -iE "$CLAW_REGEX" || true)
    while IFS= read -r img; do
        [ -n "$img" ] && found "docker_img" "$img" "$(t docker_sec) (image): $img"
    done < <(docker images --format "{{.Repository}}" 2>/dev/null | grep -iE "$CLAW_REGEX" || true)
fi

# 8. Systemd (Linux)
echo -e "${DIM}  [$(t systemd_sec)]${NC}"
if command -v systemctl &>/dev/null; then
    [ -f "$HOME/.config/systemd/user/openclaw-gateway.service" ] && \
        found "systemd" "openclaw-gateway.service" "$(t systemd_sec): openclaw-gateway.service"
fi

# 9. Launchd (macOS)
echo -e "${DIM}  [$(t launchd_sec)]${NC}"
if [ "$(uname)" = "Darwin" ]; then
    [ -f "$HOME/Library/LaunchAgents/com.openclaw.gateway.plist" ] && \
        found "launchd" "com.openclaw.gateway.plist" "$(t launchd_sec): com.openclaw.gateway.plist"
fi

# 10. Processes
echo -e "${DIM}  [$(t proc_sec)]${NC}"
while IFS= read -r proc; do
    [ -n "$proc" ] && found "process" "$proc" "$(t proc_sec): $proc"
done < <(pgrep -f "$CLAW_REGEX" 2>/dev/null || true)

# 11. Cron
echo -e "${DIM}  [$(t cron_sec)]${NC}"
if crontab -l 2>/dev/null | grep -qiE "$CLAW_REGEX"; then
    found "cron" "crontab" "$(t cron_sec): crontab 中存在 Claw 相关任务"
fi

# 12. Shell config residue
echo -e "${DIM}  [$(t shell_sec)]${NC}"
for file in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.zsh_profile"; do
    if [ -f "$file" ] && grep -qiE "$CLAW_REGEX" "$file" 2>/dev/null; then
        found "shell_config" "$file" "$(t shell_sec): $file"
    fi
done

# 13. Temp files
echo -e "${DIM}  [$(t tmpfile_sec)]${NC}"
for tmpdir in /tmp /var/tmp "$HOME/.tmp"; do
    [ -d "$tmpdir" ] && {
        while IFS= read -r tmpfile; do
            [ -n "$tmpfile" ] && found "tmpfile" "$tmpfile" "$(t tmpfile_sec): $tmpfile"
        done < <(find "$tmpdir" -type f -name "*claw*" 2>/dev/null | head -20 || true)
    }
done

# ─────────────────────────────────────────────────────────────────────────────
# 结果和确认
# ─────────────────────────────────────────────────────────────────────────────

echo ""
if [ $FOUND_COUNT -eq 0 ]; then
    echo -e "${GREEN}$(t clean)${NC}"
    exit 0
fi

echo -e "$(t found_pre) ${YELLOW}$FOUND_COUNT${NC} $(t found_post)"
echo ""

if [ "$DRY_RUN" = "true" ]; then
    echo -e "${CYAN}$(t dry_done)${NC}"
    exit 0
fi

# 确认（如果 stdin 不是终端，如从 Tauri 调用，则跳过确认直接执行）
if [ -t 0 ]; then
    read -p "$(t confirm)" -n 1 -r response
    echo ""
    if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
        echo "$(t cancelled)"
        exit 0
    fi
else
    echo "(非交互模式，跳过确认)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 删除
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${YELLOW}$(t cleaning)${NC}"
echo ""

for item in "${FOUND_ITEMS[@]}"; do
    IFS=':' read -r type value <<< "$item"

    should_delete=true

    # Select mode
    if [ "$SELECT_MODE" = "true" ]; then
        read -p "  $value - $(t select_prompt)" -n 1 -r response
        echo ""
        should_delete=false
        [ "$response" = "y" ] || [ "$response" = "Y" ] && should_delete=true
    fi

    if [ "$should_delete" = "false" ]; then
        echo -e "  [$(t skip)]  $value"
        continue
    fi

    case "$type" in
        npm|npm_fuzzy)
            npm uninstall -g "$value" 2>&1 >/dev/null && \
                echo -e "  ${GREEN}[$(t uninstall)]${NC}  npm: $value" || \
                { echo -e "  ${RED}[$(t fail)]${NC}  npm: $value"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            ;;
        pip|pipx)
            pip uninstall -y "$value" 2>&1 >/dev/null && \
                echo -e "  ${GREEN}[$(t uninstall)]${NC}  pip: $value" || \
                { echo -e "  ${RED}[$(t fail)]${NC}  pip: $value"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            ;;
        cargo|binary)
            rm -f "$value" 2>/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  binary: $value" || \
                { echo -e "  ${RED}[$(t fail)]${NC}  binary: $value"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            ;;
        config)
            if [ "$KEEP_CONFIG" = "true" ]; then
                echo -e "  [$(t skip)]  config: $value"
            else
                rm -rf "$value" 2>/dev/null && \
                    echo -e "  ${GREEN}[$(t delete)]${NC}  config: $value" || \
                    { echo -e "  ${RED}[$(t fail)]${NC}  config: $value"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            fi
            ;;
        vscode_ext)
            rm -rf "$value" 2>/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  VS Code ext: $value" || \
                { echo -e "  ${RED}[$(t fail)]${NC}  VS Code ext: $value"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            ;;
        docker_ctn)
            docker rm -f "$value" 2>/dev/null >/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  Docker container: $value" || true
            ;;
        docker_img)
            docker rmi -f "$value" 2>/dev/null >/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  Docker image: $value" || true
            ;;
        systemd)
            systemctl --user stop "$value" 2>/dev/null || true
            systemctl --user disable "$value" 2>/dev/null || true
            rm -f "$HOME/.config/systemd/user/$value" 2>/dev/null || true
            echo -e "  ${GREEN}[$(t delete)]${NC}  systemd: $value"
            ;;
        launchd)
            launchctl unload "$HOME/Library/LaunchAgents/$value" 2>/dev/null || true
            rm -f "$HOME/Library/LaunchAgents/$value" 2>/dev/null || true
            echo -e "  ${GREEN}[$(t delete)]${NC}  launchd: $value"
            ;;
        process)
            kill "$value" 2>/dev/null || true
            echo -e "  ${GREEN}[$(t delete)]${NC}  process: $value"
            ;;
        cron)
            (crontab -l 2>/dev/null | grep -ivE "$CLAW_REGEX") | crontab - 2>/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  cron: cleaned" || \
                { echo -e "  ${RED}[$(t fail)]${NC}  cron: cleanup failed"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            ;;
        shell_config)
            sed -i.bak -e "/$CLAW_REGEX/d" "$value" 2>/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  shell config: $value" || \
                { echo -e "  ${RED}[$(t fail)]${NC}  shell config: $value"; FAILED_COUNT=$((FAILED_COUNT + 1)); }
            ;;
        tmpfile)
            rm -rf "$value" 2>/dev/null && \
                echo -e "  ${GREEN}[$(t delete)]${NC}  temp: $value" || true
            ;;
    esac
done

# ─────────────────────────────────────────────────────────────────────────────
# 结束
# ─────────────────────────────────────────────────────────────────────────────

echo ""
if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}$(t done_ok)${NC}"
else
    echo -e "${YELLOW}$(t done_err_pre) $FAILED_COUNT $(t done_err_post)${NC}"
fi
echo ""
echo "Done"
echo "=============================================================="
