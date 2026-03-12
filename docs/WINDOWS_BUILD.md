# Windows 打包指南

本文档说明如何为 Windows 构建和打包 OpenClaw 安装器。

## 系统要求

- **操作系统**：Windows 10 / Windows 11 (x64)
- **构建环境**：
  - Node.js >= 18
  - Rust >= 1.70
  - Visual Studio Build Tools 2022 或 Visual Studio Community 2022（C++ 工作负载）
  - Tauri CLI >= 2.0

## 快速开始

### 1. 安装依赖

```bash
# 安装 Rust（如未安装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Visual Studio Build Tools
# https://visualstudio.microsoft.com/downloads/
# 选择 "Desktop development with C++"

# 安装 Node.js 依赖
npm install

# 安装 Tauri CLI（如未安装）
npm install -D @tauri-apps/cli
```

### 2. 开发模式运行

```bash
npm run tauri dev
```

### 3. 构建发布版本

```bash
# 构建前端和 Rust 后端
npm run tauri build

# 输出文件位置：
# - MSI 安装包：src-tauri/target/release/bundle/msi/
# - EXE 便携版：src-tauri/target/release/
```

## 打包输出

成功构建后，产物位置：

```
src-tauri/target/release/bundle/
├── msi/
│   └── OpenClaw_安装器_x64_zh-CN.msi        # MSI 安装包（推荐）
├── nsis/
│   └── OpenClaw_安装器_x64_zh-CN.exe       # NSIS 安装向导
└── portable/
    └── OpenClaw_安装器_x64_zh-CN.exe       # 便携版（绿色版）
```

## 配置说明

### tauri.conf.json Windows 配置

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": null,      // 代码签名证书指纹（可选）
      "signingIdentity": null,            // 签名标识（可选）
      "allowSignless": true,              // 允许无签名安装
      "webviewInstallMode": {
        "silent": true,                   // 静默安装 WebView2
        "runAfterInstall": true          // 安装后自动运行应用
      },
      "wix": null                        // WiX 工具链配置（使用 MSI）
    }
  }
}
```

## 代码签名（可选）

如需为安装包签名以增强用户信任，需准备：

1. **获取代码签名证书**
   - 购买或获取 Authenticode 代码签名证书（.pfx）
   - 或使用自签名证书用于测试

2. **配置签名**
   ```json
   {
     "bundle": {
       "windows": {
         "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
         "signingIdentity": "YOUR_IDENTITY_NAME"
       }
     }
   }
   ```

3. **设置环境变量**
   ```powershell
   # PowerShell
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your_password"
   ```

## CI/CD 集成

### GitHub Actions 配置示例

参考 `.github/workflows/publish-windows.yml`：

```yaml
name: Publish Windows

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: dtolnay/rust-toolchain@stable

      - name: Install dependencies
        run: npm ci

      - name: Build and package
        run: npm run tauri build

      - name: Upload to release
        uses: softprops/action-gh-release@v1
        with:
          files: src-tauri/target/release/bundle/**/*
```

## 故障排除

### 问题：构建失败 - "无法找到 Visual Studio"

**解决**：
```bash
# 确保安装了 Visual Studio Build Tools 2022
# https://visualstudio.microsoft.com/downloads/

# 或手动指定 VS 路径
$env:VSINSTALLDIR = "C:\Program Files\Microsoft Visual Studio\2022\Community"
npm run tauri build
```

### 问题：WebView2 安装失败

**解决**：
- 确保 Windows 10/11 已安装最新更新
- 手动下载 WebView2 运行时：https://go.microsoft.com/fwlink/p/?LinkId=2124703

### 问题：MSI 文件过大

**优化**：
- 清理 `src-tauri/target/` 和 `dist/` 目录
- 使用 Release 构建（已默认）
- 删除不必要的依赖

## 发布清单

- [ ] 更新 `src-tauri/tauri.conf.json` 版本号
- [ ] 测试 MSI 安装和卸载流程
- [ ] 测试便携版运行
- [ ] 验证所有 Windows 路径（WSL/PowerShell/NSSM）
- [ ] 检查管理员权限检查是否正常
- [ ] 验证错误提示和日志输出
- [ ] 签名 MSI 文件（如需要）
- [ ] 上传到 GitHub Release

## 更新机制

应用支持自动更新。更新流程：

1. 应用检查 GitHub Release 的 `latest.json`
2. 下载新版本 MSI
3. 提示用户安装更新
4. 下载后自动重启并安装

配置文件：`src-tauri/tauri.conf.json` 中的 `updater` 字段

## 卸载

用户可通过以下方式卸载：

1. **Windows 设置** → 应用 → 应用和功能 → OpenClaw 安装器 → 卸载
2. **控制面板** → 程序和功能 → OpenClaw 安装器 → 卸载

卸载时 PowerShell 脚本会：
- 停止 OpenClaw Gateway 服务
- 移除 NSSM 服务注册
- 清理用户配置（可选保留）
