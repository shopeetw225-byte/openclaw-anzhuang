# 🚀 GitHub Actions 自动编译指南

> 完整的 CI/CD 配置，自动编译和发布 Windows/macOS 版本

---

## 🎯 功能概述

| 工作流 | 触发条件 | 功能 |
|------|---------|------|
| **🔨 Build** | 代码推送/PR | 自动编译 Windows + macOS |
| **🚀 Release** | 创建 Tag | 自动构建和发布 Release |

---

## 📋 目录

1. [自动编译工作流](#自动编译工作流)
2. [自动发布工作流](#自动发布工作流)
3. [查看编译结果](#查看编译结果)
4. [下载编译产物](#下载编译产物)
5. [故障排查](#故障排查)

---

## 🔨 自动编译工作流

### 触发条件

工作流在以下情况下自动启动：

```
push 到 main/develop 分支
  ↓
涉及文件：
  - src/**
  - src-tauri/**
  - package.json
  - .github/workflows/build-windows.yml

PR 提交到 main
手动触发（Actions → Build Windows）
```

### 工作流步骤

```
┌─────────────────────────────────┐
│   🔨 Build (Windows & macOS)    │
├─────────────────────────────────┤
│                                 │
│  ┌──────────────────────┐       │
│  │ 🪟 Windows Build      │       │
│  │ (windows-latest)      │       │
│  └──────────────────────┘       │
│          ↓                       │
│  ┌──────────────────────┐       │
│  │ 🍎 macOS Build        │       │
│  │ (macos-latest)        │       │
│  └──────────────────────┘       │
│          ↓                       │
│  ┌──────────────────────┐       │
│  │ ✅ Verify All Builds │       │
│  │ 检查所有产物         │       │
│  └──────────────────────┘       │
│          ↓                       │
│  ┌──────────────────────┐       │
│  │ 🧪 Test Windows Build │       │
│  │ 验证 MSI/EXE         │       │
│  └──────────────────────┘       │
│          ↓                       │
│  ┌──────────────────────┐       │
│  │ 📊 Build Status      │       │
│  │ 显示最终状态         │       │
│  └──────────────────────┘       │
│                                 │
└─────────────────────────────────┘
```

### 预期输出

编译成功后，你会看到：

```
✅ build-windows
   → windows-x64-builds artifact（30-40 MB）

✅ build-macos
   → macos-aarch64-builds artifact（50-80 MB）

✅ verify-builds
   → 验证所有产物完整性

✅ test-windows
   → 检验 MSI 和 EXE 文件

✅ build-status
   → 所有步骤完成
```

---

## 🚀 自动发布工作流

### 触发条件

**创建版本 Tag** 时自动启动发布流程：

```bash
# 创建新版本
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0

# GitHub Actions 会自动：
# 1. 编译 Windows 版本
# 2. 编译 macOS 版本
# 3. 生成 Release Notes
# 4. 上传所有文件到 GitHub Releases
```

### 工作流步骤

```
┌──────────────────────────────────┐
│  🚀 Publish Release              │
├──────────────────────────────────┤
│                                  │
│  ┌────────────────────┐          │
│  │ 🪟 Build Windows   │          │
│  │ 编译 MSI + EXE     │          │
│  └────────────────────┘          │
│          ↓                        │
│  ┌────────────────────┐          │
│  │ 🍎 Build macOS     │          │
│  │ 编译 DMG           │          │
│  └────────────────────┘          │
│          ↓                        │
│  ┌────────────────────┐          │
│  │ 📤 Publish Release │          │
│  │ 上传到 GitHub      │          │
│  └────────────────────┘          │
│          ↓                        │
│  🎉 Release 自动发布完成         │
│  → github.com/repo/releases/v0.1.0
│                                  │
└──────────────────────────────────┘
```

### 自动生成的内容

Release 页面会包含：

```markdown
## 📥 下载

### 🪟 Windows
- OpenClaw 安装器_x64.msi (推荐)
- OpenClaw 安装器_x64.exe (便携版)

### 🍎 macOS
- OpenClaw 安装器_aarch64.dmg (Apple Silicon)

## ✨ 功能特性
... (自动生成的发布说明)

## 📖 文档链接
... (指向编译指南、测试指南等)
```

---

## 📊 查看编译结果

### 方式 1️⃣ - GitHub Actions 页面

```
仓库主页
  → Actions（顶部菜单）
    → 🔨 Build 或 🚀 Publish Release
      → 最新运行记录
        → 查看详细日志
```

### 方式 2️⃣ - 查看工作流状态

```
仓库主页 → 右上角
  → 看到绿色 ✅ 表示编译成功
  → 看到红色 ❌ 表示编译失败
```

### 方式 3️⃣ - 在提交历史中查看

```
Commits 列表
  → 每个提交旁边有状态图标
  → 🟢 成功
  → 🔴 失败
  → 🟡 进行中
```

---

## 📥 下载编译产物

### 从自动编译工作流下载

1. **进入 GitHub Actions**
   ```
   仓库 → Actions → 🔨 Build
   ```

2. **选择最新成功的运行**
   ```
   Latest run → 名称为 "🔨 Build (Windows & macOS)"
   ```

3. **下载 Artifacts**
   ```
   页面底部 "Artifacts" 区域

   选择：
   - windows-x64-builds (30-40 MB)
   - macos-aarch64-builds (50-80 MB)
   ```

4. **解压并使用**
   ```
   unzip windows-x64-builds.zip
   → OpenClaw 安装器_x64.msi
   → OpenClaw 安装器_x64.exe
   ```

### 从 Release 下载

**发布后用户可以直接下载**：

```
仓库 → Releases → Latest
  ↓
看到所有平台的安装包
  ↓
点击下载对应文件
```

---

## 🔍 实时监控编译过程

### 查看完整日志

1. **点击工作流运行**
   ```
   Actions → [工作流名称] → [运行 ID]
   ```

2. **查看各个步骤**
   ```
   左侧菜单：
   - Setup Node.js
   - Install Rust
   - Install dependencies
   - Build frontend
   - Build Tauri app
   - Upload artifacts
   ```

3. **展开步骤查看详细输出**
   ```
   点击任何步骤 → 查看 stdout/stderr
   ```

### 常见日志标记

```
✅ Step completed successfully    成功
❌ Step failed                   失败
⏭️  Step skipped                  跳过
⚠️  Warning                       警告
ℹ️  Info                          信息
```

---

## 🐛 故障排查

### ❌ 编译失败

**检查日志**：

1. 进入 Actions → 失败的运行
2. 点击对应的 Job（如 "🪟 Build Windows"）
3. 展开失败的 Step 查看错误信息

**常见错误**：

| 错误 | 原因 | 解决 |
|------|------|------|
| `npm ci failed` | 依赖版本冲突 | 检查 package.json 和 package-lock.json |
| `rustc not found` | Rust 环境问题 | Actions 会自动安装，通常不会发生 |
| `Build failed` | 代码有语法错误 | 查看编译日志中的错误位置 |

### ⚠️ Artifacts 不完整

**检查 Artifacts**：

1. 下载后解压文件
2. 验证文件完整性：
   ```
   Windows:
   - OpenClaw 安装器_x64.msi（应该存在）
   - OpenClaw 安装器_x64.exe（可能不存在）

   macOS:
   - OpenClaw 安装器_aarch64.dmg（应该存在）
   ```

3. 文件大小异常？
   - MSI 通常 30-50 MB
   - EXE 通常 20-40 MB
   - DMG 通常 50-100 MB

### ❌ Release 发布失败

**检查发布工作流**：

1. Actions → 🚀 Publish Release
2. 查看 "📤 Publish to GitHub" 步骤
3. 常见原因：
   - Tag 格式错误（应该是 `v0.1.0` 格式）
   - 没有正确的权限
   - 网络连接问题

---

## 📝 工作流配置文件

### 位置

```
.github/workflows/
├── build-windows.yml      ← 自动编译工作流
└── publish-release.yml    ← 自动发布工作流
```

### 修改工作流

如需修改编译配置：

1. **编辑工作流文件**
   ```
   .github/workflows/build-windows.yml
   ```

2. **常见修改**
   ```yaml
   # 修改触发分支
   on:
     push:
       branches:
         - main          # ← 修改这里
         - develop       # ← 或添加新分支

   # 修改编译环境
   runs-on: windows-latest  # ← 可选 windows-2022 等

   # 修改 Node 版本
   node-version: '20'  # ← 改为其他版本
   ```

3. **提交修改**
   ```bash
   git add .github/workflows/
   git commit -m "ci: update workflow configuration"
   git push origin main
   ```

---

## 🎓 最佳实践

### 1️⃣ 频繁提交小改动

```bash
# ✅ 好的做法
git push  # → 快速编译，反馈及时

# ❌ 避免
# 存放太久再推送大量改动
```

### 2️⃣ 在本地测试关键改动

```bash
# 在推送前本地验证
npm run build
npm run tauri build

# 确保编译成功后再 push
```

### 3️⃣ 使用有意义的 Tag

```bash
# ✅ 好的版本号
git tag v1.0.0
git tag v0.1.0
git tag v0.1.0-beta

# ❌ 避免
git tag latest
git tag release
```

### 4️⃣ 定期检查 Actions 日志

```
每周检查：
- 是否有频繁失败的 step
- 编译时间是否不断增长
- 是否有过时的依赖警告
```

---

## 📊 性能优化

### 编译时间参考

| 步骤 | 首次编译 | 后续编译 |
|------|---------|---------|
| 🪟 Windows | 15-20 分钟 | 5-10 分钟 |
| 🍎 macOS | 12-18 分钟 | 4-8 分钟 |
| **总计** | **20-30 分钟** | **8-15 分钟** |

### 加速编译

1. **启用 Cache**（已配置）
   ```yaml
   cache: 'npm'  # 缓存 node_modules
   ```

2. **使用 Artifacts 缓存**
   - GitHub Actions 会缓存下载的依赖
   - 减少重复下载时间

3. **避免不必要的重编译**
   - 只在关键文件改动时触发编译
   - 已配置 `paths` 过滤

---

## 🔐 安全考虑

### Token 和凭证

```yaml
# ✅ 安全做法（已配置）
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  TAURI_SIGNING_PRIVATE_KEY: ""  # 空值，正式发布时配置

# ❌ 不要这样做
env:
  MY_SECRET: "hardcoded-secret"
```

### 代码签名（可选）

对于正式发布，建议配置代码签名：

```bash
# 生成签名密钥
cargo tauri signer generate

# 在 GitHub Secrets 中配置
# Settings → Secrets and variables → Actions
# 添加 TAURI_SIGNING_PRIVATE_KEY
```

---

## 📚 相关文档

- [编译指南](./COMPILE_WINDOWS.md) - 本地编译步骤
- [Windows 测试指南](./WINDOWS_TEST_GUIDE.md) - 测试场景
- [Tauri 文档](https://tauri.app/)
- [GitHub Actions 文档](https://docs.github.com/actions)

---

## 💡 常见问题

### Q: 为什么编译时间这么长？

**A**:
- 首次编译需要下载和编译所有依赖
- Rust 编译通常需要 5-10 分钟
- 后续编译会更快（使用缓存）

### Q: 能否只编译 Windows？

**A**: 可以，修改 workflows 文件移除 macOS 部分。但不推荐，同时编译能验证跨平台兼容性。

### Q: 发布失败了怎么办？

**A**:
1. 检查 Tag 格式是否正确（`v0.1.0`）
2. 查看日志找出具体错误
3. 修复代码后重新创建 Tag

### Q: 能否自动更新应用？

**A**: 可以！需要配置 Tauri 的更新器。参考 `tauri.conf.json` 中的 plugins 部分。

### Q: 下载 Artifacts 有大小限制吗？

**A**: GitHub 免费版本 Artifacts 默认保留 30 天。可在 Actions 设置中修改。

---

## 🎯 总结

### 工作流优势

✅ **自动化** - 代码推送后自动编译
✅ **多平台** - Windows + macOS 同时构建
✅ **一键发布** - 创建 Tag 自动生成 Release
✅ **质量保证** - 自动验证编译产物
✅ **成本低** - GitHub 免费版本足够使用

### 下一步

1. ✅ 代码推送到 GitHub
2. ✅ 工作流自动启动
3. 📦 下载编译产物测试
4. 🏷️ 创建 Tag 发布版本
5. 📤 Release 自动生成和上传

---

**现在你的项目已经有完整的 CI/CD 流程了！** 🚀

有问题？查看 GitHub Actions 的详细日志或提交 Issue。

