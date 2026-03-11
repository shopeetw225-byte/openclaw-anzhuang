# M2 Agent 4 任务：前端页面（Dashboard + Repair）

## 你的角色
你负责实现 Dashboard（服务监控）页面、Repair（诊断修复）页面，以及共用的 StatusBadge 组件。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src/pages/Dashboard.tsx`（替换 M1 占位符）
- `src/pages/Repair.tsx`（新建）
- `src/components/StatusBadge.tsx`（新建）

## 工作规则
- 不修改 App.tsx、stores/、hooks/、types/ipc.ts 等文件（由 M2 Agent 1 负责）
- 使用 `import { invoke } from '@tauri-apps/api/core'` 调用 Rust 命令
- 浏览器预览时（非 Tauri 环境）用 mock 数据，检测方式：
  ```ts
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  ```
- 样式用 Tailwind CSS 类名（已配置好）
- 不使用任何额外 npm 包

---

## 执行顺序说明

> ⚠️ **重要**：本任务依赖 Agent 1 完成对 `src/types/ipc.ts` 的扩展。
> - **先等 Agent 1 完成**，再运行 `npx tsc --noEmit` 验证。
> - 写代码时可以直接照 IPC 类型参考（下方）进行，不用等 Agent 1。
> - 如果 Agent 1 还没跑完，tsc 会报找不到类型——这是正常的，等 Agent 1 跑完后再 tsc 即可。

---

## IPC 类型参考（src/types/ipc.ts 中已有）

```typescript
export interface GatewayDetailedStatus {
  installed: boolean;
  version: string | null;
  gateway_running: boolean;
  gateway_port: number;
  gateway_pid: number | null;
  uptime_seconds: number | null;
  launchagent_loaded: boolean;
}

export interface LogEntry {
  line: string;
}

export interface DiagnosisItem {
  check_name: string;
  passed: boolean;
  message: string;
  auto_fixable: boolean;
}

export interface RepairResult {
  fixed_count: number;
  items: DiagnosisItem[];
  summary: string;
}
```

---

## 任务 1：src/components/StatusBadge.tsx

运行状态徽章组件，三种状态：running（绿色脉冲）、stopped（红色）、unknown（灰色）。

```tsx
type Status = 'running' | 'stopped' | 'unknown';

interface StatusBadgeProps {
  status: Status;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const configs = {
    running: {
      dot: 'bg-green-500',
      pulse: 'animate-ping bg-green-400',
      text: 'text-green-400',
      defaultLabel: '运行中',
    },
    stopped: {
      dot: 'bg-red-500',
      pulse: '',
      text: 'text-red-400',
      defaultLabel: '已停止',
    },
    unknown: {
      dot: 'bg-gray-500',
      pulse: '',
      text: 'text-gray-400',
      defaultLabel: '未知',
    },
  };

  const cfg = configs[status];
  const displayLabel = label ?? cfg.defaultLabel;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {cfg.pulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.pulse}`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
      </span>
      <span className={`text-sm font-medium ${cfg.text}`}>{displayLabel}</span>
    </span>
  );
}
```

---

## 任务 2：src/pages/Dashboard.tsx

替换 M1 的占位符，实现完整的服务监控页面。

**布局结构**：
1. 顶部标题栏 + 刷新按钮
2. 主状态卡片（Gateway 大状态 + 控制按钮）
3. 详细信息网格（4 个小卡片）
4. 日志面板（最近 50 行）

完整实现：

```tsx
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StatusBadge } from '../components/StatusBadge';
import type { GatewayDetailedStatus, LogEntry } from '../types/ipc';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const MOCK_STATUS: GatewayDetailedStatus = {
  installed: true,
  version: '1.2.3',
  gateway_running: true,
  gateway_port: 18789,
  gateway_pid: 12345,
  uptime_seconds: 3661,
  launchagent_loaded: true,
};

const MOCK_LOGS: LogEntry[] = Array.from({ length: 10 }, (_, i) => ({
  line: `[INFO] Gateway 运行正常 (模拟日志 #${i + 1})`,
}));

function formatUptime(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Dashboard() {
  const [status, setStatus] = useState<GatewayDetailedStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const fetchStatus = useCallback(async () => {
    if (!isTauri) {
      setStatus(MOCK_STATUS);
      setLogs(MOCK_LOGS);
      return;
    }
    try {
      const [s, l] = await Promise.all([
        invoke<GatewayDetailedStatus>('get_detailed_status'),
        invoke<LogEntry[]>('read_logs', { lines: 50 }),
      ]);
      setStatus(s);
      setLogs(l);
    } catch (e) {
      console.error('获取状态失败', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  async function handleAction(action: 'start_gateway' | 'stop_gateway' | 'restart_gateway') {
    setLoading(true);
    setActionMsg('');
    try {
      await invoke(action);
      setActionMsg(action === 'start_gateway' ? '启动成功' : action === 'stop_gateway' ? '已停止' : '重启成功');
      await fetchStatus();
    } catch (e) {
      setActionMsg(`操作失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  const gatewayStatus = status?.gateway_running ? 'running' : 'stopped';

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">OpenClaw 控制台</h1>
          {status?.version && (
            <p className="text-sm text-gray-400 mt-0.5">版本 {status.version}</p>
          )}
        </div>
        <button
          onClick={fetchStatus}
          className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          刷新
        </button>
      </div>

      {/* 主状态卡片 */}
      <div className="bg-gray-900 rounded-xl p-5 mb-4 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <StatusBadge status={gatewayStatus} />
            <span className="text-lg font-semibold">Gateway</span>
          </div>
          {status?.gateway_pid && (
            <span className="text-xs text-gray-500">PID {status.gateway_pid}</span>
          )}
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-2">
          <button
            onClick={() => handleAction('start_gateway')}
            disabled={loading || status?.gateway_running}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            启动
          </button>
          <button
            onClick={() => handleAction('stop_gateway')}
            disabled={loading || !status?.gateway_running}
            className="px-4 py-2 bg-red-800 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            停止
          </button>
          <button
            onClick={() => handleAction('restart_gateway')}
            disabled={loading}
            className="px-4 py-2 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            重启
          </button>
        </div>

        {actionMsg && (
          <p className="mt-2 text-sm text-orange-300">{actionMsg}</p>
        )}
      </div>

      {/* 详细信息网格 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <InfoCard label="端口" value={status ? String(status.gateway_port) : '—'} />
        <InfoCard label="运行时长" value={formatUptime(status?.uptime_seconds ?? null)} />
        <InfoCard
          label="LaunchAgent"
          value={status?.launchagent_loaded ? '已加载' : '未加载'}
          valueColor={status?.launchagent_loaded ? 'text-green-400' : 'text-red-400'}
        />
        <InfoCard
          label="安装状态"
          value={status?.installed ? '已安装' : '未安装'}
          valueColor={status?.installed ? 'text-green-400' : 'text-red-400'}
        />
      </div>

      {/* 日志面板 */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
          <span className="text-sm font-medium text-gray-300">错误日志（最近 50 行）</span>
          <span className="text-xs text-gray-500">{logs.length} 行</span>
        </div>
        <div
          className="h-48 overflow-y-auto p-3 font-mono text-xs text-green-400 space-y-0.5"
          style={{ background: '#0f0f0f' }}
        >
          {logs.length === 0 ? (
            <p className="text-gray-600">暂无日志</p>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="leading-5 whitespace-pre-wrap break-all">
                {entry.line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  label,
  value,
  valueColor = 'text-white',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}
```

---

## 任务 3：src/pages/Repair.tsx

诊断 + 自动修复页面。

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { DiagnosisItem, RepairResult } from '../types/ipc';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const MOCK_DIAGNOSIS: RepairResult = {
  fixed_count: 0,
  summary: '2 项检测未通过',
  items: [
    { check_name: 'OpenClaw 安装', passed: true, message: 'openclaw 命令可用', auto_fixable: false },
    { check_name: '端口 18789', passed: false, message: '端口 18789 未监听', auto_fixable: true },
    { check_name: 'LaunchAgent', passed: false, message: 'LaunchAgent 未加载', auto_fixable: true },
    { check_name: '配置文件', passed: true, message: 'openclaw.json 格式正确', auto_fixable: false },
    { check_name: '错误日志', passed: true, message: '最近日志无严重错误', auto_fixable: false },
  ],
};

export default function Repair() {
  const [result, setResult] = useState<RepairResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'idle' | 'diagnosed' | 'fixed'>('idle');

  async function runDiagnosis() {
    setLoading(true);
    try {
      const r = isTauri
        ? await invoke<RepairResult>('run_diagnosis')
        : MOCK_DIAGNOSIS;
      setResult(r);
      setMode('diagnosed');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function runAutoFix() {
    setLoading(true);
    try {
      const r = isTauri
        ? await invoke<RepairResult>('auto_fix')
        : { ...MOCK_DIAGNOSIS, fixed_count: 2, summary: '自动修复完成，修复了 2 项' };
      setResult(r);
      setMode('fixed');
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const hasFixable = result?.items.some(i => !i.passed && i.auto_fixable) ?? false;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">诊断与修复</h1>
        <p className="text-sm text-gray-400 mb-6">
          检测 OpenClaw 运行环境，自动修复常见问题
        </p>

        {/* 操作按钮 */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={runDiagnosis}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded-lg font-medium transition-colors"
          >
            {loading && mode === 'idle' ? '检测中…' : '开始诊断'}
          </button>
          {mode === 'diagnosed' && hasFixable && (
            <button
              onClick={runAutoFix}
              disabled={loading}
              className="flex-1 py-2.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-40 rounded-lg font-medium transition-colors"
            >
              {loading ? '修复中…' : '一键修复'}
            </button>
          )}
        </div>

        {/* 汇总信息 */}
        {result && (
          <div className={`rounded-lg px-4 py-3 mb-4 text-sm font-medium ${
            mode === 'fixed'
              ? 'bg-green-900/40 text-green-300 border border-green-800'
              : result.items.every(i => i.passed)
              ? 'bg-green-900/40 text-green-300 border border-green-800'
              : 'bg-orange-900/40 text-orange-300 border border-orange-800'
          }`}>
            {result.summary}
            {mode === 'fixed' && result.fixed_count > 0 && (
              <span className="ml-1">（已修复 {result.fixed_count} 项）</span>
            )}
          </div>
        )}

        {/* 诊断列表 */}
        {result && (
          <div className="space-y-2">
            {result.items.map((item, i) => (
              <DiagnosisCard key={i} item={item} />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!result && !loading && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-4xl mb-3">🔍</p>
            <p>点击「开始诊断」检测运行环境</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagnosisCard({ item }: { item: DiagnosisItem }) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${
      item.passed
        ? 'bg-gray-900 border-gray-800'
        : 'bg-red-950/30 border-red-900/50'
    }`}>
      <span className={`mt-0.5 text-lg leading-none ${item.passed ? 'text-green-400' : 'text-red-400'}`}>
        {item.passed ? '✓' : '✗'}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.passed ? 'text-gray-200' : 'text-red-300'}`}>
          {item.check_name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{item.message}</p>
      </div>
      {!item.passed && item.auto_fixable && (
        <span className="text-xs px-1.5 py-0.5 bg-orange-900/50 text-orange-400 rounded border border-orange-800/50 whitespace-nowrap">
          可自动修复
        </span>
      )}
    </div>
  );
}
```

---

## 测试验证

```bash
cd /Users/openclawcn/openclaw-anzhuang
npx tsc --noEmit
```

成功标准：TypeScript 零错误。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M2.md` 末尾追加：
```
---
## Agent 4 执行日志（前端页面）

### 测试 [填入日期时间]
命令: npx tsc --noEmit
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: Dashboard.tsx / Repair.tsx / StatusBadge.tsx 全部实现，TypeScript 零错误
```
