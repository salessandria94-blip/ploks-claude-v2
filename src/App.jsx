import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/layout/AdminLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import LeadsPage from './pages/LeadsPage.jsx'
import MapPage from './pages/MapPage.jsx'
import RepsPage from './pages/RepsPage.jsx'
import ActivityPage from './pages/ActivityPage.jsx'
import RepWorkspace from './pages/RepWorkspace.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Field rep routes — no admin shell, full screen */}
        <Route path="/field" element={<RepWorkspace />} />
        <Route path="/field/:repSlug" element={<RepWorkspace />} />

        {/* Admin routes — with sidebar/shell */}
        <Route element={<AdminLayout />}>
          <Route path="/" element={<Dashboard />} />
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
