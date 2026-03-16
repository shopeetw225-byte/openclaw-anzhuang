# 🔨 Windows 编译指南

> 完整的 OpenClaw 安装器 Windows 版本编译步骤

---

## ✅ 前置要求

### 1️⃣ **Node.js 20+**
```powershell
# 下载和安装
# https://nodejs.org/ (下载 LTS 版本)

# 验证安装
node -v
npm -v
```

**最小版本**：
- Node.js 20.0.0+
- npm 10.0.0+

---

### 2️⃣ **Rust**
```powershell
# 下载和安装
# https://rustup.rs/

# 运行安装程序，选择默认选项
# 验证安装
rustc --version
cargo --version

# 应该显示：
# rustc 1.75.0+ (或更新版本)
# cargo 1.75.0+ (或更新版本)
```

---

### 3️⃣ **Visual Studio Build Tools 2022**

这是必需的，用于编译 Rust 代码。

**方式 A - 完整 Visual Studio**（推荐）:
```
访问：https://visualstudio.microsoft.com/downloads/
下载：Visual Studio Community 2022
安装时选择：C++ 工作负载
```

**方式 B - 仅 Build Tools**（节省空间）:
```
访问：https://visualstudio.microsoft.com/downloads/
下载：Build Tools for Visual Studio 2022
运行安装程序：
  ✅ Desktop development with C++
  ✅ MSVC v143 or higher
  ✅ Windows 11 SDK
```

**验证安装**:
```powershell
# 应该能找到 cl.exe
where cl.exe

# 如果找不到，需要在 PowerShell 中配置环境变量
# 参考下面的"环境变量设置"部分
```

---

### 4️⃣ **Git**（可选）
```powershell
# 如果还没安装
# https://git-scm.com/download/win

# 验证
git --version
```

---

### 5️⃣ **系统要求**

| 项目 | 最低要求 | 推荐配置 |
|------|---------|---------|
| Windows 版本 | Windows 10 | Windows 11 |
| 磁盘空间 | 5 GB | 10+ GB |
| RAM | 4 GB | 8+ GB |
| 网络 | 需要（下载依赖） | 宽带 |

---

## 🔧 环境变量设置（如需要）

### 检查 MSVC 环境

```powershell
# 运行 MSVC 开发者命令提示符
# 应该在开始菜单找到：
# "x64 Native Tools Command Prompt for VS 2022"

# 或手动配置（如果 cl.exe 找不到）
$vsPath = "C:\Program Files\Microsoft Visual Studio\2022\Community"
$vcvarsPath = "$vsPath\VC\Auxiliary\Build\vcvars64.bat"

# 在 PowerShell 中运行
& $vcvarsPath

# 验证
cl.exe /?
```

---

## 📥 获取代码

### 方式 1️⃣ - Git 克隆（推荐）

```powershell
# 打开 PowerShell 或 CMD

# 克隆项目
git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git

# 进入目录
cd openclaw-anzhuang

# 查看分支
git branch -a

# 切换到 main（如果不是）
git checkout main
```

### 方式 2️⃣ - 下载 ZIP

```powershell
# 访问：https://github.com/shopeetw225-byte/openclaw-anzhuang
# 点击：Code → Download ZIP
# 解压到任意位置
# PowerShell 进入解压的目录
cd C:\path\to\openclaw-anzhuang
```

---

## 🔨 编译步骤

### **步骤 1️⃣ - 安装依赖**

```powershell
# 确保在项目根目录
cd openclaw-anzhuang

# 安装 npm 依赖
npm install

# 应该看到：
# added XXX packages in XXXs
```

**如果遇到问题**:
```powershell
# 清除缓存重试
npm cache clean --force
npm install

# 或删除 node_modules 重新安装
Remove-Item -Recurse node_modules
Remove-Item package-lock.json
npm install
```

---

### **步骤 2️⃣ - 初始化 Rust 依赖**

```powershell
# 进入 Tauri 后端目录
cd src-tauri

# 检查 Rust 工具链
rustup show

# 应该显示：
# installed toolchains:
# stable-x86_64-pc-windows-msvc (default)

# 回到项目根目录
cd ..
```

---

### **步骤 3️⃣ - 开发模式编译（可选，用于测试）**

```powershell
# 启动开发服务器（热重载）
npm run tauri dev

# 应该打开应用窗口
# 可以实时编辑代码，自动刷新

# 按 Ctrl+C 关闭
```

---

### **步骤 4️⃣ - 生产编译（构建安装包）**

```powershell
# 从项目根目录运行
npm run tauri build

# 这将：
# 1. 编译前端 React 代码
# 2. 编译 Rust 后端
# 3. 生成 Windows 安装包
#    - MSI 安装程序
#    - NSIS 便携版 EXE
#    - ZIP 压缩包

# 过程需要 5-15 分钟（取决于你的电脑速度）
```

**完整输出应该显示**:
```
Compiling openclaw-installer v0.1.0
    Finished release [optimized] target(s) in XXs
 INFO tauri::build > your app has been successfully bundled and is ready for distribution!

Generated installers:
  - src-tauri\target\release\bundle\msi\OpenClaw 安装器_0.1.0_x64.msi
  - src-tauri\target\release\bundle\nsis\OpenClaw 安装器_0.1.0_x64.exe
  - src-tauri\target\release\bundle\nsis\OpenClaw 安装器_0.1.0_x64_en-US.exe
```

---

## 📦 编译产物位置

```
src-tauri/target/release/bundle/
├── msi/
│   └── OpenClaw 安装器_0.1.0_x64.msi      ← MSI 安装包（推荐）
├── nsis/
│   ├── OpenClaw 安装器_0.1.0_x64.exe      ← NSIS 安装程序
│   └── OpenClaw 安装器_0.1.0_x64_en-US.exe
├── msi-bundle/
│   └── OpenClaw 安装器_0.1.0_x64-bundle.exe  ← 带运行时的便携版
└── app/
    └── OpenClaw_安装器_0.1.0_x64.exe       ← 应用程序本身
```

---

## 🧪 测试编译产物

### 1️⃣ 测试 MSI 安装包

```powershell
# 双击 MSI 文件
# 或使用命令行安装
msiexec /i "src-tauri\target\release\bundle\msi\OpenClaw 安装器_0.1.0_x64.msi"

# 跟随安装向导
# 验证应用已安装
```

### 2️⃣ 测试便携版 EXE

```powershell
# 直接运行 EXE
.\src-tauri\target\release\bundle\nsis\OpenClaw 安装器_0.1.0_x64.exe

# 选择安装或运行
```

### 3️⃣ 运行已安装的应用

```powershell
# 通过开始菜单
# 或运行
openclaw-anzhuang

# 或查找应用安装位置
$env:ProgramFiles\OpenClaw
```

---

## 🐛 常见编译错误

### ❌ Error: "cannot find -lws2_32"

**原因**：缺少 Windows SDK

**解决**：
```powershell
# 打开 Visual Studio Installer
# 修改 Visual Studio
# → 工作负载 → C++ 工作负载
# → 单个组件 → Windows 11 SDK（或最新版本）
# → 安装

# 重启编译
npm run tauri build
```

---

### ❌ Error: "rustc not found"

**原因**：Rust 未正确安装或不在 PATH

**解决**：
```powershell
# 重新安装 Rust
# https://rustup.rs/

# 或手动添加到 PATH
$env:Path += ";$env:USERPROFILE\.cargo\bin"

# 验证
rustc --version

# 重启编译
npm run tauri build
```

---

### ❌ Error: "cl.exe not found"

**原因**：MSVC 未在 PATH 中

**解决**：
```powershell
# 方式 1: 使用开发者命令提示符
# 开始菜单 → "x64 Native Tools Command Prompt for VS 2022"
# 然后运行 npm run tauri build

# 方式 2: 手动配置环境变量
$vsPath = "C:\Program Files\Microsoft Visual Studio\2022\Community"
$vcvarsPath = "$vsPath\VC\Auxiliary\Build\vcvars64.bat"
& $vcvarsPath

npm run tauri build
```

---

### ❌ Error: "npm ERR! code ETIMEDOUT"

**原因**：网络问题，npm 下载超时

**解决**：
```powershell
# 增加超时时间
npm install --legacy-peer-deps --fetch-timeout=60000

# 或使用淘宝镜像
npm config set registry https://registry.npmmirror.com
npm install

# 重新编译
npm run tauri build
```

---

### ❌ Error: "The build failed"（无具体错误信息）

**原因**：可能是多个问题的组合

**解决**：
```powershell
# 1. 清除缓存
npm cache clean --force
cargo clean

# 2. 删除 node_modules
Remove-Item -Recurse node_modules
Remove-Item package-lock.json

# 3. 重新安装
npm install

# 4. 详细编译（查看更多信息）
npm run tauri build -- --verbose

# 或
cargo build --release --verbose
```

---

## ⚡ 编译优化

### 加快编译速度

```powershell
# 1. 使用 sccache（缓存编译产物）
cargo install sccache
$env:RUSTC_WRAPPER = "sccache"

# 2. 启用增量编译
$env:CARGO_INCREMENTAL = "1"

# 3. 使用更多并行编译
$env:CARGO_BUILD_JOBS = "4"  # 使用 4 个 CPU 核心

# 然后编译
npm run tauri build
```

### 减小编译体积

```toml
# src-tauri/Cargo.toml
[profile.release]
opt-level = "z"      # 最小化代码大小
lto = true          # 启用链接时优化
codegen-units = 1   # 更好的优化
strip = true        # 移除调试符号
```

---

## 📋 编译检查清单

- [ ] Node.js 20+ 已安装
- [ ] Rust 已安装
- [ ] Visual Studio Build Tools 已安装
- [ ] C++ 工作负载已选中
- [ ] Windows SDK 已安装
- [ ] 代码已克隆到本地
- [ ] `npm install` 已完成
- [ ] `npm run tauri build` 可以正常运行
- [ ] MSI 和 EXE 文件已生成
- [ ] 应用可以正常启动

---

## 🚀 快速编译脚本

将以下内容保存为 `build.ps1`：

```powershell
# build.ps1 - Windows 一键编译脚本

Write-Host "🔨 开始编译 OpenClaw..." -ForegroundColor Green

# 1. 检查先决条件
Write-Host "`n✓ 检查 Node.js..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js，请先安装" -ForegroundColor Red
    exit 1
}
node -v

Write-Host "`n✓ 检查 Rust..." -ForegroundColor Cyan
if (-not (Get-Command rustc -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Rust，请先安装" -ForegroundColor Red
    exit 1
}
rustc --version

# 2. 安装依赖
Write-Host "`n✓ 安装 npm 依赖..." -ForegroundColor Cyan
npm install

# 3. 编译
Write-Host "`n✓ 开始编译..." -ForegroundColor Cyan
npm run tauri build

# 4. 验证产物
Write-Host "`n✓ 验证编译产物..." -ForegroundColor Cyan
$msiFile = Get-ChildItem "src-tauri\target\release\bundle\msi\*.msi" | Select-Object -First 1
$exeFile = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1

if ($msiFile -and $exeFile) {
    Write-Host "`n✅ 编译成功！" -ForegroundColor Green
    Write-Host "MSI: $($msiFile.FullName)" -ForegroundColor Cyan
    Write-Host "EXE: $($exeFile.FullName)" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ 编译失败，未找到安装包" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 编译完成！" -ForegroundColor Green
```

运行脚本：
```powershell
.\build.ps1
```

---

## 📊 编译时间参考

| 硬件配置 | 首次编译 | 增量编译 |
|---------|---------|---------|
| i5 + 8GB RAM | 10-15 分钟 | 1-2 分钟 |
| i7 + 16GB RAM | 5-10 分钟 | 30 秒 |
| Ryzen 7 + 32GB RAM | 3-5 分钟 | 10 秒 |

首次编译较慢是正常的，因为需要下载和编译所有依赖。

---

## 🆘 需要帮助？

如果遇到编译问题：

1. **查看完整日志**
   ```powershell
   npm run tauri build -- --verbose
   ```

2. **清除缓存重试**
   ```powershell
   cargo clean
   npm cache clean --force
   npm install
   npm run tauri build
   ```

3. **提交 Issue**
   - GitHub: https://github.com/shopeetw225-byte/openclaw-anzhuang/issues
   - 包含完整的错误日志
   - 系统信息（Windows 版本、硬件配置）

---

## ✅ 编译完成后

```powershell
# 1. 测试安装
.\src-tauri\target\release\bundle\msi\*.msi

# 2. 验证应用
# 开始菜单 → OpenClaw 安装器

# 3. 上传到 GitHub Releases
# https://github.com/shopeetw225-byte/openclaw-anzhuang/releases/new
```

---

**准备好编译了吗？** 🚀

在 Windows PowerShell 中运行：
```powershell
git clone https://github.com/shopeetw225-byte/openclaw-anzhuang.git
cd openclaw-anzhuang
npm install
npm run tauri build
```

祝编译顺利！✨
