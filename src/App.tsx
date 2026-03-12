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
import Agent from './pages/Agent'
import AgentConfig from './pages/AgentConfig'
import AgentRepair from './pages/AgentRepair'
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
          background: '#F2F2F7',
          color: '#636366',
          fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
          fontSize: 15,
        }}
      >
        正在检测...
      </div>
    )
  }

  return (
    <>
      <style>{`
:root {
  /* iOS System Colors */
  --accent:          #007AFF;
  --accent-hover:    #0062CC;
  --bg:              #F2F2F7;
  --card:            #FFFFFF;
  --bg-card:         #FFFFFF;
  --text:            #000000;
  --text-primary:    #000000;
  --text-secondary:  #636366;
  --text-muted:      #AEAEB2;
  --border:          rgba(60,60,67,0.18);
  --separator:       rgba(60,60,67,0.12);
  --success:         #34C759;
  --warning:         #FF9500;
  --error:           #FF3B30;
  --shadow:          0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
}

html, body, #root {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }

button { font-family: inherit; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(60,60,67,0.2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(60,60,67,0.35); }
`}</style>

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
          <Route path="/agent" element={<Agent />} />
          <Route path="/agent-config" element={<AgentConfig />} />
          <Route path="/agent-repair" element={<AgentRepair />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
