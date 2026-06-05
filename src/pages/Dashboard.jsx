import { useState, useEffect } from 'react'
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { getDashboardStats, getRecentActivity } from '../api/sheets.js'

const CAP = 500

const STATUS_CONFIG = [
  { key: 'open',      label: 'Open',      bar: 'bg-slate-500',  text: 'text-slate-300'  },
  { key: 'claimed',   label: 'Claimed',   bar: 'bg-blue-600',   text: 'text-blue-300'   },
  { key: 'contacted', label: 'Contacted', bar: 'bg-yellow-500', text: 'text-yellow-300' },
  { key: 'follow_up', label: 'Follow Up', bar: 'bg-orange-500', text: 'text-orange-300' },
  { key: 'working',   label: 'Working',   bar: 'bg-green-500',  text: 'text-green-300'  },
  { key: 'closed',    label: 'Closed',    bar: 'bg-purple-500', text: 'text-purple-300' },
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

function StatRow({ label, count, total, bar, text }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-slate-400 shrink-0">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`w-14 text-right text-xs font-mono font-semibold ${text}`}>
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
            bar={s.bar}
            text={s.text}
          />
        ))}
      </div>
    </div>
  )
}

function RepCard({ rep }) {
  const capPct  = Math.min(100, CAP > 0 ? Math.round((rep.claimed / CAP) * 100) : 0)
  const capBar  = capPct >= 90 ? 'bg-red-500' : capPct >= 70 ? 'bg-yellow-500' : 'bg-blue-600'
  const capText = capPct >= 90 ? 'text-red-400' : capPct >= 70 ? 'text-yellow-400' : 'text-slate-400'
  const total   = rep.claimed + rep.contacted + rep.follow_up + rep.working + rep.closed

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-slate-100 font-semibold">{rep.name}</span>
        <span className="text-xs text-slate-500">{total.toLocaleString()} leads</span>
      </div>

      {/* Cap gauge */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-400">Claimed (No Contact)</span>
          <span className={capText}>{rep.claimed} / {CAP}</span>
        </div>
        <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${capBar}`} style={{ width: `${capPct}%` }} />
        </div>
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 pt-1">
        {[
          { label: 'Contacted',  value: rep.contacted, color: 'text-yellow-300' },
          { label: 'Follow Up',  value: rep.follow_up, color: 'text-orange-300' },
          { label: 'Working',    value: rep.working,   color: 'text-green-300'  },
          { label: 'Closed',     value: rep.closed,    color: 'text-purple-300' },
        ].map(s => (
          <div key={s.label} className="flex justify-between items-center">
            <span className="text-xs text-slate-500">{s.label}</span>
            <span className={`text-xs font-mono font-semibold ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ZipLeaderboardCard({ zipStats }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? zipStats : zipStats.slice(0, 10)
  const topScore = zipStats[0]?.score || 1

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-slate-100 font-semibold text-sm uppercase tracking-wider">
          Top ZIPs by Activity
        </h2>
        <span className="text-xs text-slate-500">{zipStats.length} ZIPs total</span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-2">
        {visible.map((z, i) => {
          const barPct = topScore > 0 ? Math.round((z.score / topScore) * 100) : 0
          return (
            <div key={z.zip} className="flex items-center gap-3">
              {/* Rank */}
              <span className="text-xs text-slate-500 w-5 shrink-0 text-right">{i + 1}</span>
              {/* ZIP */}
              <span className="text-xs font-mono text-slate-200 w-12 shrink-0">{z.zip}</span>
              {/* Bar */}
              <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${barPct}%` }}
                />
              </div>
              {/* Breakdown */}
              <div className="flex items-center gap-2 text-xs font-mono shrink-0">
                <span className="text-yellow-300 w-6 text-right" title="Contacted">{z.contacted}</span>
                <span className="text-orange-300 w-6 text-right" title="Follow Up">{z.follow_up}</span>
                <span className="text-green-300  w-6 text-right" title="Working">{z.working}</span>
                <span className="text-purple-300 w-6 text-right" title="Closed">{z.closed}</span>
                <span className="text-slate-400  w-8 text-right" title="Total">{z.total}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend + expand toggle */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><span className="text-yellow-300">■</span> Contacted</span>
          <span><span className="text-orange-300">■</span> Follow Up</span>
          <span><span className="text-green-300">■</span> Working</span>
          <span><span className="text-purple-300">■</span> Closed</span>
          <span><span className="text-slate-400">■</span> Total</span>
        </div>
        {zipStats.length > 10 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {expanded
              ? <><ChevronUp size={12} /> Show less</>
              : <><ChevronDown size={12} /> Show all {zipStats.length}</>}
          </button>
        )}
      </div>
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
      {/* Header — always visible, click to toggle */}
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

      {/* Body — only when open */}
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
  const [stats,    setStats]    = useState(null)
  const [activity, setActivity] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [loadedAt, setLoadedAt] = useState(0)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [statsRes, actRes] = await Promise.all([
        getDashboardStats(),
        getRecentActivity(25),
      ])
      setStats(statsRes)
      setActivity(actRes.entries)
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

          {/* Market overview */}
          <MarketOverviewCard totals={stats.totals} />

          {/* Rep cards */}
          <div>
            <h2 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Reps ({stats.repStats.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stats.repStats.map(rep => (
                <RepCard key={rep.id} rep={rep} />
              ))}
            </div>
          </div>

          {/* ZIP leaderboard */}
          {stats.zipStats?.length > 0 && (
            <ZipLeaderboardCard zipStats={stats.zipStats} />
          )}

          {/* Activity feed */}
          <ActivityFeed entries={activity} repNameMap={repNameMap} loadedAt={loadedAt} />

        </div>
      ) : null}
    </div>
  )
}
