# M3 Agent 4 任务：前端 Linux 适配 + Bundle 配置

## 你的角色
你负责更新 Welcome.tsx（Linux UI 适配）、Installing.tsx（Linux 安装脚本选择）和 tauri.conf.json（Linux 打包配置）。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/pages/Welcome.tsx`（Linux UI 适配）
- `src/pages/Installing.tsx`（Linux 安装脚本选择）
- `src-tauri/tauri.conf.json`（追加 Linux bundle 配置）
- `docs/milestones/M3.md`（只在末尾追加你的日志区块）

## 工作规则
- 不修改其他文件
- Agent 1 会在 `ipc.ts` 的 `SystemInfo` 里追加 `distro_id` 和 `systemd_available` 字段
- 等待 Agent 1 完成后再运行 `npx tsc --noEmit`
- 如需记录执行日志：只能在 `docs/milestones/M3.md` **末尾追加** `## Agent 4 执行日志...` 区块，不改动既有内容

---

## 任务 1：更新 src/pages/Welcome.tsx

### 变更内容

Welcome.tsx 目前展示 6 张检测卡片（macOS 适配），需要：
1. 兼容 M3 新增字段（`distro_id`、`systemd_available`），避免 tsc 报错
2. Linux 下展示 systemd 可用性（替代 macOS 的 Homebrew 文案）

先读取当前 Welcome.tsx 文件，理解结构，然后做以下**最小改动**：

#### 改动 1：`MOCK_SYSTEM_INFO` 追加新字段（不改其他）

```typescript
const MOCK_SYSTEM_INFO: SystemInfo = {
  // ... 现有字段保持不变 ...
  distro_id: null,         // 追加
  systemd_available: false, // 追加
}
```

#### 改动 2：平台判断 + 动态卡片

在现有卡片数组里，把「磁盘空间」卡片的 `sub` 从固定 Homebrew 改为平台感知（macOS 显示 Homebrew；Linux 显示 systemd）：

```typescript
const isLinux = info?.distro_id !== null
const diskSub = isLinux
  ? `systemd：${info?.systemd_available ? '可用' : '不可用'}`
  : info?.homebrew_available
    ? 'Homebrew：可用'
    : 'Homebrew：不可用'
// 然后把「磁盘空间」卡片的 sub 改成 diskSub
```

> **注意**：Welcome.tsx 不负责执行安装脚本；脚本选择请在 Installing.tsx 完成（见任务 2）。

---

## 任务 2：更新 src/pages/Installing.tsx

### 目标

在调用 `invoke('run_install', ...)` 时，根据平台选择脚本：

- Linux（`systemInfo.distro_id !== null`）→ `install-linux.sh`
- macOS → `install-macos.sh`
- 其它平台 → 明确提示“暂不支持”，不要继续 invoke

### 最小改动建议

- `startInstall()` 里读取 `useInstallStore().systemInfo`（若为空可先 `invoke('get_system_info')` 再继续）
- 用 `distro_id` 判断 Linux；用 `os_name` 简单判断 macOS（例如包含 `macos`），其它情况直接 `setError(...)` 并 return
- 保持现有日志订阅/进度跳转逻辑不变

---

## 任务 3：更新 src-tauri/tauri.conf.json

在现有配置里追加 Linux bundle 目标（AppImage + deb）。

**先读取 tauri.conf.json 原文**，然后在 `bundle` 对象里追加 `linux` 配置：

```json
// 在 "bundle" 对象里追加：
"linux": {
  "deb": {
    "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0", "libayatana-appindicator3-1"]
  },
  "appimage": {
    "bundleMediaFramework": true
  }
}
```

> **注意**：tauri.conf.json 里已有 `"resources": ["../scripts/*"]`，不要覆盖这个字段；也不要为了这次任务改动现有 `targets` 的写法。只做追加修改。

---

## 测试验证

```bash
cd /Users/openclawcn/openclaw-anzhuang
npx tsc --noEmit
```

成功标准：TypeScript 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M3.md` 末尾追加：
```
---
## Agent 4 执行日志（前端 Linux 适配 + Bundle）

### 测试 [填入日期时间]
命令: npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: Welcome/Installing Linux 适配（脚本选择）、tauri.conf.json 追加 Linux bundle 配置，tsc 零错误
```
