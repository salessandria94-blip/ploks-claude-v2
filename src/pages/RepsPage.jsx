import { useState, useEffect } from 'react'
import { getAllReps, createRep, updateRep, deactivateRep, getDashboardStats, getLeadsForRepByStatus, getLeadById } from '../api/sheets.js'
import { ExternalLink, Plus, Trash2, Eye, EyeOff, Phone, Mail, X, Copy, Check } from 'lucide-react'

const FIELD_BASE = `${window.location.origin}/field`

// ── Helpers ───────────────────────────────────────────────────────────────────

function nameToSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}
function genPin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// ── Rep Card ──────────────────────────────────────────────────────────────────

function RepCard({ rep, onEdit, onDelete, onDrill }) {
  const [pinVisible,  setPinVisible]  = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const fieldUrl = `${FIELD_BASE}/${rep.slug}`

  const stats = [
    { label: 'Assigned',  value: rep.claimed   || 0, color: 'text-blue-400',   dbStatus: 'No Contact' },
    { label: 'Contacted', value: rep.contacted  || 0, color: 'text-blue-400',   dbStatus: 'Contacted' },
    { label: 'Working',   value: rep.working    || 0, color: 'text-orange-400', dbStatus: 'Working' },
    { label: 'Closed',    value: rep.closed     || 0, color: 'text-green-400',  dbStatus: 'Closed' },
  ]

  async function handleDelete(e) {
    e.stopPropagation()
    if (!confirmDel) { setConfirmDel(true); return }
    setDeleting(true)
    try { await onDelete(rep.id) } catch { setDeleting(false) }
  }

  return (
    <div
      onClick={() => onEdit(rep)}
      className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-3 cursor-pointer hover:border-slate-600 hover:bg-slate-800/50 transition-all"
    >
      {/* Name + Field View */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <div className="text-slate-100 font-semibold text-base truncate">{rep.name}</div>
          {rep.email && (
            <div className="flex items-center gap-1 text-slate-500 text-xs truncate">
              <Mail size={10} className="shrink-0" />{rep.email}
            </div>
          )}
          {rep.phone && (
            <div className="flex items-center gap-1 text-slate-500 text-xs">
              <Phone size={10} className="shrink-0" />{rep.phone}
            </div>
          )}
        </div>
        <a
          href={fieldUrl}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-400 text-xs font-medium transition-colors"
        >
          Field View <ExternalLink size={10} />
        </a>
      </div>

      {/* Stats — each is clickable */}
      <div className="grid grid-cols-4 gap-1 py-3 border-t border-b border-slate-800">
        {stats.map(({ label, value, color, dbStatus }) => (
          <button
            key={label}
            onClick={e => { e.stopPropagation(); if (value > 0) onDrill(rep, label, dbStatus) }}
            className={`flex flex-col items-center gap-0.5 rounded-lg py-1 transition-colors ${value > 0 ? 'hover:bg-slate-800 cursor-pointer' : 'cursor-default'}`}
          >
            <span className={`text-xl font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-slate-600 text-xs">{label}</span>
          </button>
        ))}
      </div>

      {/* Footer: PIN + trash */}
      <div className="flex items-center justify-between">
        {rep.pin ? (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-600 text-xs">PIN</span>
            <span className="font-mono text-xs text-slate-400">
              {pinVisible ? rep.pin : '••••'}
            </span>
            <button
              onClick={e => { e.stopPropagation(); setPinVisible(v => !v) }}
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              {pinVisible ? <EyeOff size={11} /> : <Eye size={11} />}
            </button>
          </div>
        ) : <div />}

        {confirmDel ? (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <span className="text-red-400 text-xs">Remove rep?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-400 font-semibold hover:text-red-300 transition-colors"
            >
              {deleting ? 'Removing…' : 'Yes'}
            </button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmDel(false) }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-700 hover:text-red-400 transition-colors"
            title="Remove rep"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Lead Detail Modal (read-only admin view) ──────────────────────────────────

const STATUS_COLOR = {
  'No Contact': 'bg-slate-700 text-slate-300',
  'Contacted':  'bg-blue-900/50 text-blue-300',
  'Working':    'bg-orange-900/50 text-orange-300',
  'Closed':     'bg-green-900/50 text-green-300',
  'Follow Up':  'bg-purple-900/50 text-purple-300',
}

const ACTION_LABEL = {
  claim:         'Claimed',
  bulk_claim:    'Bulk Claimed',
  status_update: 'Status Updated',
  edit:          'Info Edited',
  note:          'Note Added',
  admin_assign:  'Admin Assigned',
  unassign:      'Unassigned',
  bulk_unassign: 'Bulk Unassigned',
}

function LeadDetailModal({ leadId, onClose }) {
  const [lead,     setLead]     = useState(null)
  const [activity, setActivity] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    getLeadById(leadId)
      .then(res => { setLead(res.lead); setActivity(res.activity) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [leadId])

  function fmtTs(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleString('en-US', {
      month: '2-digit', day: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[85vh] shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800 shrink-0">
          <div className="min-w-0 pr-3">
            {loading
              ? <div className="text-slate-400 text-sm">Loading…</div>
              : lead
              ? <>
                  <div className="text-slate-100 font-bold text-base leading-snug">{lead.address}</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-slate-500 text-xs">ZIP {lead.zip}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[lead.status] || 'bg-slate-700 text-slate-300'}`}>
                      {lead.status || 'No Contact'}
                    </span>
                  </div>
                </>
              : <div className="text-slate-400 text-sm">Lead not found</div>
            }
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors shrink-0">
            <X size={18} />
          </button>
        </div>

        {error && <div className="p-5 text-red-400 text-sm">{error}</div>}

        {!loading && lead && (
          <div className="flex-1 overflow-y-auto">

            {/* Contact info */}
            <div className="p-5 grid grid-cols-2 gap-x-6 gap-y-3 border-b border-slate-800">
              {[
                { label: 'Owner',     value: lead.owner_name },
                { label: 'Phone',     value: lead.phone },
                { label: 'Email',     value: lead.email },
                { label: 'Insurance', value: lead.insurance },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="text-slate-500 text-xs mb-0.5">{label}</div>
                  <div className="text-slate-200 text-sm">{value || <span className="text-slate-600">—</span>}</div>
                </div>
              ))}
            </div>

            {/* Rep assigned */}
            {lead.assigned_rep && (
              <div className="px-5 py-3 border-b border-slate-800">
                <div className="text-slate-500 text-xs mb-0.5">Assigned Rep</div>
                <div className="text-slate-200 text-sm">{lead.assigned_rep}</div>
              </div>
            )}

            {/* Notes */}
            {lead.notes && (
              <div className="px-5 py-3 border-b border-slate-800">
                <div className="text-slate-500 text-xs mb-1">Notes</div>
                <div className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">{lead.notes}</div>
              </div>
            )}

            {/* Activity log */}
            <div className="px-5 pt-4 pb-2">
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">Activity</div>
              {activity.length === 0 && (
                <div className="text-slate-600 text-sm">No activity yet.</div>
              )}
              <div className="flex flex-col gap-3">
                {activity.map(entry => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-300 text-xs font-medium">
                          {ACTION_LABEL[entry.action] || entry.action}
                        </span>
                        {entry.status && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLOR[entry.status] || 'bg-slate-700 text-slate-400'}`}>
                            {entry.status}
                          </span>
                        )}
                        {entry.rep_id && (
                          <span className="text-slate-600 text-xs">{entry.rep_id}</span>
                        )}
                      </div>
                      {entry.notes && (
                        <div className="text-slate-500 text-xs mt-0.5 leading-relaxed">{entry.notes}</div>
                      )}
                      <div className="text-slate-700 text-xs mt-0.5">{fmtTs(entry.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

// ── Rep Lead Drill-down Modal ─────────────────────────────────────────────────

const STATUS_BADGE = {
  'No Contact': 'bg-slate-700 text-slate-300',
  'Contacted':  'bg-blue-900/50 text-blue-300',
  'Working':    'bg-orange-900/50 text-orange-300',
  'Closed':     'bg-green-900/50 text-green-300',
  'Follow Up':  'bg-purple-900/50 text-purple-300',
}

function RepLeadModal({ rep, statusLabel, dbStatus, onClose }) {
  const [leads,       setLeads]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [viewingLead, setViewingLead] = useState(null) // lead id to drill into

  useEffect(() => {
    getLeadsForRepByStatus(rep.id, dbStatus)
      .then(res => setLeads(res.leads))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [rep.id, dbStatus])

  function fmtDate(ts) {
    if (!ts) return ''
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg flex flex-col max-h-[80vh] shadow-2xl">

          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-slate-800 shrink-0">
            <div>
              <div className="text-slate-100 font-bold text-base">{rep.name}</div>
              <div className="text-slate-400 text-sm mt-0.5">
                {statusLabel}
                {!loading && <span className="text-slate-600"> · {leads.length} lead{leads.length !== 1 ? 's' : ''}</span>}
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors mt-0.5">
              <X size={18} />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-5 text-slate-400 text-sm">Loading…</div>}
            {error   && <div className="p-5 text-red-400 text-sm">{error}</div>}
            {!loading && !error && leads.length === 0 && (
              <div className="p-5 text-slate-500 text-sm">No leads in this category.</div>
            )}
            {!loading && leads.map((lead, i) => (
              <button
                key={lead.id}
                onClick={() => setViewingLead(lead.id)}
                className={`w-full text-left px-5 py-3.5 flex items-start justify-between gap-3 hover:bg-slate-800 transition-colors ${i < leads.length - 1 ? 'border-b border-slate-800' : ''}`}
              >
                <div className="min-w-0">
                  <div className="text-slate-100 text-sm font-medium truncate">{lead.address}</div>
                  <div className="text-slate-500 text-xs mt-0.5 flex flex-wrap gap-x-2">
                    <span>ZIP {lead.zip}</span>
                    {lead.owner_name && <span>{lead.owner_name}</span>}
                    {lead.phone      && <span>{lead.phone}</span>}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[lead.status] || 'bg-slate-700 text-slate-300'}`}>
                    {lead.status || 'No Contact'}
                  </span>
                  <span className="text-slate-600 text-xs">
                    {fmtDate(lead.status_changed_at || lead.claimed_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Lead detail overlay — stacks on top */}
      {viewingLead && (
        <LeadDetailModal leadId={viewingLead} onClose={() => setViewingLead(null)} />
      )}
    </>
  )
}

// ── Admin Card ────────────────────────────────────────────────────────────────

function AdminCard() {
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col gap-3">
      {/* Name + badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="text-slate-100 font-semibold text-base">Admin</div>
        <a
          href="/"
          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-900/40 hover:bg-purple-800/60 text-purple-400 text-xs font-medium transition-colors"
        >
          Admin View <ExternalLink size={10} />
        </a>
      </div>

      {/* Divider row */}
      <div className="py-3 border-t border-b border-slate-800 text-center text-slate-600 text-xs tracking-wide">
        System administrator — all access
      </div>

      {/* PIN placeholder */}
      <div className="flex items-center gap-1.5">
        <span className="text-slate-600 text-xs">PIN</span>
        <span className="font-mono text-xs text-slate-500">••••</span>
      </div>
    </div>
  )
}

// ── Add Rep Card (dashed +) ───────────────────────────────────────────────────

function AddRepCard({ onClick }) {
  return (
    <div
      onClick={onClick}
      className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl flex items-center justify-center min-h-[200px] cursor-pointer transition-colors group"
    >
      <Plus size={36} className="text-slate-600 group-hover:text-blue-500 transition-colors" />
    </div>
  )
}

// ── URL Copy Row ──────────────────────────────────────────────────────────────

function UrlCopyRow({ url }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-slate-500 text-xs font-mono truncate">
        {url}
      </div>
      <button
        onClick={handleCopy}
        className="shrink-0 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        title="Copy field link"
      >
        {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

// ── Rep Form Modal (create + edit) ────────────────────────────────────────────

function RepFormModal({ rep, onSave, onClose }) {
  const isEdit = Boolean(rep)
  const [name,   setName]   = useState(rep?.name  || '')
  const [phone,  setPhone]  = useState(rep?.phone || '')
  const [email,  setEmail]  = useState(rep?.email || '')
  const [pin,    setPin]    = useState(rep?.pin   || genPin())
  const [slug,   setSlug]   = useState(rep?.slug  || '')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Auto-generate slug from name (create only)
  useEffect(() => {
    if (!isEdit) setSlug(nameToSlug(name))
  }, [name, isEdit])

  async function handleSave() {
    if (!name.trim()) return setError('Name is required')
    if (!isEdit && !slug.trim()) return setError('URL slug is required')
    if (!pin.trim())  return setError('PIN is required')
    setSaving(true)
    setError('')
    try {
      await onSave({ name, phone, email, pin, slug })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition-colors'

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">

        <div className="flex items-center justify-between">
          <h2 className="text-slate-100 font-bold text-lg">{isEdit ? 'Edit Rep' : 'New Rep'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            className={inputCls}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John Smith"
            autoFocus
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">Phone</label>
          <input
            className={inputCls}
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(904) 555-1234"
            type="tel"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">Email</label>
          <input
            className={inputCls}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="john@oakvalley.com"
            type="email"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 w-24 shrink-0">
            <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">PIN</label>
            <input
              className={inputCls + ' font-mono'}
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={6}
            />
          </div>
          {!isEdit && (
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">URL Slug</label>
              <input
                className={inputCls + ' font-mono'}
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="auto from name"
              />
            </div>
          )}
        </div>

        {!isEdit && slug && (
          <div className="bg-slate-800 rounded-lg px-3 py-2 text-slate-500 text-xs font-mono truncate">
            {FIELD_BASE}/{slug}
          </div>
        )}

        {isEdit && (
          <UrlCopyRow url={`${FIELD_BASE}/${rep.slug}`} />
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {saving
              ? (isEdit ? 'Saving…' : 'Creating…')
              : (isEdit ? 'Save Changes' : 'Create Rep')}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Reps Page ─────────────────────────────────────────────────────────────────

export default function RepsPage() {
  const [reps,    setReps]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [editing, setEditing] = useState(null)   // null | 'new' | rep object
  const [drilling, setDrilling] = useState(null) // null | { rep, statusLabel, dbStatus }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [repsRes, statsRes] = await Promise.all([getAllReps(), getDashboardStats()])
      const statMap = Object.fromEntries((statsRes.repStats || []).map(r => [r.id, r]))
      const merged  = (repsRes.reps || []).map(r => ({ ...r, ...statMap[r.id] }))
      setReps(merged)
    } catch (err) {
      setError('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleCreate({ name, phone, email, pin, slug }) {
    const res = await createRep(name, phone, email, pin, slug)
    setReps(prev => [...prev, res.rep].sort((a, b) => a.name.localeCompare(b.name)))
    setEditing(null)
  }

  async function handleUpdate({ name, phone, email, pin }) {
    await updateRep(editing.id, { name, phone, email, pin })
    setReps(prev => prev.map(r =>
      r.id === editing.id ? { ...r, name, phone: phone || null, email: email || null, pin } : r
    ))
    setEditing(null)
  }

  async function handleDelete(repId) {
    await deactivateRep(repId)
    setReps(prev => prev.filter(r => r.id !== repId))
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Reps</h1>
        {!loading && reps.length > 0 && (
          <p className="text-slate-400 text-sm mt-0.5">{reps.length} reps</p>
        )}
      </div>

      {/* Modals */}
      {editing === 'new' && (
        <RepFormModal onSave={handleCreate} onClose={() => setEditing(null)} />
      )}
      {editing && editing !== 'new' && (
        <RepFormModal rep={editing} onSave={handleUpdate} onClose={() => setEditing(null)} />
      )}
      {drilling && (
        <RepLeadModal
          rep={drilling.rep}
          statusLabel={drilling.statusLabel}
          dbStatus={drilling.dbStatus}
          onClose={() => setDrilling(null)}
        />
      )}

      {error   && <div className="text-red-400 text-sm mb-4">{error}</div>}
      {loading && <div className="text-slate-400 text-sm">Loading reps…</div>}

      {!loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reps.filter(r => r.id !== 'REP-005').map(rep => (
            rep.id === 'ADMIN-001'
              ? <AdminCard key={rep.id} />
              : <RepCard
                  key={rep.id}
                  rep={rep}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                  onDrill={(rep, statusLabel, dbStatus) => setDrilling({ rep, statusLabel, dbStatus })}
                />
          ))}
          <AddRepCard onClick={() => setEditing('new')} />
        </div>
      )}

    </div>
  )
}
