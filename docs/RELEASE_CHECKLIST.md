# 🚀 OpenClaw 安装器 发布清单

本清单用于确保每个版本发布时都完成必要的检查和步骤。

## 版本号规范

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **MAJOR**: 破坏性更改（新平台支持、删除功能）
- **MINOR**: 功能性更新（新功能、向后兼容）
- **PATCH**: 错误修复（bug 修复、小改进）

示例：`v0.1.0` → `v0.2.0` → `v0.2.1`

---

## 发布前检查

### 代码审查
- [ ] 所有 PR 已审查且批准
- [ ] CI/CD 所有检查已通过
- [ ] TypeScript 编译无错误
- [ ] Rust `cargo check` 通过

### 功能测试（Windows）
- [ ] **WSL2 路径**
  - [ ] WSL 未安装 → 正确检测并提示安装
  - [ ] WSL 已安装但无 Ubuntu → 自动安装 Ubuntu
  - [ ] WSL + Ubuntu 都有 → 正确进入 Linux 安装路径
  - [ ] WSL 状态未知 → 自动降级到 PowerShell 路径

- [ ] **PowerShell 路径**（不支持 WSL 的机器）
  - [ ] Node.js 安装成功
  - [ ] npm 全局安装成功
  - [ ] NSSM 安装和服务注册成功
  - [ ] Gateway 开机自启正常

- [ ] **权限处理**
  - [ ] Windows + 非管理员 → 警告提示 + 禁用按钮
  - [ ] Windows + 管理员 → 正常安装流程
  - [ ] PowerShell 脚本 UAC 请求正常

- [ ] **错误处理**
  - [ ] 网络错误 → 提示明确的解决方案
  - [ ] 磁盘空间不足 → 清晰的错误提示
  - [ ] 脚本执行失败 → 正确的错误日志
  - [ ] 重启后恢复 → 能从断点继续

### 用户体验
- [ ] 所有错误提示清晰易懂
- [ ] UI 布局正确，无排版错误
- [ ] 中英文显示正确（如有）
- [ ] 进度条显示准确

### 文档完整性
- [ ] [WINDOWS_BUILD.md](WINDOWS_BUILD.md) - Windows 构建指南
- [ ] [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) - 此文档
- [ ] README 已更新版本号
- [ ] 更新日志（CHANGELOG.md）已更新

---

## 准备发布

### 1. 更新版本号

```bash
# 更新 src-tauri/tauri.conf.json
{
  "version": "0.2.0"  // 新版本号
}

# 更新 package.json（如有）
{
  "version": "0.2.0"
}
```

### 2. 构建 Windows 产物

```bash
# macOS/Linux
bash scripts/build-windows.sh

# Windows PowerShell
npm run tauri build

# 验证产物
# src-tauri/target/release/bundle/msi/*.msi
# src-tauri/target/release/bundle/nsis/*.exe
```

### 3. 本地安装测试

```powershell
# 在 Windows 10/11 上测试 MSI 安装
# 1. 双击 MSI 文件启动安装向导
# 2. 完成所有步骤，确认安装成功
# 3. 启动应用，验证功能正常
# 4. 卸载应用，确认卸载干净

# 可选：测试便携版
# src-tauri/target/release/OpenClaw_安装器_x64.exe --portable
```

### 4. 签名 MSI 文件（可选但推荐）

```bash
# 如有代码签名证书
# 参考: docs/WINDOWS_BUILD.md 中的"代码签名"部分

# 验证签名
signtool verify /pa /v "path/to/OpenClaw_安装器_x64.msi"
```

### 5. 提交和标签

```bash
# 确保工作目录干净
git status

# 提交版本号更新
git add src-tauri/tauri.conf.json package.json docs/
git commit -m "chore: bump version to v0.2.0"

# 创建版本标签（触发自动发布）
git tag -a v0.2.0 -m "Release v0.2.0

## Changes
- Feat: 新增 Windows 完整支持
- Fix: 修复 UTF-16 解码问题
- Fix: 改进错误提示信息"

# 推送代码和标签
git push origin main --tags
```

---

## 发布步骤

### 1. GitHub Actions 自动构建

- 推送标签 `v0.2.0` 后
- GitHub Actions 自动触发 `publish-release.yml` 工作流
- 等待构建完成（约 10-15 分钟）

### 2. GitHub Release 页面

- 发布完成后访问 Releases 页面
- 验证 MSI 和 EXE 文件已上传
- 检查文件大小和下载链接

### 3. 发布公告

- 在项目主页/社区发布新版本公告
- 列出主要变更
- 提供下载链接

---

## 发布后验证

### 用户下载和安装

- [ ] MSI 下载链接正常
- [ ] EXE 下载链接正常
- [ ] 安装包能在干净的 Windows 10/11 上成功安装
- [ ] 应用安装后能正常启动
- [ ] Gateway 能正常启动和运行
- [ ] 卸载流程完整

### 自动更新

- [ ] 应用能检测到新版本
- [ ] 自动下载更新正常
- [ ] 更新后应用版本号正确

### 反馈监控

- [ ] 监控 GitHub Issues 中的新问题
- [ ] 及时响应用户反馈
- [ ] 记录已知的 bug

---

## 常见问题

### Q: 如何跳过 GitHub Actions 自动发布？

A: 不推送标签，直接在本地构建：
```bash
npm run tauri build
```

### Q: 如何撤销已发布的版本？

A: 删除标签和 Release（谨慎操作）
```bash
# 删除本地标签
git tag -d v0.2.0

# 删除远程标签
git push origin --delete v0.2.0

# 在 GitHub 上删除 Release
```

### Q: 如何为预发布版本发布？

A: 使用预发布版本号和标签
```bash
git tag -a v0.2.0-beta.1 -m "Beta release"
git push origin --tags
```

### Q: MSI 文件太大怎么办？

A: 检查和优化
```bash
# 清理构建缓存
rm -rf dist src-tauri/target/release/bundle
cargo clean

# 重新构建（仅 Release）
npm run tauri build --release
```

---

## 版本历史

| 版本 | 发布日期 | 主要变更 |
|------|----------|---------|
| v0.1.0 | 2026-03-12 | 初始版本（M1-M6 完整实现） |
| v0.2.0 | TBD | Windows 完整支持 + bug 修复 |

---

## 联系方式

- 问题报告：GitHub Issues
- 功能建议：GitHub Discussions
- 安全问题：security@openclaw.dev

---

**最后更新**: 2026-03-12
**维护者**: OpenClaw 团队
