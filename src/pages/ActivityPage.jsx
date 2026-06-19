import { useState, useEffect, useCallback } from 'react'
import { getAllReps, getActivityPage, getLeadById, updateLeadProfile } from '../api/sheets.js'
import { RefreshCw, Loader2, ChevronDown, X, ClipboardList } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['No Contact', 'Contacted', 'Working', 'Follow Up', 'Closed']

function statusBadge(s) {
  const lc = (s || '').toLowerCase()
  if (lc === 'no contact') return 'bg-green-900/70 text-green-300'
  if (lc === 'contacted')  return 'bg-amber-900/70 text-amber-300'
  if (lc === 'working')    return 'bg-purple-900/70 text-purple-300'
  if (lc === 'follow up')  return 'bg-red-900/70 text-red-300'
  if (lc === 'closed')     return 'bg-slate-700 text-slate-400'
  return 'bg-slate-700 text-slate-300'
}

function bucketColor(b) {
  const u = (b || '').toUpperCase()
  if (u === 'ACTIVE') return 'text-green-400'
  if (u === 'WARM')   return 'text-yellow-400'
  if (u === 'COLD')   return 'text-blue-400'
  return 'text-slate-500'
}

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
  { id: 'all',      label: 'Recent',   actions: null },
  { id: 'claims',   label: 'Claims',   actions: ['claim', 'bulk_claim'] },
  { id: 'assigned', label: 'Assigned', actions: ['admin_assign'] },
  { id: 'releases', label: 'Releases', actions: ['unassign', 'bulk_unassign', 'admin_unassign'] },
  { id: 'status',   label: 'Status',   actions: ['status_update'] },
  { id: 'notes',    label: 'Notes',    actions: ['note', 'edit'] },
]

// Collapse consecutive claim/assign/release entries from the same source in the same ZIP.
// Rep actions: 5-minute window (tight burst when a rep bulk-claims).
// System actions (no rep_id): 24-hour window — system batch jobs can span longer.
const COLLAPSIBLE = new Set(['claim', 'bulk_claim', 'admin_assign', 'unassign', 'bulk_unassign', 'admin_unassign'])
const COLLAPSE_WINDOW_MS        = 5  * 60 * 1000        // 5 min for rep actions
const SYSTEM_COLLAPSE_WINDOW_MS = 24 * 60 * 60 * 1000  // 24 h  for system actions

function collapseEntries(entries) {
  const result = []
  const used = new Set()
  for (let i = 0; i < entries.length; i++) {
    if (used.has(i)) continue
    const e = entries[i]
    used.add(i)
    if (!COLLAPSIBLE.has(e.action)) { result.push(e); continue }
    const zip      = e.leads?.zip
    const repKey   = e.rep_id || ''          // normalise null/undefined → ''
    const isSystem = !e.rep_id
    const baseTime = new Date(e.ts).getTime()
    const windowMs = isSystem ? SYSTEM_COLLAPSE_WINDOW_MS : COLLAPSE_WINDOW_MS
    const group = [e]
    for (let j = i + 1; j < entries.length; j++) {
      if (used.has(j)) continue
      const ej = entries[j]
      if (!COLLAPSIBLE.has(ej.action)) continue
      if ((ej.rep_id || '') !== repKey) continue           // same source
      if (ej.leads?.zip !== zip) continue                  // same ZIP
      if (isSystem && ej.action !== e.action) continue     // system: don't mix release/assign
      if (Math.abs(new Date(ej.ts).getTime() - baseTime) > windowMs) continue
      group.push(ej)
      used.add(j)
    }
    if (group.length > 1) {
      result.push({ ...e, _grouped: true, _count: group.length, _zip: zip })
    } else {
      result.push(e)
    }
  }
  return result
}

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

// ── Lead detail drawer ────────────────────────────────────────────────────────

function DrawerField({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
      />
    </div>
  )
}

function LeadDetailDrawer({ leadId, onClose }) {
  const [lead, setLead] = useState(null)
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await getLeadById(leadId)
        setLead(res.lead)
        setActivity(res.activity || [])
        if (res.lead) {
          setForm({
            owner_name: res.lead.owner_name || '',
            phone:      res.lead.phone || '',
            email:      res.lead.email || '',
            insurance:  res.lead.insurance || '',
            status:     res.lead.status || '',
            notes:      res.lead.notes || '',
          })
        }
      } catch (err) {
        console.error('LeadDetailDrawer load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leadId])

  async function handleSave() {
    if (!lead || !form) return
    setSaving(true)
    const fields = {}
    if (form.owner_name !== (lead.owner_name || '')) fields.owner_name = form.owner_name
    if (form.phone      !== (lead.phone      || '')) fields.phone      = form.phone
    if (form.email      !== (lead.email      || '')) fields.email      = form.email
    if (form.insurance  !== (lead.insurance  || '')) fields.insurance  = form.insurance
    if (form.status     !== (lead.status     || '')) fields.status     = form.status
    if (form.notes      !== (lead.notes      || '')) fields.notes      = form.notes
    if (Object.keys(fields).length === 0) { setSaving(false); return }
    try {
      await updateLeadProfile(lead.id, fields, 'admin')
      setLead(prev => ({ ...prev, ...fields }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally { setSaving(false) }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-4 border-b border-slate-800 shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            {lead ? (
              <>
                <div className="text-slate-100 font-semibold text-base leading-tight truncate">{lead.address}</div>
                <div className="text-slate-500 text-xs mt-0.5">
                  ZIP {lead.zip}{lead.assigned_rep ? ` · ${lead.assigned_rep}` : ' · Unassigned'}
                </div>
              </>
            ) : loading ? (
              <div className="text-slate-400 text-sm">Loading…</div>
            ) : (
              <div className="text-slate-400 text-sm">Lead not found</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading lead…
          </div>
        ) : lead && form ? (
          <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
            {/* Status + bucket chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {form.status && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusBadge(form.status)}`}>
                  {form.status}
                </span>
              )}
              {lead.bucket && (
                <span className={`text-xs font-medium ${bucketColor(lead.bucket)}`}>{lead.bucket}</span>
              )}
              {lead.roof_age && <span className="text-xs text-slate-500">Roof: {lead.roof_age}</span>}
            </div>

            {/* Editable fields */}
            <DrawerField label="Owner Name" value={form.owner_name}
              onChange={v => setForm(f => ({ ...f, owner_name: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <DrawerField label="Phone" value={form.phone}
                onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="(000) 000-0000" />
              <DrawerField label="Email" value={form.email}
                onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="email@domain.com" />
            </div>
            <DrawerField label="Insurance" value={form.insurance}
              onChange={v => setForm(f => ({ ...f, insurance: v }))} placeholder="State Farm, Allstate…" />

            {/* Status dropdown */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase tracking-wide">Lead Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                <option value="">— No Status —</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase tracking-wide">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Notes…"
                className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none placeholder:text-slate-600"
              />
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
            </button>

            {/* Activity log */}
            <div className="pt-1">
              <button
                onClick={() => setShowLog(v => !v)}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  showLog
                    ? 'bg-slate-700 text-slate-200'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ClipboardList size={14} />
                {showLog ? 'Hide log' : 'Show log'}
              </button>
              {showLog && (
                <div className="mt-2 bg-slate-800 rounded-lg p-3">
                  {activity.length === 0 ? (
                    <div className="text-slate-600 text-xs">No activity recorded.</div>
                  ) : (
                    <div className="flex flex-col gap-2.5 max-h-64 overflow-auto">
                      {activity.map((e, i) => (
                        <div key={i} className="flex gap-2 text-xs">
                          <div className="text-slate-600 whitespace-nowrap shrink-0">
                            {e.ts ? new Date(e.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                          </div>
                          <div className="text-slate-400 shrink-0 w-16">{ACTION_LABEL[e.action] || e.action}</div>
                          <div className="text-slate-300 truncate">{e.notes || e.status || '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Could not load lead.
          </div>
        )}
      </div>
    </>
  )
}

// ── Activity row ──────────────────────────────────────────────────────────────

function ActivityRow({ entry, repMap, onLeadClick }) {
  const repName  = repMap[entry.rep_id] || (entry.rep_id ? entry.rep_id : 'System')
  const clickable = !!entry.lead_id && !entry._grouped

  // Grouped / bulk row
  if (entry._grouped) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/20 transition-colors">
        <div className="shrink-0"><ActionBadge action={entry.action} /></div>
        <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-2">
          <span className="text-slate-200 text-sm font-medium">{repName}</span>
          <span className="text-slate-400 text-xs">
            {entry._count} leads{entry._zip ? ` · ${entry._zip}` : ''}
          </span>
        </div>
        <div className="shrink-0 text-slate-600 text-xs whitespace-nowrap">{timeAgo(entry.ts)}</div>
      </div>
    )
  }

  const address  = entry.leads?.address
  const zip      = entry.leads?.zip
  const statusLc = (entry.status || '').toLowerCase()
  const statusCls = STATUS_COLOR[statusLc] || 'text-slate-300'

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
    <div
      onClick={clickable ? () => onLeadClick(entry.lead_id) : undefined}
      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 transition-colors ${
        clickable
          ? 'cursor-pointer hover:bg-slate-800/40 active:bg-slate-700/40'
          : 'hover:bg-slate-800/20'
      }`}
    >
      <div className="shrink-0 pt-0.5"><ActionBadge action={entry.action} /></div>
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
      <div className="shrink-0 text-slate-600 text-xs whitespace-nowrap pt-0.5">{timeAgo(entry.ts)}</div>
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
  const [selectedLeadId, setSelectedLeadId] = useState(null)

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

        {collapseEntries(entries).map((entry, i) => (
          <ActivityRow
            key={entry._grouped ? `grp-${i}` : entry.id}
            entry={entry}
            repMap={repMap}
            onLeadClick={setSelectedLeadId}
          />
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

      {/* Lead detail drawer */}
      {selectedLeadId && (
        <LeadDetailDrawer leadId={selectedLeadId} onClose={() => setSelectedLeadId(null)} />
      )}
    </div>
  )
}
