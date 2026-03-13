# 🔨 编译和打包状态

## 📊 当前状态

- ✅ 项目配置完成
- ✅ GitHub Actions CI/CD 工作流就绪
- ✅ Windows 打包脚本就绪
- ✅ 卸载功能增强（集成 ByeByeClaw）
- ⏳ 等待首次编译

---

## 🚀 如何获取 Windows 版本

### 方案 1：GitHub Actions 自动编译（推荐）⭐

**无需本地 Windows 环境，自动编译！**

#### 步骤 1：推送代码到 GitHub

```bash
git push origin main
```

#### 步骤 2：监控编译进度

1. 访问你的 GitHub 仓库
2. 进入 **Actions** 标签页
3. 查看 **🔨 Build (Windows & macOS)** 工作流

**预期时间**：15-30 分钟

#### 步骤 3：下载安装程序

编译完成后：
1. 进入 **Releases** 页面
2. 下载最新版本的：
   - `tauri-app_x.x.x_x64_en-US.msi`（推荐）
   - `tauri-app_x.x.x_x64-setup.exe`（备选）

#### 自动化发布（可选）

创建版本标签自动触发编译和发布：

```bash
# 创建版本标签
git tag v0.1.0

# 推送标签到 GitHub
git push origin v0.1.0

# GitHub Actions 将自动：
# ✅ 编译 Windows 和 macOS
# ✅ 生成安装程序
# ✅ 创建 GitHub Release
# ✅ 上传到 Releases 页面
```

---

### 方案 2：本地 Windows 环境编译

**需要 Windows 机器和 Visual Studio Build Tools**

```powershell
# 1. 进入项目目录
cd openclaw-anzhuang

# 2. 运行一键编译脚本
.\build-windows.ps1

# 3. 输出文件在 dist-windows 目录中
# - dist-windows\*.msi
# - dist-windows\*.exe
```

详见：[QUICK_START_WINDOWS.md](QUICK_START_WINDOWS.md)

---

### 方案 3：使用预编译版本（如果已存在）

直接从 GitHub Releases 下载：

```
https://github.com/你的用户名/openclaw-anzhuang/releases
```

---

## 📦 打包输出文件

编译完成后会生成：

| 文件 | 大小 | 说明 |
|------|------|------|
| `tauri-app_x.x.x_x64_en-US.msi` | ~80MB | Windows MSI 安装程序（推荐） |
| `tauri-app_x.x.x_x64-setup.exe` | ~120MB | NSIS 便携式安装程序 |
| `OpenClaw 安装器_x.x.x_aarch64.dmg` | ~90MB | macOS Apple Silicon |
| `OpenClaw 安装器_x.x.x_x64.dmg` | ~90MB | macOS Intel |

---

## 🔧 配置信息

### Tauri 配置

**项目名称**：OpenClaw 安装器
**版本**：0.1.0
**标识符**：com.openclaw.installer
**WebView 模式**：自动下载（downloadBootstrapper）

### GitHub Actions 工作流

**文件**：`.github/workflows/build-windows.yml`

**触发条件**：
- ✅ 推送到 `main` 分支
- ✅ 推送到 `develop` 分支
- ✅ 创建版本标签（`v*.*.*`）
- ✅ 手动触发（workflow_dispatch）

**并行编译**：
- Windows x64（在 `windows-latest` 上）
- macOS Universal（在 `macos-latest` 上）

**输出**：
- 生成 GitHub Artifacts（30 天保留）
- 可选自动发布到 Releases

---

## 📋 首次编译检查清单

- [ ] 代码已提交到 GitHub
- [ ] `.github/workflows/build-windows.yml` 存在
- [ ] `package.json` 配置正确
- [ ] `src-tauri/Cargo.toml` 配置正确
- [ ] `src-tauri/tauri.conf.json` 配置正确
- [ ] 所有脚本文件已添加（`scripts/`）
- [ ] 前端代码已编译（`npm run build`）

---

## 🐛 故障排除

### 编译失败：构建 Windows x64 失败

**检查点**：
1. Node.js 版本是否 v18+？
2. Rust 是否已安装？
3. 代码是否有语法错误？

**查看日志**：
- GitHub Actions 界面 → 点击失败的工作流
- 查看 **Build Tauri app** 步骤的详细日志

### 编译失败：找不到卸载脚本

**解决**：
```bash
# 确保脚本文件存在
ls -la scripts/uninstall-openclaw.sh
ls -la scripts/windows/uninstall-openclaw.ps1

# 如果不存在，从项目重新获取
git pull origin main
```

### 编译超时（>30 分钟）

**原因**：可能是网络问题或磁盘空间不足

**解决**：
1. 检查 GitHub Actions 的日志
2. 重新运行工作流
3. 如果问题持续，使用本地编译方案

---

## 📈 编译统计

| 平台 | 工具链 | 打包格式 | 状态 |
|------|--------|---------|------|
| Windows | MSVC | MSI + NSIS | ✅ 配置完成 |
| macOS | Clang | DMG | ✅ 配置完成 |
| Linux | GCC | AppImage/deb | 📋 计划中 |

---

## 🔐 安全性

### 代码签名（可选）

如果需要为 Windows MSI 添加代码签名（提升用户信任）：

1. 获取代码签名证书
2. 在 GitHub Actions 中添加密钥
3. 配置签名命令

详见：[WINDOWS_BUILD_GUIDE.md](WINDOWS_BUILD_GUIDE.md#代码签名)

### 自动更新

Tauri 已配置自动更新机制（当前禁用）。如需启用：

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": ["https://github.com/你的用户名/openclaw-anzhuang/releases/latest/download/latest.json"]
    }
  }
}
```

---

## 📞 获取帮助

| 问题类型 | 资源 |
|----------|------|
| Windows 编译 | [QUICK_START_WINDOWS.md](QUICK_START_WINDOWS.md) |
| 详细打包指南 | [WINDOWS_BUILD_GUIDE.md](WINDOWS_BUILD_GUIDE.md) |
| GitHub Actions | [build-windows.yml](.github/workflows/build-windows.yml) |
| 一键编译脚本 | [build-windows.ps1](build-windows.ps1) |

---

## 🎯 下一步

1. **立即编译**：
   ```bash
   git push origin main
   ```
   然后监控 GitHub Actions 进度

2. **本地测试**（可选）：
   - 在 Windows 机器上运行 `.\build-windows.ps1`
   - 测试生成的 MSI 安装程序

3. **分发给用户**：
   - 从 GitHub Releases 下载
   - 或上传到公司网盘/服务器

4. **配置更新机制**（可选）：
   - 启用 Tauri updater
   - 用户可以自动更新到最新版本

---

**准备好了吗？** 现在就推送代码，让编译开始！🚀

```bash
git push origin main
```

然后访问 GitHub Actions 查看编译进度 ✨
