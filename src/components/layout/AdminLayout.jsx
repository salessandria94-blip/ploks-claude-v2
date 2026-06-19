import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Map, Users, List, Activity, LogOut } from 'lucide-react'

// 4321 → Manager (bosses / Andrew / Alex)
// 9556 → Admin   (Stephen only — will gate PLOKS.ai here)
const MANAGER_PIN = '4321'
const ADMIN_PIN   = '9556'
const SESSION_KEY = 'ploks_admin_auth'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/leads', icon: List, label: 'Leads' },
  { to: '/reps', icon: Users, label: 'Reps' },
  { to: '/activity', icon: Activity, label: 'Activity' },
]

// ── PIN gate ───────────────────────────────────────────────────────────────────

function AdminLoginGate({ onAuth }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function pressKey(k) {
    if (k === 'del') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      if (next === MANAGER_PIN) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'manager' })) } catch {}
        onAuth('manager')
      } else if (next === ADMIN_PIN) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'admin' })) } catch {}
        onAuth('admin')
      } else {
        setError('Wrong PIN')
        setPin('')
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-5 p-6">
      <div className="text-blue-400 font-bold text-2xl tracking-wide">PLOKS</div>
      <div className="text-slate-500 text-sm">Enter PIN</div>

      <div className="flex gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-colors ${
            pin.length > i ? 'border-blue-500 bg-blue-900 text-white' : 'border-slate-700 bg-slate-900 text-slate-600'
          }`}>
            {pin.length > i ? '●' : ''}
          </div>
        ))}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-3 gap-3 w-56">
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => (
          <button
            key={i}
            onClick={() => k && pressKey(k)}
            disabled={!k}
            className={`h-14 rounded-xl text-lg font-semibold transition-colors
              ${k === 'del' ? 'bg-slate-700 text-slate-300 active:bg-slate-600'
              : k ? 'bg-slate-800 text-white active:bg-slate-700'
              : 'invisible'}`}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export default function AdminLayout() {
  const [role, setRole] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
      return stored.role || null
    } catch { return null }
  })

  function signOut() {
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    setRole(null)
  }

  if (!role) return <AdminLoginGate onAuth={r => setRole(r)} />

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar + page content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — hidden on mobile, visible md+ */}
        <aside className="hidden md:flex flex-col w-52 bg-slate-900 border-r border-slate-800 shrink-0">
          <div className="px-4 py-5 border-b border-slate-800">
            <span className="text-blue-400 font-bold text-lg tracking-wide">PLOKS</span>
          </div>
          <nav className="flex-1 py-4 space-y-1 px-2">
            {nav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  }`
                }
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="px-2 pb-3 border-t border-slate-800 pt-3">
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors w-full"
            >
              <LogOut size={18} />
              <span>Sign out</span>
            </button>
            <div className="px-1 pt-2 text-xs text-slate-700">Oak Valley Roofing</div>
          </div>
        </aside>

        {/* Page content — role passed via outlet context to all admin pages */}
        <main className="flex-1 overflow-auto">
          <Outlet context={{ role }} />
        </main>
      </div>

      {/* Mobile bottom nav — hidden md+ */}
      <nav className="md:hidden shrink-0 bg-slate-900 border-t border-slate-800">
        <div className="flex items-stretch">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-blue-400' : 'text-slate-500'
                }`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            onClick={signOut}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
          >
            <LogOut size={20} />
            <span>Out</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
