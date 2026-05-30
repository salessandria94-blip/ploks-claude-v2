import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Map, Users, List, Activity } from 'lucide-react'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/map', icon: Map, label: 'Map' },
  { to: '/leads', icon: List, label: 'Leads' },
  { to: '/reps', icon: Users, label: 'Reps' },
  { to: '/activity', icon: Activity, label: 'Activity' },
]

export default function AdminLayout() {
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
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-600 hidden md:block">
          Oak Valley Roofing
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
