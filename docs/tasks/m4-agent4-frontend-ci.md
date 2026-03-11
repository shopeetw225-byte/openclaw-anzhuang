# M4 Agent 4 任务：前端 Windows 安装流程 + Tauri Bundle/资源 + Windows CI

## 你的角色
你负责把 M4 的 Windows 支持落到用户可操作的 GUI 上，并补齐 Windows 打包 CI。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/pages/Welcome.tsx`
- `src/pages/Installing.tsx`
- `src-tauri/tauri.conf.json`
- `.github/workflows/m4-windows.yml`（新建）
- `docs/milestones/M4.md`（只在末尾追加你的日志区块）

## 工作规则
- 不修改其他文件
- 等 Agent 1 完成 `SystemInfo` 新字段后再跑 `npx tsc --noEmit`
- 默认仍兼容 macOS/Linux 安装流程（不要破坏现有路径）

---

## 任务 1：Welcome.tsx 增加 Windows 关键信息展示（最小改动）

在 `src/pages/Welcome.tsx`：

### 1-1) 识别 Windows

- 以 `systemInfo.wsl_state !== null` 作为“Windows 环境”的判据（Agent 1 会填充；非 Windows 为 null）

### 1-2) 在页面底部 hint 区域补充一行 Windows 提示（不新增复杂组件）

当检测为 Windows 时，显示类似：
- `WSL：available / needs_install / unsupported`
- `管理员权限：是/否`（来自 `systemInfo.windows_admin`）

> 不要求新增卡片；做到用户一眼能看到 Windows 关键状态即可。

---

## 任务 2：Installing.tsx 支持 Windows 安装编排（保持现有日志面板）

在 `src/pages/Installing.tsx`：

### 2-1) 脚本清单（由 SystemInfo 决策）

规则建议（MVP）：

- Linux（`systemInfo.distro_id !== null`）→ 运行 `install-linux.sh`
- macOS（其余且 `wsl_state === null`）→ 运行 `install-macos.sh`
- Windows（`wsl_state !== null`）：
  - `wsl_state === "available"` → 运行 `install-linux.sh`（后端会在 Windows 下用 WSL 执行 bash）
  - `wsl_state === "needs_install"` → 先运行 `windows/install-wsl.ps1`，结束后重新拉一次 `get_system_info`：
    - 若变成 `available` → 再运行 `install-linux.sh`
    - 否则 → 提示“可能需要重启后继续”，停止后续步骤
  - `wsl_state === "unsupported"` → 走原生路径：依次运行
    - `windows/install-node-windows.ps1`
    - `windows/install-openclaw.ps1`
    - `windows/install-nssm.ps1`
    - `windows/register-service-nssm.ps1`

> 注意：`run_install` 允许传 `windows/...` 子路径（由 Agent 2 放宽校验）。

### 2-2) 避免“第一段脚本到 100% 就自动跳配置向导”

当前 Installing.tsx 的逻辑是 `progress>=100` 自动跳 `/config-wizard`。
改为：
- 只有当 **所有脚本步骤**执行完成后才跳转
- 中间步骤完成（单个脚本 100%）不跳转

实现建议（不改 store）：
- 在 Installing.tsx 里维护本地状态：
  - `plan: string[]`
  - `currentIndex`
  - `finalDone`
- 逐个 `await invoke('run_install', { scriptName })`

### 2-3) 出错提示

任何一步出错：
- `setError(...)` 显示错误
- 允许用户点击“重试”（从当前步骤重新执行即可；无需复杂断点续跑）

---

## 任务 3：tauri.conf.json 打包资源包含 Windows 脚本

在 `src-tauri/tauri.conf.json`：

- 在 `bundle.resources` 数组里 **追加** 一项：
  - `../scripts/windows/*`

要求：
- 不覆盖已有 `../scripts/*`
- 其他字段尽量不动（最小改动）

---

## 任务 4：新增 Windows 构建 CI（msi + nsis）

新增 `.github/workflows/m4-windows.yml`：

要求：
- 触发：`workflow_dispatch` + `push`
- runner：`windows-latest`
- 步骤（最小可用）：
  1. checkout
  2. setup Node（建议 22）
  3. setup Rust stable
  4. `npm ci`
  5. `npm run tauri build -- --bundles nsis,msi`
  6. upload artifact：`src-tauri/target/release/bundle/**`

> 代码签名本 milestone 可暂缓：不加 signing steps。

---

## 测试验证（在 macOS 上）

```bash
cd /Users/openclawcn/openclaw-anzhuang
npx tsc --noEmit
```

成功标准：TypeScript 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M4.md` 末尾追加：

```
---
## Agent 4 执行日志（Windows 前端流程 + CI）

### 测试 [填入日期时间]
命令: npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: Welcome/Installing 增加 Windows 流程；tauri.conf.json 打包 windows 脚本；新增 Windows CI
```

