# Agent 1（Config/Frontend）— M3 Linux 支持：前端契约 + 脚本选择

目标：为 M3 定义并落地「Linux 平台/发行版」的 IPC 契约与前端行为；在安装页自动选择正确脚本。

## 重要约束

- 只允许修改下面「允许修改的文件」列表中的文件；不要改任何其它文件（包括格式化其它文件、重排 import、顺手改文案等）。
- 若发现必须改其它文件才能完成任务：停止并在终端说明原因与建议改法。

## 允许修改的文件

- `src/types/ipc.ts`
- `src/pages/Welcome.tsx`
- `src/pages/Installing.tsx`
- `src/pages/Dashboard.tsx`

## 任务清单（按顺序做）

### 1) 扩展 IPC 类型（SystemInfo）

在 `src/types/ipc.ts` 的 `SystemInfo` 里新增（可选字段，避免后端未合入前阻塞开发）：

- `platform?: string`：后端将返回 `macos` / `linux` / `windows`
- `linux_distro?: string | null`：仅 Linux 下有值，期望为 `ubuntu` / `debian` / `raspbian` / `unknown`

并把注释写清楚：**这两个字段为 M3 新增**，用于脚本选择/展示。

同时把 `GatewayDetailedStatus.launchagent_loaded` 的注释更新为更通用的描述：
- macOS：LaunchAgent 是否加载
- Linux：systemd user service 是否启用（后端会复用这个字段）

### 2) Welcome 页：不要写死 “macOS”

在 `src/pages/Welcome.tsx`：

- OS 卡片标题不要写死 `macOS`，改成根据 `systemInfo.platform` 显示：
  - `macos` → 标题 `macOS`
  - `linux` → 标题 `Linux`
  - `windows` → 标题 `Windows`
  - 否则 → 标题 `系统`
- OS 卡片 value 仍用 `info.os_name`；如果是 Linux 且 `linux_distro` 有值，sub 显示 `linux_distro`（例如 `ubuntu`），否则保持原来的 arch 展示逻辑即可（不要引入新组件/复杂逻辑）。

### 3) Installing 页：自动选择脚本

在 `src/pages/Installing.tsx` 的 `run_install` 调用处，实现脚本选择：

- `macos` → `install-macos.sh`
- `linux` → `install-linux.sh`（由 Agent 3 新增脚本）
- `windows`/未知 → 给出明确错误提示（例如：`当前平台暂不支持一键安装`），不要继续 invoke。

要求：
- 选择逻辑必须基于 `useInstallStore().systemInfo`（若为空可先尝试 `invoke('get_system_info')`，但尽量避免大改；最少改动原则）。
- 不要删除现有日志/进度逻辑。

### 4) Dashboard 页：把 “LaunchAgent” 文案改成通用

在 `src/pages/Dashboard.tsx`：

- 把信息卡 label 从固定 `LaunchAgent` 改成更通用的 `自启服务`（避免 Linux 下显示误导文案）。
- 其它逻辑不动。

### 5) 自测

在项目根目录执行：

```bash
npx tsc --noEmit
```

确保无 TypeScript 错误。

## 交付要求

- 完成后在终端用 5 行以内总结你做了什么（含脚本名映射：macOS → `install-macos.sh`，Linux → `install-linux.sh`）。
