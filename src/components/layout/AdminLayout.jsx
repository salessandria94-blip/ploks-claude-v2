import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Map, Users, List, Activity, LogOut } from 'lucide-react'

const ADMIN_PIN = '4321'
const ADMIN_SESSION_KEY = 'ploks_admin_auth'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/leads', icon: List, label: 'Leads' },
  { to: '/reps', icon: Users, label: 'Reps' },
  { to: '/activity', icon: Activity, label: 'Activity' },
]

// ── Admin PIN gate ─────────────────────────────────────────────────────────────

function AdminLoginGate({ onAuth }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function pressKey(k) {
    if (k === 'del') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      if (next === ADMIN_PIN) {
        try { localStorage.setItem(ADMIN_SESSION_KEY, 'true') } catch {}
        onAuth()
      } else {
        setError('Wrong PIN')
        setPin('')
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-5 p-6">
      <div className="text-blue-400 font-bold text-2xl tracking-wide">PLOKS</div>
      <div className="text-slate-500 text-sm">Admin access</div>

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
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem(ADMIN_SESSION_KEY) === 'true' } catch { return false }
  })

  function signOut() {
    try { localStorage.removeItem(ADMIN_SESSION_KEY) } catch {}
    setAuthed(false)
  }

  if (!authed) return <AdminLoginGate onAuth={() => setAuthed(true)} />

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="w-16 md:w-52 flex flex-col bg-slate-900 border-r border-slate-800 shrink-0">
        <div className="px-4 py-5 border-b border-slate-800">
          <span className="hidden md:block text-blue-400 font-bold text-lg tracking-wide">PLOKS</span>
          <span className="md:hidden text-blue-400 font-bold text-lg">P</span>
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
              <span className="hidden md:block">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-2 pb-3 border-t border-slate-800 pt-3">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors w-full"
          >
            <LogOut size={18} />
            <span className="hidden md:block">Sign out</span>
          </button>
          <div className="px-1 pt-2 text-xs text-slate-700 hidden md:block">Oak Valley Roofing</div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
