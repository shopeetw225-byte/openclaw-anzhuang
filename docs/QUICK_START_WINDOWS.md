# ⚡ Windows 用户快速开始

## 🎯 3 分钟快速编译

### 前置要求

在 Windows 机器上安装：
- [Node.js v18+](https://nodejs.org/)
- [Rust](https://rustup.rs/)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) （选择 C++ 桌面开发工具）
- [WiX Toolset](https://wixtoolset.org/) （生成 MSI，推荐）

### 一键编译

```powershell
# 1. 克隆项目
git clone https://github.com/openclaw/openclaw-anzhuang.git
cd openclaw-anzhuang

# 2. 运行编译脚本
.\build-windows.ps1
```

**就这么简单！** 🎉

编译完成后，你会在 `dist-windows` 文件夹中找到：
- `OpenClaw_安装器_x.x.x_x64_en-US.msi` ← 推荐分发
- `OpenClaw_安装器_x.x.x_x64-setup.exe` ← 备选

---

## 📦 分发给用户

### 方案 A：GitHub Releases（推荐）

```powershell
# 创建版本标签
git tag v0.1.0
git push origin v0.1.0

# 上传安装程序到 Releases
gh release create v0.1.0 dist-windows/* --title "OpenClaw 安装器 v0.1.0"
```

用户访问：`https://github.com/你的用户名/openclaw-anzhuang/releases`

### 方案 B：网盘分享

直接分享 `dist-windows` 文件夹中的 MSI 文件给用户。

### 方案 C：公司内网

将 MSI 放在内部服务器，通过组策略或手动分发。

---

## 🔧 常见问题

### Q: 编译失败，显示 "cl.exe not found"

**A:** 运行以下命令设置 Visual Studio 环境变量：

```powershell
"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
```

然后重新运行编译脚本。

### Q: 生成的只有 EXE，没有 MSI

**A:** 需要安装 WiX Toolset：

```powershell
choco install wixtoolset -y
```

### Q: 安装程序很大（>100MB）

**A:** 这是正常的，包含：
- WebView 运行时（60MB）
- Node.js 和依赖（40MB）
- Tauri 框架（5MB）

可以配置启动时按需下载 WebView。

### Q: 如何给 MSI 签名？

**A:** 配置代码签名证书，见 [完整指南](./WINDOWS_BUILD_GUIDE.md)。

---

## 📚 更多信息

详细指南：[WINDOWS_BUILD_GUIDE.md](./WINDOWS_BUILD_GUIDE.md)

---

## ✅ 测试清单

- [ ] 本地编译成功，生成 MSI/EXE
- [ ] 在干净的 Windows 10/11 VM 上测试安装
- [ ] 验证应用启动无误
- [ ] 测试卸载功能（使用深度卸载）
- [ ] 上传到 GitHub Releases

---

**下一步：** 在 Windows 机器上运行 `.\build-windows.ps1`，享受自动化构建！ 🚀
