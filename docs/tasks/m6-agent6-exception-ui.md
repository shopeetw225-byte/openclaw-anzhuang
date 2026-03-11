# M6 Agent 6 任务：异常场景 UI 完善（断网 + 磁盘不足 + 权限提示）

## 你的角色
你负责让安装器在 **异常环境** 下给出友好提示，而不是静默失败或显示技术性错误信息。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/pages/Welcome.tsx`（追加磁盘空间检测警告卡片）
- `src/pages/Installing.tsx`（追加网络错误 / 权限错误友好提示转换）
- `docs/milestones/M6.md`（只在末尾追加你的日志区块）

## 工作规则
- 只追加/修改必要逻辑，不重构现有代码
- 浏览器预览模式（非 Tauri）不能崩溃，保持 Mock 数据回退
- UI 风格与现有页面一致（使用 CSS 变量）

---

## 任务 1：Welcome.tsx 追加磁盘空间警告

### 背景
`SystemInfo.disk_free_mb` 已存在（平台检测时填入）。如果磁盘剩余 < 2 GB，OpenClaw + Node.js 安装可能失败，应提前警告。

### 实现方式

在 Welcome.tsx 中找到系统信息卡片区域（当前显示 Node.js、OpenClaw 等状态的地方），在其**末尾**追加磁盘检测卡片。

先在文件顶部找到 `buildCards` 函数或渲染系统信息卡片的逻辑，在卡片数组末尾追加：

```tsx
// 磁盘空间卡片（追加到现有卡片数组末尾）
// 阈值：< 2048 MB (2 GB) 警告，< 512 MB 阻止安装
const diskFreeMb = info?.disk_free_mb ?? null

if (diskFreeMb !== null) {
  const diskTone: CardTone =
    diskFreeMb < 512 ? 'error' :
    diskFreeMb < 2048 ? 'warning' : 'success'

  const diskText =
    diskFreeMb >= 1024
      ? `${(diskFreeMb / 1024).toFixed(1)} GB`
      : `${diskFreeMb} MB`

  const diskSub =
    diskFreeMb < 512 ? '磁盘空间严重不足，安装将失败，请先清理磁盘' :
    diskFreeMb < 2048 ? '磁盘空间较少，建议先清理后再安装' : '空间充裕'

  cards.push({
    title: '磁盘剩余空间',
    tone: diskTone,
    value: diskText,
    sub: diskSub,
  })
}
```

> 注意：你需要先读取 Welcome.tsx 完整内容，找到 `cards` 数组的实际变量名和结构（可能叫 `cards`、`items`、`checks` 等），按实际情况追加。核心逻辑不变：
> - `disk_free_mb < 512` → tone: `'error'`，子文字"磁盘空间严重不足"
> - `disk_free_mb < 2048` → tone: `'warning'`，子文字"建议先清理"
> - 其余 → tone: `'success'`

同时在**"开始安装"按钮**附近，增加磁盘严重不足时的禁用逻辑：

找到"开始安装"按钮的 `disabled` prop（或添加 `disabled`），追加条件：

```tsx
// 磁盘 < 512 MB 时禁止安装
disabled={isInstalling || (info?.disk_free_mb !== undefined && info.disk_free_mb < 512)}
```

如果按钮旁边有错误文字区域，追加：

```tsx
{info?.disk_free_mb !== undefined && info.disk_free_mb < 512 && (
  <p className="text-sm mt-2" style={{ color: 'var(--error, #dc2626)' }}>
    磁盘剩余空间不足 512 MB，请先清理磁盘再安装。
  </p>
)}
```

---

## 任务 2：Installing.tsx 追加错误提示友好转换

### 背景
当前 `error` state 直接显示 Rust 返回的技术性错误字符串，用户无法理解。需要把常见错误翻译为友好文字。

### 实现方式

在 Installing.tsx 中找到 `setError(e instanceof Error ? e.message : '安装失败')` 这一行（在 `catch` 块里），**替换**为：

```tsx
} catch (e) {
  if (runIdRef.current === runId) {
    const raw = e instanceof Error ? e.message : String(e)
    setError(friendlyError(raw))
  }
}
```

在文件顶部（`isTauriRuntime` 函数下方）追加 `friendlyError` 辅助函数：

```tsx
/** 将 Rust 技术性错误信息转换为用户友好的中文提示 */
function friendlyError(raw: string): string {
  const msg = raw.toLowerCase()

  // 网络错误
  if (
    msg.includes('network') ||
    msg.includes('connection refused') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('dns') ||
    msg.includes('无法连接') ||
    msg.includes('network error')
  ) {
    return `网络连接失败：请检查网络后重试。\n（技术细节：${raw}）`
  }

  // 权限错误
  if (
    msg.includes('permission denied') ||
    msg.includes('access is denied') ||
    msg.includes('operation not permitted') ||
    msg.includes('权限不足') ||
    msg.includes('eacces') ||
    msg.includes('eperm')
  ) {
    return `权限不足：请以管理员身份运行，或检查安装目录权限。\n（技术细节：${raw}）`
  }

  // 磁盘空间
  if (
    msg.includes('no space left') ||
    msg.includes('disk full') ||
    msg.includes('enospc')
  ) {
    return `磁盘空间不足：请清理磁盘后重试（至少需要 2 GB 剩余空间）。\n（技术细节：${raw}）`
  }

  // WSL 未安装
  if (msg.includes('wsl') && (msg.includes('not found') || msg.includes('未检测到'))) {
    return 'WSL 未安装或不可用，请先手动安装 WSL2，或重启后再试。'
  }

  // npm 失败
  if (msg.includes('npm') && (msg.includes('failed') || msg.includes('error'))) {
    return `npm 安装失败：请检查网络连接和 npm 配置。\n（技术细节：${raw}）`
  }

  // 脚本未找到
  if (msg.includes('no such file') || msg.includes('找不到') || msg.includes('enoent')) {
    return `安装脚本未找到：请重新下载安装器。\n（技术细节：${raw}）`
  }

  // 默认：保留原始信息
  return raw || '安装失败，请查看日志获取详情。'
}
```

### 同时追加 WSL 重启提示优化

在 Installing.tsx 中找到：

```tsx
setError('WSL 安装完成，但仍未检测到可用的 WSL 环境；可能需要重启后继续。')
```

替换为：

```tsx
setError('WSL 安装完成，需要重启电脑才能继续。\n请重启后重新打开安装器，点击"重试"从断点继续安装。')
```

---

## 测试验证

```bash
cd /Users/openclawcn/openclaw-anzhuang
npx tsc --noEmit
```

同时人工确认：
- Welcome.tsx：搜索 `disk_free_mb` 确认逻辑追加正确
- Installing.tsx：搜索 `friendlyError` 确认函数存在

```bash
grep -n "disk_free_mb" src/pages/Welcome.tsx
grep -n "friendlyError" src/pages/Installing.tsx
```

成功标准：tsc 零错误，两个关键字均找到。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M6.md` 末尾追加：

```
---
## Agent 6 执行日志（异常场景 UI）

### 测试 [填入日期时间]
命令: npx tsc --noEmit && grep disk_free_mb/friendlyError 关键字验证
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: Welcome.tsx 追加磁盘空间检测卡片（<512MB 禁止安装/<2GB 警告）；Installing.tsx 追加 friendlyError() 转换网络/权限/磁盘/WSL/npm 五类错误为中文友好提示；WSL 重启提示优化
```
