# 🚀 OpenClaw 安装器

> **一键部署 AI Agent Gateway** | 跨平台、自动化、零依赖

[![GitHub Stars](https://img.shields.io/github/stars/shopeetw225-byte/openclaw-anzhuang)](https://github.com/shopeetw225-byte/openclaw-anzhuang)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)](README.md)
[![Version](https://img.shields.io/badge/Version-0.1.0-brightgreen)](https://github.com/shopeetw225-byte/openclaw-anzhuang/releases)

---

## ✨ 功能特性

- 🎯 **一键安装** - 智能检测环境，自动部署 OpenClaw Gateway
- 🪟 **Windows 完整支持** - WSL2 和原生 PowerShell 双路径
  - WSL2 + Ubuntu 自动检测和安装
  - Windows 家庭版、专业版、企业版全支持
  - NSSM 服务管理，开机自启
- 🍎 **macOS 支持** - 一键部署到 Intel/M1/M2/M3
- 🐧 **Linux 支持** - Ubuntu、Debian、CentOS 自动识别
- 📊 **实时监控** - Dashboard 查看 Gateway 状态
- 🔧 **配置管理** - 可视化修改配置参数
- 🛠️ **修复工具** - 一键诊断和修复常见问题
- 📦 **卸载清理** - 完全卸载，无残留文件

---

## 📥 下载安装

### Windows

#### 方式 1️⃣ - MSI 安装包（推荐）
```powershell
# 下载最新版本
# https://github.com/shopeetw225-byte/openclaw-anzhuang/releases/latest

# 双击 OpenClaw_安装器_x64_zh-CN.msi
# 跟随安装向导完成安装
```

**最低要求**：
- Windows 10 / Windows 11 (x64)
- 管理员权限
- 512 MB 磁盘空间

#### 方式 2️⃣ - 便携版 EXE
```powershell
# 无需安装，直接运行
OpenClaw_安装器_x64_zh-CN.exe
```

**支持环境**：
| 系统 | WSL2 | 原生 PowerShell |
|------|------|-----------------|
| Windows 11 Pro/Enterprise | ✅ 优先 | ✅ 备选 |
| Windows 11 Home | ❌ | ✅ 推荐 |
| Windows 10 Pro/Enterprise | ✅ 优先 | ✅ 备选 |
| Windows 10 Home | ❌ | ✅ 推荐 |

---

### macOS

#### Intel/M1/M2/M3 统一安装
```bash
# 下载最新版本
# https://github.com/shopeetw225-byte/openclaw-anzhuang/releases/latest

# 双击 OpenClaw_安装器_x64.dmg （Intel）
#   或 OpenClaw_安装器_aarch64.dmg （Apple Silicon）

# 将 OpenClaw 拖入 Applications 文件夹
# 从 Applications 启动
```

**最低要求**：
- macOS 11.0+ (Big Sur)
- 512 MB 磁盘空间

---

### Linux

#### Ubuntu / Debian / CentOS
```bash
# 克隆项目
git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git
cd openclaw-anzhuang

# 运行安装脚本
chmod +x scripts/install-linux.sh
sudo ./scripts/install-linux.sh

# 验证安装
openclaw --version
openclaw gateway status
```

**支持的发行版**：
- ✅ Ubuntu 20.04+
- ✅ Debian 11+
- ✅ CentOS 8+
- ✅ Rocky Linux 8+

---

## 🚀 快速开始

### 1️⃣ 启动安装器

**Windows**：
```powershell
# 双击 .msi 文件
# 或右键以管理员身份运行 .exe
```

**macOS**：
```bash
# 双击 .dmg 文件
# 或从 Applications 启动
```

**Linux**：
```bash
sudo ./scripts/install-linux.sh
```

### 2️⃣ 完成欢迎向导

- ✅ 显示系统信息
- ✅ 检测环境依赖
- ✅ 验证管理员权限
- ✅ 点击"一键安装"开始

### 3️⃣ 监控安装进度

- 实时日志输出
- 进度条显示
- 支持断点续装（重启后恢复）

### 4️⃣ 验证安装

```bash
# 检查 Gateway 状态
curl http://localhost:18789/health

# 或在安装器中
# Welcome 页面 → 刷新 → Gateway 状态应显示"运行中"
```

---

## 📚 文档

| 文档 | 说明 |
|------|------|
| [快速开始](docs/QUICK_START.md) | 5 分钟快速部署指南 |
| [Windows 构建指南](docs/WINDOWS_BUILD.md) | 本地构建 Windows 版本 |
| [Windows 测试指南](WINDOWS_TEST_GUIDE.md) | 详细的 6 大测试场景 |
| [发布检查清单](docs/RELEASE_CHECKLIST.md) | 版本发布前检查项 |
| [项目规划](docs/PROJECT.md) | M1-M6 完整规划 |
| [配置参考](docs/CONFIG.md) | Gateway 配置选项 |

---

## 🔧 配置管理

### 修改 Gateway 参数

1. **启动安装器** → **配置向导**
2. 修改以下参数：
   - `gateway_port` - 网关端口（默认 18789）
   - `log_level` - 日志级别（debug/info/warn/error）
   - `auto_start` - 开机自启（true/false）
   - `proxy_url` - 代理地址（可选）

3. **保存配置** → 自动重启 Gateway

### 命令行配置

```bash
# 显示当前配置
openclaw config show

# 修改配置
openclaw config set gateway_port 19000

# 重启 Gateway
openclaw gateway restart
```

---

## 🛠️ 故障排查

### 常见问题

#### ❌ "需要管理员权限"
```powershell
# 右键以管理员身份运行安装器
```

#### ❌ "WSL 未安装"（Windows）
```powershell
# 安装器自动检测并安装 WSL2
# 可能需要重启系统
# 重启后点击"重试"继续
```

#### ❌ "磁盘空间不足"
```bash
# 清理磁盘，至少需要 512 MB 可用空间
df -h  # Linux/macOS
wmic logicaldisk get name,freespace  # Windows
```

#### ❌ "Gateway 无法启动"
```bash
# 查看日志
tail -f ~/.openclaw/logs/gateway.log

# 检查端口占用
lsof -i :18789  # Linux/macOS
netstat -ano | findstr :18789  # Windows

# 重启服务
openclaw gateway restart
```

### 获取帮助

1. 📖 查看 [完整文档](docs/)
2. 🔍 检查 [常见问题 FAQ](docs/FAQ.md)
3. 📝 提交 [GitHub Issue](https://github.com/shopeetw225-byte/openclaw-anzhuang/issues)
4. 💬 联系技术支持

---

## 📊 系统要求

### Windows
```
✅ Windows 10 / 11 (x64)
✅ 2GB RAM 最低配置
✅ 512 MB 可用磁盘空间
✅ 管理员权限
✅ .NET Framework 4.7.2+ （仅 NSSM 服务需要）
```

### macOS
```
✅ macOS 11.0+ (Big Sur)
✅ Intel 或 Apple Silicon (M1/M2/M3)
✅ 2GB RAM 最低配置
✅ 512 MB 可用磁盘空间
✅ Xcode Command Line Tools
```

### Linux
```
✅ Ubuntu 20.04+
✅ Debian 11+
✅ CentOS 8+
✅ 2GB RAM 最低配置
✅ 512 MB 可用磁盘空间
✅ Bash 4.0+ 或 Zsh
```

---

## 🔄 更新

### 检查更新

```bash
# 自动检查更新
openclaw update check

# 显示当前版本
openclaw --version
```

### 升级到最新版

```bash
# 自动升级
openclaw update install

# 或手动下载最新版本
# https://github.com/shopeetw225-byte/openclaw-anzhuang/releases/latest
```

---

## 📦 卸载

### Windows

**通过控制面板**：
1. 设置 → 应用 → 已安装的应用
2. 找到 "OpenClaw 安装器"
3. 点击卸载

**通过安装器**：
```powershell
# 运行安装器 → 卸载选项
```

**完全清理**：
```powershell
# 移除配置文件
Remove-Item -Recurse $HOME\.openclaw
```

### macOS / Linux

```bash
# 运行卸载脚本
./scripts/uninstall-openclaw.sh

# 或手动删除
rm -rf ~/.openclaw
rm -rf /usr/local/bin/openclaw
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发设置

```bash
# 克隆项目
git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git
cd openclaw-anzhuang

# 安装依赖
npm install

# 开发模式启动
npm run tauri dev

# 构建项目
npm run tauri build
```

### 贡献指南

1. 🔀 Fork 项目
2. 🌿 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 📝 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 📤 推送分支 (`git push origin feature/AmazingFeature`)
5. 🔗 提交 Pull Request

---

## 📄 许可证

本项目采用 [MIT 许可证](LICENSE) - 详见 LICENSE 文件

---

## 🎯 功能路线图

| M1 | M2 | M3 | M4 | M5 | M6 |
|----|----|----|----|----|----|
| ✅ | ✅ | ✅ | ✅ | ⏳ | ⏳ |
| 项目搭建 | Dashboard | Linux 支持 | Windows 支持 | 更新/卸载 | 打磨/CI/CD |

- ✅ 已完成
- ⏳ 进行中
- 📋 计划中

---

## 📞 联系方式

- 📧 Email: support@openclaw.dev
- 🐛 Issues: [GitHub Issues](https://github.com/shopeetw225-byte/openclaw-anzhuang/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/shopeetw225-byte/openclaw-anzhuang/discussions)

---

## 🙏 致谢

感谢所有贡献者和用户的支持！

---

**⭐ 如果对你有帮助，请给个 Star！**

---

<div align="center">

**[⬆ 回到顶部](#openclaw-安装器)**

Made with ❤️ by OpenClaw Team

</div>
