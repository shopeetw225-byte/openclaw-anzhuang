# Agent 4（CI/Docker/Docs）— M3 Linux 支持：CI 构建 + Docker 测试环境 + 里程碑日志

目标：补齐 M3 的「Ubuntu runner 构建 AppImage+deb」CI，以及提供本地 Docker 测试环境骨架，并更新 M3 里程碑文档的执行日志/进度。

## 重要约束

- 只允许修改下面「允许修改的文件」列表中的文件；不要改任何其它文件。
- 若发现必须改其它文件才能完成任务：停止并在终端说明原因与建议改法。

## 允许修改的文件

- `docs/milestones/M3.md`
- `.github/workflows/m3-linux.yml`（新增）
- `docker/README.md`（新增）
- `docker/compose.yml`（新增）
- `docker/ubuntu22/Dockerfile`（新增）
- `docker/debian12/Dockerfile`（新增）

## 任务清单（按顺序做）

### 1) 新增 GitHub Actions：Linux 构建 AppImage + deb

创建 `.github/workflows/m3-linux.yml`，要求：

- 触发：`workflow_dispatch` + `push`（分支不限）
- runner：`ubuntu-latest`
- 步骤（最小可行）：
  1. checkout
  2. setup node（建议 22）
  3. setup rust（stable）
  4. 安装 tauri Linux 依赖（webkit2gtk、appindicator、librsvg、patchelf 等）
  5. `npm ci`（或 `npm install`，二选一）
  6. `npm run tauri build`
  7. 上传产物目录为 artifact（例如 `src-tauri/target/release/bundle/**`）

提示：Tauri v2 在 Ubuntu 上通常需要 `libwebkit2gtk-4.1-dev`（以及相关依赖）；写清楚安装命令。

### 2) Docker 测试环境（用于快速进入 Ubuntu/Debian shell 验证脚本/环境）

新增：

- `docker/ubuntu22/Dockerfile`：基于 `ubuntu:22.04`，安装最基本工具（`bash curl ca-certificates python3 netcat-openbsd`，可选 `lsof iproute2`），并把仓库 `scripts/` 拷入镜像（只拷脚本即可）。
- `docker/debian12/Dockerfile`：基于 `debian:12-slim`，同上。
- `docker/compose.yml`：提供两个 service（ubuntu22/debian12），启动后进入交互 shell（例如 `command: ["bash"]`）。
- `docker/README.md`：写清楚怎么用（`docker compose build` / `docker compose run --rm ubuntu22 bash` 等），并说明：
  - 容器里通常没有 systemd，`install-service-linux.sh` 可能无法验证（这是预期）
  - 可先验证 `install-linux.sh` 的基础逻辑/依赖探测

### 3) 更新 M3 文档进度与执行日志（最小但可追踪）

在 `docs/milestones/M3.md`：

- 在「执行日志」里追加一段 2026-03-11 的记录，说明已开始拆分 agent 任务（不需要写太长）
- 「完成情况」保持待开始也可以，但建议把状态改为 `🔄 进行中`（因为任务已分配并开始执行）
- 不要修改 M3 以外的里程碑文件

### 4) 自检

- 确保 workflow YAML 语法正确（至少肉眼检查缩进/字段）
- 确保 Dockerfile/compose.yml 能被 docker 解析（无需实际运行）

## 交付要求

- 完成后在终端用 5 行以内说明：
  - workflow 名称/产物路径
  - Docker 环境提供了哪些命令入口
  - M3.md 更新了哪些点
