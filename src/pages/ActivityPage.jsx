import { useState, useEffect, useCallback } from 'react'
import { getAllReps, getActivityPage } from '../api/sheets.js'
import { RefreshCw, Loader2, ChevronDown } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTION_LABEL = {
  claim:          'Claimed',
  bulk_claim:     'Claimed',
  admin_assign:   'Assigned',
  unassign:       'Released',
  bulk_unassign:  'Released',
  admin_unassign: 'Unassigned',
  status_update:  'Status',
  note:           'Note',
  edit:           'Edited',
  auto_recycle:   'Recycled',
  event:          'Event',
}

// Pill style per action type
const ACTION_STYLE = {
  claim:          'bg-green-900/70 text-green-300',
  bulk_claim:     'bg-green-900/70 text-green-300',
  admin_assign:   'bg-blue-900/70 text-blue-300',
  unassign:       'bg-slate-700 text-slate-300',
  bulk_unassign:  'bg-slate-700 text-slate-300',
  admin_unassign: 'bg-orange-900/70 text-orange-300',
  status_update:  'bg-purple-900/70 text-purple-300',
  note:           'bg-slate-700 text-slate-400',
  edit:           'bg-slate-700 text-slate-400',
  auto_recycle:   'bg-yellow-900/70 text-yellow-300',
  event:          'bg-slate-700 text-slate-400',
}

// Filter groups shown at top
const FILTERS = [
  { id: 'all',      label: 'All',      actions: null },
  { id: 'claims',   label: 'Claims',   actions: ['claim', 'bulk_claim'] },
  { id: 'assigned', label: 'Assigned', actions: ['admin_assign'] },
  { id: 'releases', label: 'Releases', actions: ['unassign', 'bulk_unassign', 'admin_unassign'] },
  { id: 'status',   label: 'Status',   actions: ['status_update'] },
  { id: 'notes',    label: 'Notes',    actions: ['note', 'edit'] },
]

// Status badge colours that match the app's status colour scheme
const STATUS_COLOR = {
  'no contact': 'text-green-400',
  'contacted':  'text-amber-400',
  'working':    'text-purple-400',
  'follow up':  'text-orange-400',
  'closed':     'text-slate-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function ActionBadge({ action }) {
  const label = ACTION_LABEL[action] || action
  const style = ACTION_STYLE[action] || 'bg-slate-700 text-slate-400'
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ entry, repMap }) {
  const repName  = repMap[entry.rep_id] || (entry.rep_id ? entry.rep_id : 'System')
  const address  = entry.leads?.address
  const zip      = entry.leads?.zip
  const statusLc = (entry.status || '').toLowerCase()
  const statusCls = STATUS_COLOR[statusLc] || 'text-slate-300'

  // Build the secondary detail line
  let detail = null
  if (entry.action === 'status_update' && entry.status) {
    detail = (
      <span className={`font-medium ${statusCls}`}>
        → {entry.status}
        {entry.notes ? <span className="text-slate-500 font-normal"> · {entry.notes}</span> : null}
      </span>
    )
  } else if (entry.notes) {
    detail = <span className="text-slate-500">{entry.notes}</span>
  }

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
      {/* Left — action badge */}
      <div className="shrink-0 pt-0.5">
        <ActionBadge action={entry.action} />
      </div>

      {/* Center — who + where */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-slate-200 text-sm font-medium">{repName}</span>
          {address
            ? <span className="text-slate-400 text-xs truncate">{address}{zip ? ` · ${zip}` : ''}</span>
            : entry.lead_id
              ? <span className="text-slate-600 text-xs font-mono">{entry.lead_id}</span>
              : null
          }
        </div>
        {detail && <div className="text-xs mt-0.5">{detail}</div>}
      </div>

      {/* Right — time */}
      <div className="shrink-0 text-slate-600 text-xs whitespace-nowrap pt-0.5">
        {timeAgo(entry.ts)}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 60

export default function ActivityPage() {
  const [reps, setReps]             = useState([])
  const [entries, setEntries]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]       = useState(false)
  const [error, setError]           = useState('')
  const [repFilter, setRepFilter]   = useState('')   // rep_id or '' for all
  const [actionFilter, setActionFilter] = useState('all') // filter group id

  const activeGroup = FILTERS.find(f => f.id === actionFilter) || FILTERS[0]

  // Build a rep_id → name lookup
  const repMap = Object.fromEntries(reps.map(r => [r.id, r.name]))

  const load = useCallback(async ({ rep, group, replace = true }) => {
    const isReplace = replace
    if (isReplace) setLoading(true)
    else           setLoadingMore(true)
    setError('')
    try {
      const res = await getActivityPage({
        limit:   PAGE_SIZE,
        offset:  isReplace ? 0 : entries.length,
        repId:   rep || null,
        actions: group?.actions || null,
      })
      setEntries(prev => isReplace ? res.entries : [...prev, ...res.entries])
      setHasMore(res.hasMore)
    } catch (err) {
      setError(err.message)
    } finally {
      if (isReplace) setLoading(false)
      else           setLoadingMore(false)
    }
  }, [entries.length])

  // Initial load — fetch reps and first page in parallel
  useEffect(() => {
    async function init() {
      try {
        const [repRes, actRes] = await Promise.all([
          getAllReps(),
          getActivityPage({ limit: PAGE_SIZE, offset: 0 }),
        ])
        setReps(repRes.reps || [])
        setEntries(actRes.entries || [])
        setHasMore(actRes.hasMore)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  function handleRepChange(repId) {
    setRepFilter(repId)
    load({ rep: repId, group: activeGroup, replace: true })
  }

  function handleActionChange(groupId) {
    const group = FILTERS.find(f => f.id === groupId)
    setActionFilter(groupId)
    load({ rep: repFilter, group, replace: true })
  }

  function handleRefresh() {
    load({ rep: repFilter, group: activeGroup, replace: true })
  }

  function handleLoadMore() {
    load({ rep: repFilter, group: activeGroup, replace: false })
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-slate-100">Activity</h1>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-slate-400 hover:text-slate-200 p-1"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>

        {/* Rep filter */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative">
            <select
              value={repFilter}
              onChange={e => handleRepChange(e.target.value)}
              className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg pl-3 pr-8 py-1.5 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Reps</option>
              {reps.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Action type filter */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => handleActionChange(f.id)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                actionFilter === f.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm px-4 py-2 bg-red-950/30 shrink-0">{error}</div>
      )}

      {/* ── Feed ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        {loading && entries.length === 0 && (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-500 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading activity…
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">
            No activity found{repFilter || actionFilter !== 'all' ? ' for this filter.' : '.'}
          </div>
        )}

        {entries.map(entry => (
          <ActivityRow key={entry.id} entry={entry} repMap={repMap} />
        ))}

        {/* Load more */}
        {hasMore && (
          <div className="px-4 py-4">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full flex items-center justify-center gap-2 text-sm px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
            >
              {loadingMore
                ? <><Loader2 size={14} className="animate-spin" /> Loading…</>
                : 'Load more'
              }
            </button>
          </div>
        )}

        {!hasMore && entries.length > 0 && (
          <div className="text-center py-4 text-slate-700 text-xs">
            — end of log —
          </div>
        )}
      </div>
    </div>
  )
}
