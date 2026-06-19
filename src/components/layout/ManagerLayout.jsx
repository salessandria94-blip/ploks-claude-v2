import { useState } from 'react'
import { Outlet, NavLink, Navigate } from 'react-router-dom'
import { LayoutDashboard, Map, Users, List, Activity, LogOut } from 'lucide-react'

// Manager layout — Andrew Blackwell & Alex Sajonz
// Separate from AdminLayout; changes here never touch the admin view.
// Authenticated via rep portal (slug + PIN 4321, is_manager=true).

const SESSION_KEY = 'ploks_manager_auth'

const nav = [
  { to: '/manager',          icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/manager/map',      icon: Map,             label: 'Map'                  },
  { to: '/manager/leads',    icon: List,            label: 'Leads'                },
  { to: '/manager/reps',     icon: Users,           label: 'Reps'                 },
  { to: '/manager/activity', icon: Activity,        label: 'Activity'             },
]

export default function ManagerLayout() {
  const [authed, setAuthed] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) || '{}')
      return !!stored.rep
    } catch { return false }
  })

  function signOut() {
    try { localStorage.removeItem(SESSION_KEY) } catch {}
    setAuthed(false)
    // next render hits the Navigate below → back to rep portal
  }

  if (!authed) return <Navigate to="/field" replace />

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Desktop sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden md:flex flex-col w-52 bg-slate-900 border-r border-slate-800 shrink-0">
          <div className="px-4 py-5 border-b border-slate-800">
            <span className="text-blue-400 font-bold text-lg tracking-wide">PLOKS</span>
          </div>
          <nav className="flex-1 py-4 space-y-1 px-2">
            {nav.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={!!end}
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

        {/* role='manager' flows into every page via outlet context */}
        <main className="flex-1 overflow-auto">
          <Outlet context={{ role: 'manager' }} />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden shrink-0 bg-slate-900 border-t border-slate-800">
        <div className="flex items-stretch">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={!!end}
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
