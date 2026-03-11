# OpenClaw 安装器 项目文档索引

## 项目概述

跨平台桌面安装工具，帮助小白用户一键安装/修复/卸载 OpenClaw。
目标平台：Windows (.exe/.msi)、macOS (.dmg)、Linux (.AppImage/.deb)
技术栈：Tauri 2.x + React 19 + TypeScript + Tailwind CSS + Rust

## 里程碑文档

| 里程碑 | 目标 | 文档 | 状态 |
|--------|------|------|------|
| M1 | 项目搭建 + macOS 完整安装流程 | [M1.md](milestones/M1.md) | 🔄 进行中 |
| M2 | Dashboard + 监控 + 修复 | [M2.md](milestones/M2.md) | ✅ 完成（2026-03-11） |
| M3 | Linux 支持 | [M3.md](milestones/M3.md) | ⏳ 待开始 |
| M4 | Windows 支持 | [M4.md](milestones/M4.md) | ⏳ 待开始 |
| M5 | 更新 + 卸载 + 自更新 | [M5.md](milestones/M5.md) | ⏳ 待开始 |
| M6 | 打磨 + CI/CD + 发布 | [M6.md](milestones/M6.md) | ⏳ 待开始 |

## 关键规范

- 窗口尺寸：860 × 640，不可缩放
- 设计风格：OpenClaw 暖棕色系（`--accent: #c94b1d`, `--bg: #f3efe7`）
- 安装方式：用户级 Node.js（无需 sudo/管理员，Windows 例外）
- 配置文件：`~/.openclaw/openclaw.json`（写入前自动 .bak 备份）

## 快速开始（开发）

```bash
cd /Users/openclawcn/openclaw-anzhuang
npm install
npm run tauri dev
```

## 构建发布

```bash
# macOS（当前机器）
npm run tauri build
# 产物：src-tauri/target/release/bundle/macos/OpenClaw 安装器.dmg
```
