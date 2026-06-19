import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp, Calendar, Navigation } from 'lucide-react'
import { getDashboardStats, getRecentActivity, getAppointmentsForAdmin, getRepLocations } from '../api/sheets.js'

// ── Universal PLOKS color system ───────────────────────────────────────────────
const PLOKS_COLORS = {
  no_contact: '#22c55e',
  contacted:  '#f59e0b',
  working:    '#a855f7',
  follow_up:  '#ef4444',
  closed:     '#6b7280',
  open:       '#475569',
}

// Market Overview rows
const STATUS_CONFIG = [
  { key: 'open',      label: 'Open',       color: PLOKS_COLORS.open       },
  { key: 'claimed',   label: 'No Contact', color: PLOKS_COLORS.no_contact },
  { key: 'contacted', label: 'Contacted',  color: PLOKS_COLORS.contacted  },
  { key: 'follow_up', label: 'Follow Up',  color: PLOKS_COLORS.follow_up  },
  { key: 'working',   label: 'Working',    color: PLOKS_COLORS.working    },
  { key: 'closed',    label: 'Closed',     color: PLOKS_COLORS.closed     },
]

// Rep card Apple-style bar segments (ordered visually)
const REP_SEGMENTS = [
  { key: 'claimed',   label: 'No Contact', color: PLOKS_COLORS.no_contact },
  { key: 'contacted', label: 'Contacted',  color: PLOKS_COLORS.contacted  },
  { key: 'working',   label: 'Working',    color: PLOKS_COLORS.working    },
  { key: 'follow_up', label: 'Follow Up',  color: PLOKS_COLORS.follow_up  },
  { key: 'closed',    label: 'Closed',     color: PLOKS_COLORS.closed     },
]

// ZIP leaderboard bar segments
const ZIP_SEGMENTS = [
  { key: 'contacted', color: PLOKS_COLORS.contacted, label: 'Contacted' },
  { key: 'working',   color: PLOKS_COLORS.working,   label: 'Working'   },
  { key: 'follow_up', color: PLOKS_COLORS.follow_up, label: 'Follow Up' },
  { key: 'closed',    color: PLOKS_COLORS.closed,    label: 'Closed'    },
]

const ACTION_LABELS = {
  claim:         'Claimed',
  bulk_claim:    'Bulk claimed',
  unassign:      'Released',
  bulk_unassign: 'Bulk released',
  admin_assign:  'Admin assigned',
  status_update: 'Status →',
  note:          'Note added',
  edit:          'Lead edited',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatRow({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-14 text-right text-xs font-mono font-semibold" style={{ color }}>
        {count.toLocaleString()}
      </span>
      <span className="w-8 text-right text-xs text-slate-500">{pct}%</span>
    </div>
  )
}

function MarketOverviewCard({ totals }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-slate-100 font-semibold text-sm uppercase tracking-wider">Market Overview</h2>
        <span className="text-3xl font-bold text-slate-100">{totals.total.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {STATUS_CONFIG.map(s => (
          <StatRow
            key={s.key}
            label={s.label}
            count={totals[s.key] || 0}
            total={totals.total}
            color={s.color}
          />
        ))}
      </div>
    </div>
  )
}

function RepCard({ rep, isOnline }) {
  const total = (rep.claimed || 0) + (rep.contacted || 0) + (rep.follow_up || 0) + (rep.working || 0) + (rep.closed || 0)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-slate-100 font-semibold">{rep.name}</span>
        {/* Live status indicator */}
        <div className="flex items-center gap-1.5">
          {isOnline ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <Navigation size={12} className="text-green-400 fill-green-400" />
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-600" />
              </span>
              <Navigation size={12} className="text-slate-600 fill-slate-600" />
            </>
          )}
        </div>
      </div>

      {/* Segmented bar — proportional to rep's own total, no cap */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-slate-400">{total.toLocaleString()} leads</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800 w-full">
          {REP_SEGMENTS.map(s => {
            const pct = total > 0 ? ((rep[s.key] || 0) / total) * 100 : 0
            if (pct <= 0) return null
            return (
              <div
                key={s.key}
                style={{ width: `${pct}%`, background: s.color }}
                title={`${s.label}: ${rep[s.key] || 0}`}
              />
            )
          })}
        </div>
      </div>

      {/* Status breakdown grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
        {[
          { label: 'Contacted', value: rep.contacted || 0, color: PLOKS_COLORS.contacted },
          { label: 'Working',   value: rep.working   || 0, color: PLOKS_COLORS.working   },
          { label: 'Follow Up', value: rep.follow_up || 0, color: PLOKS_COLORS.follow_up },
          { label: 'Closed',    value: rep.closed    || 0, color: PLOKS_COLORS.closed    },
        ].map(s => (
          <div key={s.label} className="flex justify-between items-center">
            <span className="text-xs text-slate-500">{s.label}</span>
            <span className="text-xs font-mono font-semibold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const TOP = 5

function ZipSegmentBar({ z }) {
  const total = z.total || 1
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden w-full bg-slate-700">
      {ZIP_SEGMENTS.map(s => {
        const pct = (z[s.key] / total) * 100
        if (pct <= 0) return null
        return (
          <div
            key={s.key}
            style={{ width: `${pct}%`, background: s.color }}
            title={`${s.label}: ${z[s.key]}`}
          />
        )
      })}
      {/* remainder — open/unclaimed */}
      <div className="flex-1 bg-slate-600" title="Open / Unclaimed" />
    </div>
  )
}

function ZipLeaderboardCard({ zipStats }) {
  const [showAll,   setShowAll]   = useState(false)
  const [activeZip, setActiveZip] = useState(null)

  const visible = showAll ? zipStats : zipStats.slice(0, TOP)

  function toggleZip(zip) {
    setActiveZip(a => a === zip ? null : zip)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">

      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-slate-100 font-semibold text-sm uppercase tracking-wider">
          Top ZIPs by Activity
        </h2>
        <span className="text-xs text-slate-500">{zipStats.length} ZIPs</span>
      </div>

      <div className="px-5 pb-5">
        <div className="flex flex-col gap-1.5">
          {visible.map((z, i) => {
            const isActive = activeZip === z.zip
            const openCount = z.total - z.contacted - z.follow_up - z.working - z.closed
            return (
              <div
                key={z.zip}
                onClick={() => toggleZip(z.zip)}
                className={`rounded-lg px-3 py-2.5 cursor-pointer border transition-all ${
                  isActive
                    ? 'border-blue-500 bg-slate-800'
                    : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-xs text-slate-500 w-4 shrink-0 text-right">{i + 1}</span>
                  <span className="text-sm font-mono font-semibold text-slate-200 w-12 shrink-0">{z.zip}</span>
                  <span className="text-xs text-slate-500 ml-auto">{z.total.toLocaleString()} leads</span>
                </div>

                <ZipSegmentBar z={z} />

                {isActive && (
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 pt-2.5 border-t border-slate-700">
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-500">Open</span>
                      <span className="text-xs font-mono font-semibold text-slate-400">{openCount.toLocaleString()}</span>
                    </div>
                    {ZIP_SEGMENTS.map(s => (
                      <div key={s.key} className="flex justify-between">
                        <span className="text-xs text-slate-500">{s.label}</span>
                        <span className="text-xs font-mono font-semibold" style={{ color: s.color }}>
                          {z[s.key].toLocaleString()}
                        </span>
                      </div>
                    ))}
                    <div className="col-span-2 flex justify-between border-t border-slate-700 pt-1.5 mt-0.5">
                      <span className="text-xs text-slate-400 font-medium">Total</span>
                      <span className="text-xs font-mono font-semibold text-slate-300">{z.total.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer: legend + show all toggle */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            {ZIP_SEGMENTS.map(s => (
              <span key={s.key} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-slate-600" />
              Open
            </span>
          </div>
          {zipStats.length > TOP && (
            <button
              onClick={e => { e.stopPropagation(); setShowAll(a => !a) }}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0 ml-3"
            >
              {showAll
                ? <><ChevronUp size={12} /> Show less</>
                : <><ChevronDown size={12} /> All {zipStats.length}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function UpcomingAppointmentsCard() {
  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAppointmentsForAdmin()
      .then(r => setAppointments(r.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const cutoff   = new Date(now.getTime() + 7 * 86400000)

  const upcoming = appointments.filter(a => {
    const d = new Date(a.scheduled_at)
    return d >= now && d <= cutoff
  })

  const byDay = {}
  upcoming.forEach(a => {
    const day = a.scheduled_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = []
    byDay[day].push(a)
  })
  const days = Object.keys(byDay).sort()

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-blue-400" />
          <h2 className="text-slate-100 font-semibold text-sm uppercase tracking-wider">Upcoming Appointments</h2>
        </div>
        <span className="text-xs text-slate-500">{upcoming.length} this week</span>
      </div>

      {loading && <div className="px-5 pb-4 text-slate-500 text-sm">Loading…</div>}

      {!loading && upcoming.length === 0 && (
        <div className="px-5 pb-4 text-slate-500 text-sm">No appointments in the next 7 days.</div>
      )}

      {!loading && days.length > 0 && (
        <div className="px-5 pb-5 flex flex-col gap-4">
          {days.map(day => (
            <div key={day}>
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1.5">
                {day === todayStr
                  ? '🟢 Today'
                  : new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div className="flex flex-col gap-1.5">
                {byDay[day].map(a => (
                  <div key={a.id} className="flex items-center gap-3 text-sm bg-slate-800/50 rounded-lg px-3 py-2">
                    <span className="text-slate-400 text-xs font-mono w-16 shrink-0">
                      {new Date(a.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                    <span className="text-slate-100 truncate flex-1">{a.leads?.address || '—'}</span>
                    <span className="text-blue-300 text-xs shrink-0">{a.reps?.name || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function timeAgo(ts, now) {
  if (!ts) return ''
  const diff = now - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ActivityFeed({ entries, repNameMap, loadedAt }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/50 transition-colors"
      >
        <h2 className="text-slate-100 font-semibold text-sm uppercase tracking-wider">Recent Activity</h2>
        <div className="flex items-center gap-2">
          {!open && entries.length > 0 && (
            <span className="text-xs text-slate-500">{entries.length} logs</span>
          )}
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5">
          {entries.length === 0 ? (
            <p className="text-slate-500 text-sm">No activity yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800">
              {entries.map((e, i) => (
                <div key={e.id || i} className="flex items-start gap-3 py-2 text-xs">
                  <span className="text-slate-500 w-16 shrink-0 pt-px">{timeAgo(e.ts, loadedAt)}</span>
                  <span className="text-slate-300 w-28 shrink-0">
                    {ACTION_LABELS[e.action] || e.action}
                    {e.action === 'status_update' && e.status
                      ? <span className="text-slate-400"> {e.status}</span>
                      : null}
                  </span>
                  <span className="text-blue-400 font-medium w-24 shrink-0 truncate">
                    {repNameMap[e.rep_id] || e.rep_id || '—'}
                  </span>
                  {e.notes && (
                    <span className="text-slate-500 truncate">{e.notes}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [stats,        setStats]        = useState(null)
  const [activity,     setActivity]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [loadedAt,     setLoadedAt]     = useState(0)
  const [repLocations, setRepLocations] = useState([])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [statsRes, actRes, locRes] = await Promise.all([
        getDashboardStats(),
        getRecentActivity(25),
        getRepLocations(),
      ])
      setStats(statsRes)
      setActivity(actRes.entries)
      setRepLocations(locRes.locations || [])
      setLoadedAt(Date.now())
    } catch (err) {
      setError('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const repNameMap = stats
    ? Object.fromEntries(stats.repStats.map(r => [r.id, r.name]))
    : {}

  // Set of rep IDs currently online (have an active GPS ping)
  const liveRepIds = new Set(repLocations.map(l => String(l.rep_id)))

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Oak Valley Lead Ops</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          title="Refresh"
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
        </button>
      </div>

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {loading && !stats ? (
        <div className="text-slate-500 text-sm">Loading...</div>
      ) : stats ? (
        <div className="flex flex-col gap-6">

          <UpcomingAppointmentsCard />

          <MarketOverviewCard totals={stats.totals} />

          {/* Rep cards */}
          <div>
            <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Reps ({stats.repStats.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.repStats.filter(r => r.id !== 'ADMIN-001').map(rep => (
                <RepCard
                  key={rep.id}
                  rep={rep}
                  isOnline={liveRepIds.has(String(rep.id))}
                />
              ))}
            </div>
          </div>

          {stats.zipStats?.length > 0 && (
            <ZipLeaderboardCard zipStats={stats.zipStats} />
          )}

          <ActivityFeed entries={activity} repNameMap={repNameMap} loadedAt={loadedAt} />

        </div>
      ) : null}
    </div>
  )
}
