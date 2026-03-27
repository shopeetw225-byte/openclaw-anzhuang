# OpenClaw 安装器

OpenClaw 安装器是 OpenClaw 生态里的桌面安装和修复入口。它负责检测系统环境、安装或卸载 OpenClaw、管理 Gateway、写入配置，并提供更新与诊断界面。

这个仓库不实现 OpenClaw 本体，它包装的是安装脚本、Tauri 桌面壳和平台相关的服务管理逻辑。

## 项目定位

- 面向最终用户：提供可下载的桌面安装包和一键式安装向导。
- 面向维护者：提供修复、卸载、更新、日志查看和配置管理能力。
- 面向开发者：保留本地开发和构建入口，方便继续迭代安装流程。

## 支持平台

| 平台 | 当前形态 | 说明 |
|------|----------|------|
| Windows | Tauri 桌面应用 + PowerShell/WSL 辅助脚本 | 代码里已具备 Windows 相关检测、WSL 处理和卸载脚本入口。某些路径需要管理员权限。 |
| macOS | Tauri 桌面应用 + bash 脚本 | 支持本机安装、LaunchAgent 管理和卸载。首次打开可能会遇到 macOS quarantine 提示。 |
| Linux | Tauri 桌面应用 + bash/systemd 用户服务 | 支持 `install-linux.sh`、`install-service-linux.sh` 和卸载脚本。依赖 `systemd --user` 的场景会自动降级处理。 |

Tauri 打包配置已经开启了 Windows、macOS 和 Linux 的 bundle 目标，具体发布产物是否可用仍取决于构建环境和发布流程。

## 当前能力边界

已在代码中实现的能力：

- 系统信息与安装状态检测。
- OpenClaw 安装、卸载、修复和更新流程。
- Gateway 的启动、停止、重启和日志读取。
- 配置读写，包含 `~/.openclaw/openclaw.json` 与相关环境变量文件。
- 诊断页、修复页、更新页、卸载页和 Agent 相关页面。
- 平台相关服务管理：macOS LaunchAgent、Linux systemd 用户服务、Windows 辅助脚本路径。

暂时不要把这个仓库理解成：

- OpenClaw 后端本体。
- 已经完全稳定的发布流水线。
- 已经完成代码签名和所有平台的正式发行物打包。

## 安装路径

### 1. 普通用户安装

优先从仓库的 Releases 页面下载最新安装包，然后按平台打开：

- Windows：`.msi` 推荐，`.exe` 适合便携运行。
- macOS：`.dmg`
- Linux：按发布产物或发行方式选择对应包。

### 2. macOS 直接安装

```bash
# 下载 DMG 后，拖拽应用到 Applications
# 从 Applications 启动
```

如果首次打开提示“已损坏”或“无法验证开发者”，通常是因为当前版本还没有正式签名。可以先解除隔离再打开：

```bash
sudo xattr -rd com.apple.quarantine /Applications/OpenClaw\ 安装器.app
```

### 3. Linux 源码脚本安装

```bash
cd /path/to/openclaw-anzhuang
bash scripts/install-linux.sh
```

需要只注册 systemd 用户服务时，可以单独运行：

```bash
bash scripts/install-service-linux.sh
```

### 4. Windows 相关脚本

仓库里包含 Windows 的辅助脚本和安装器入口，适合调试或本地验证：

```powershell
# 安装 OpenClaw
scripts\windows\install-openclaw.ps1

# 启用 WSL
scripts\windows\install-wsl.ps1

# 安装 Ubuntu WSL 发行版
scripts\windows\install-ubuntu.ps1
```

## 开发者快速开始

项目的开发入口很直接：

```bash
npm install
npm run tauri dev
```

构建前端和 Tauri 产物：

```bash
npm run build
npm run tauri build
```

## 仓库结构

- `src/`：React 前端，包含欢迎页、安装页、控制台、修复页、更新页、卸载页和 Agent 页面。
- `src-tauri/`：Rust 后端命令、平台检测、服务管理、配置读写和更新逻辑。
- `scripts/`：跨平台安装、卸载和发布脚本。
- `docs/`：构建、测试、发布和里程碑说明。
- `docker/`：Linux 容器化验证环境，主要用于脚本语法和依赖探测。

## 开发进度

`docs/PROJECT.md` 是当前里程碑状态的主要参考。按那份文档：

- M1：项目搭建 + macOS 完整安装流程，进行中。
- M2：Dashboard + 监控 + 修复，已完成。
- M3：Linux 支持，待开始。
- M4：Windows 支持，待开始。
- M5：更新 + 卸载 + 自更新，待开始。
- M6：打磨 + CI/CD + 发布，待开始。

同时，代码仓库里已经能看到更完整的页面和命令入口，所以 README 这里更适合把它理解成“功能已落地到什么程度”，而不是“所有发布目标都已经正式完成”。

## 已知问题 / 路线图

- macOS 首次打开仍可能遇到 quarantine 提示，后续需要正式签名来改善体验。
- Linux 的 AppImage / deb 打包在文档里仍属于计划项。
- 更新能力已经接入，但测试配置里仍保留了禁用标记和占位 pubkey。
- Windows、macOS 的构建和发布流程已有文档，但最终对外分发是否可用，仍要看 CI/CD 和发布配置。

## 相关文档

- [项目文档索引](docs/PROJECT.md)
- [编译和打包状态](docs/BUILD_STATUS.md)
- [Windows 构建指南](docs/WINDOWS_BUILD_GUIDE.md)
- [Windows 测试指南](docs/WINDOWS_TEST_GUIDE.md)
