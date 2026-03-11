import { create } from 'zustand'
import type { GatewayDetailedStatus, InstallLogPayload, SystemInfo } from '../types/ipc'

export type { InstallLogPayload, SystemInfo } from '../types/ipc'

interface InstallStore {
  systemInfo: SystemInfo | null
  setSystemInfo: (info: SystemInfo) => void
  logs: InstallLogPayload[]
  appendLog: (log: InstallLogPayload) => void
  clearLogs: () => void
  installProgress: number
  setProgress: (p: number) => void
  currentStep: string
  setCurrentStep: (s: string) => void
  gatewayDetailedStatus: GatewayDetailedStatus | null
  setGatewayDetailedStatus: (s: GatewayDetailedStatus | null) => void
}

export const useInstallStore = create<InstallStore>((set) => ({
  systemInfo: null,
  setSystemInfo: (info) => set({ systemInfo: info }),
  logs: [],
  appendLog: (log) =>
    set((s) => ({
      logs: [...s.logs, log],
      installProgress: log.percentage,
      currentStep: log.step,
    })),
  clearLogs: () => set({ logs: [], installProgress: 0 }),
  installProgress: 0,
  setProgress: (p) => set({ installProgress: p }),
  currentStep: '',
  setCurrentStep: (s) => set({ currentStep: s }),
  gatewayDetailedStatus: null,
  setGatewayDetailedStatus: (s) => set({ gatewayDetailedStatus: s }),
}))
