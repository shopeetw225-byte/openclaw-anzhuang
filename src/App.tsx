import { invoke } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Welcome from './pages/Welcome'
import Installing from './pages/Installing'
import ConfigWizard from './pages/ConfigWizard'
import Dashboard from './pages/Dashboard'
import Repair from './pages/Repair'
import Update from './pages/Update'
import Uninstall from './pages/Uninstall'
import type { OpenClawStatus } from './types/ipc'

function App() {
  const [initialRoute, setInitialRoute] = useState<string | null>(null)

  useEffect(() => {
    const isTauri =
      Boolean((window as any).__TAURI_INTERNALS__) || Boolean((window as any).__TAURI__)
    if (!isTauri) {
      setInitialRoute('/welcome')
      return
    }

    invoke<OpenClawStatus>('get_openclaw_status')
      .then((s) => setInitialRoute(s.installed ? '/dashboard' : '/welcome'))
      .catch(() => setInitialRoute('/welcome'))
  }, [])

  if (!initialRoute) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg,#f3efe7)',
          color: 'var(--text-secondary,#6b4c3b)',
        }}
      >
        正在检测...
      </div>
    )
  }

  return (
    <>
      <style>
        {`
:root {
  --accent: #c94b1d;
  --accent-hover: #a83c17;
  --bg: #f3efe7;
  --bg-card: #faf7f2;
  --text-primary: #2c1810;
  --text-secondary: #6b4c3b;
  --border: #d4c5b5;
  --success: #2d7a4f;
  --warning: #b45309;
  --error: #dc2626;
}
html, body, #root { height: 100%; }
body { margin: 0; background: var(--bg); color: var(--text-primary); }
* { box-sizing: border-box; }
`}
      </style>

      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={initialRoute} replace />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/installing" element={<Installing />} />
          <Route path="/config-wizard" element={<ConfigWizard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/repair" element={<Repair />} />
          <Route path="/update" element={<Update />} />
          <Route path="/uninstall" element={<Uninstall />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
