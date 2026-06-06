import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LeadsPage from './pages/LeadsPage.jsx'
import MapPage from './pages/MapPage.jsx'
import RepsPage from './pages/RepsPage.jsx'
import ActivityPage from './pages/ActivityPage.jsx'
import RepWorkspace from './pages/RepWorkspace.jsx'

// If a rep session is stored (PWA launched from /), send them to their workspace.
function RootRoute() {
  try {
    const rep = JSON.parse(localStorage.getItem('ploks_rep_v2') || 'null')
    if (rep?.slug) return <Navigate to={`/field/${rep.slug}`} replace />
  } catch {}
  return <Dashboard />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Field rep routes — no admin shell, full screen */}
        <Route path="/field" element={<RepWorkspace />} />
        <Route path="/field/:repSlug" element={<RepWorkspace />} />

        {/* Admin routes — with sidebar/shell */}
        <Route element={<AdminLayout />}>
          <Route path="/" element={<RootRoute />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/reps" element={<RepsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
