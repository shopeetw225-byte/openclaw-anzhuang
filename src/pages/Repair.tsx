import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useNavigate } from 'react-router-dom'
import type { DiagnosisItem, RepairResult } from '../types/ipc'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

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
}

export default function Repair() {
  const navigate = useNavigate()
  const [result, setResult] = useState<RepairResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'idle' | 'diagnosed' | 'fixed'>('idle')

  async function runDiagnosis() {
    setLoading(true)
    try {
      const r = isTauri
        ? await invoke<RepairResult>('run_diagnosis')
        : MOCK_DIAGNOSIS
      setResult(r)
      setMode('diagnosed')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function runAutoFix() {
    setLoading(true)
    try {
      const r = isTauri
        ? await invoke<RepairResult>('auto_fix')
        : { ...MOCK_DIAGNOSIS, fixed_count: 2, summary: '自动修复完成，修复了 2 项' }
      setResult(r)
      setMode('fixed')
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const hasFixable = result?.items.some(i => !i.passed && i.auto_fixable) ?? false

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-lg mx-auto">
        <div className="mb-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            ← 返回控制台
          </button>
        </div>
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
  )
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
  )
}
