# Windows 打包完整指南

本指南提供两种方法为 Windows 用户打包 OpenClaw 安装器：

## 方案 1：GitHub Actions 自动编译（推荐）⭐

**优点：**
- 无需本地 Windows 环境
- 自动化构建，一次推送即可生成 MSI 和 EXE
- 支持并行编译（Windows + macOS）
- 自动上传到 GitHub Releases

### 步骤 1：推送代码到 GitHub

```bash
git push origin main
```

### 步骤 2：监控编译进度

访问你的 GitHub 仓库 → **Actions** 标签 → 查看 **🔨 Build (Windows & macOS)** 工作流

### 步骤 3：下载安装程序

编译完成后，进入 **Release** 页面：
- 下载 `tauri-app_x.x.x_x64_en-US.msi`（推荐用户下载）
- 或 `tauri-app_x.x.x_x64-setup.exe`（NSIS 安装程序，可选）

---

## 方案 2：本地 Windows 环境编译

### 前置要求

你需要在 **Windows 机器**上准备：

#### 1. 安装 Node.js（v18+）

```powershell
# 使用 nvm-windows（推荐）
# 访问 https://github.com/coreybutler/nvm-windows/releases

# 或直接下载 Node.js
# https://nodejs.org/
```

#### 2. 安装 Rust

```powershell
# 使用 rustup（推荐）
curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

确保安装了 Windows MSVC 工具链：

```powershell
rustup target add x86_64-pc-windows-msvc
```

#### 3. 安装 Visual Studio Build Tools

下载并安装 **Visual Studio Build Tools for Windows**：
- URL：https://visualstudio.microsoft.com/zh-hans/downloads/
- 选择 **C++ 桌面开发工具**
- 确保勾选 **Windows 10 SDK** 和 **MSVC v143**

#### 4. 安装 WiX Toolset（生成 MSI）

```powershell
# 使用 chocolatey
choco install wixtoolset -y

# 或手动下载
# https://github.com/wixtoolset/wix3/releases
```

### 编译步骤

#### 1. 克隆项目

```powershell
git clone https://github.com/openclaw/openclaw-anzhuang.git
cd openclaw-anzhuang
```

#### 2. 安装依赖

```powershell
npm install
```

#### 3. 编译前端

```powershell
npm run build
```

#### 4. 编译 Tauri 应用

```powershell
npm run tauri build
```

这会生成：
- **MSI 安装程序**：`src-tauri/target/release/bundle/msi/`
- **NSIS 安装程序**：`src-tauri/target/release/bundle/nsis/`

### 输出文件

编译完成后，查看以下目录：

```
src-tauri/target/release/bundle/
├── msi/
│   └── OpenClaw_安装器_0.1.0_x64_en-US.msi  ← 推荐
└── nsis/
    └── OpenClaw_安装器_0.1.0_x64-setup.exe
```

---

## 方案 3：Docker 容器编译（高级）

如果你想在 macOS 或 Linux 上编译 Windows 版本，使用 Docker：

```bash
# 创建 Dockerfile
cat > Dockerfile.windows << 'EOF'
FROM mcr.microsoft.com/windows/servercore:ltsc2019

# 安装 Node.js、Rust、Visual Studio Build Tools 等
RUN powershell -NoProfile -Command \
    Invoke-WebRequest -Uri "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip" -OutFile "node.zip"; \
    Expand-Archive -Path "node.zip" -DestinationPath "C:\"; \
    $env:PATH = "C:\node-v22.14.0-win-x64;$env:PATH"

# ... 其他安装步骤
EOF

# 编译
docker build -f Dockerfile.windows -t openclaw-build .
docker run -v $(pwd):/workspace openclaw-build npm run tauri build
```

---

## 故障排除

### 问题 1：找不到 cl.exe（MSVC）

**解决方案：**
```powershell
# 运行 Visual Studio Build Tools 安装程序
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
```

### 问题 2：WiX Toolset 编译失败

**解决方案：**
```powershell
# 重新安装 WiX
choco uninstall wixtoolset -y
choco install wixtoolset -y
```

### 问题 3：Cargo 编译超时

**解决方案：**
```powershell
# 增加超时时间
$env:CARGO_BUILD_JOBS = 2
npm run tauri build
```

---

## 版本发布流程

### 自动化发布（GitHub Actions）

当你推送带有版本标签的提交时，GitHub Actions 自动触发：

```bash
# 创建版本标签
git tag v0.1.0
git push origin v0.1.0
```

这会自动：
1. ✅ 编译 Windows 和 macOS
2. ✅ 生成 MSI、EXE、DMG 文件
3. ✅ 上传到 GitHub Releases
4. ✅ 生成自动发布说明

### 手动上传

如果使用本地编译，手动上传到 Releases：

```bash
gh release create v0.1.0 \
  src-tauri/target/release/bundle/msi/*.msi \
  src-tauri/target/release/bundle/nsis/*.exe \
  --title "OpenClaw 安装器 v0.1.0"
```

---

## 打包配置说明

### tauri.conf.json

关键配置：

```json
{
  "productName": "OpenClaw 安装器",
  "version": "0.1.0",
  "bundle": {
    "windows": {
      "webviewInstallMode": {
        "type": "downloadBootstrapper",
        "silent": true
      }
    }
  }
}
```

- **productName**：Windows 控制面板显示的名称
- **webviewInstallMode**：自动下载 WebView 运行时，无需用户手动安装

### src-tauri/Cargo.toml

```toml
[package]
name = "tauri-app"
version = "0.1.0"

[dependencies]
tauri = { version = "2", features = [] }
# 其他依赖...
```

---

## 验证打包

### 测试 MSI 安装

```powershell
# 仅预览，不实际安装
msiexec /i "OpenClaw_安装器_0.1.0_x64_en-US.msi" /qb ALLUSERS=1
```

### 检查应用启动

```powershell
# 启动应用
"C:\Program Files\OpenClaw 安装器\OpenClaw 安装器.exe"
```

---

## 最佳实践

| 项 | 建议 |
|---|-----|
| **编译平台** | 在 Windows 上编译 Windows 版本（最可靠） |
| **CI/CD** | 使用 GitHub Actions 自动化编译（推荐） |
| **签名** | 为 MSI 添加代码签名（可选，用于提升信任） |
| **测试** | 在干净的 Windows VM 上测试安装 |
| **版本控制** | 使用 git tag 管理版本 |
| **更新机制** | 配置 Tauri updater 自动推送更新 |

---

## 下一步

- [ ] 在 Windows 机器上编译第一个版本
- [ ] 创建 GitHub Release 并上传到 Releases
- [ ] 测试 MSI 安装程序
- [ ] 配置代码签名（可选）
- [ ] 设置自动更新（Tauri updater）

更多信息：
- [Tauri 打包文档](https://tauri.app/v1/guides/building/)
- [WiX Toolset 文档](https://wixtoolset.org/)
