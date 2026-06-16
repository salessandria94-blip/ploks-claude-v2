import { useState, useEffect, useMemo, Fragment } from 'react'
import { getAllLeads, getLeadsForRep, getZipList, getAdminZipStats, getAllReps, assignLead, unassignLead, updateLeadProfile, getLeadActivity } from '../api/sheets.js'
import { RefreshCw, ChevronDown, MapPin, ChevronRight, ClipboardList, Users } from 'lucide-react'

const STATUSES = ['No Contact', 'Contacted', 'Working', 'Closed']

function statusColor(s) {
  if (s === 'Closed')    return 'bg-green-900 text-green-300'
  if (s === 'Working')   return 'bg-yellow-900 text-yellow-300'
  if (s === 'Contacted') return 'bg-blue-900 text-blue-300'
  return 'bg-slate-700 text-slate-300'
}

function bucketColor(b) {
  const u = (b || '').toUpperCase()
  if (u === 'ACTIVE') return 'text-green-400'
  if (u === 'WARM')   return 'text-yellow-400'
  if (u === 'COLD')   return 'text-blue-400'
  return 'text-slate-500'
}

// ── Expanded lead profile ──────────────────────────────────────────────────

const ACTION_LABELS = {
  admin_assign:   'Assigned',
  admin_unassign: 'Unassigned',
  status_update:  'Status →',
  event:          'Event',
  claim:          'Claimed',
}

function LeadProfile({ lead, reps, onClose, onLeadUpdate }) {
  const [form, setForm] = useState({
    owner_name: lead.owner_name || '',
    phone:      lead.phone || '',
    email:      lead.email || '',
    insurance:  lead.insurance || '',
    status:     lead.status || '',
    notes:      lead.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [activity, setActivity] = useState([])
  const [loadingLog, setLoadingLog] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const fields = {}
    if (form.owner_name !== lead.owner_name) fields.owner_name = form.owner_name
    if (form.phone !== lead.phone)           fields.phone = form.phone
    if (form.email !== lead.email)           fields.email = form.email
    if (form.insurance !== lead.insurance)   fields.insurance = form.insurance
    if (form.status !== lead.status)         fields.status = form.status
    if (form.notes !== (lead.notes || ''))   fields.notes = form.notes

    if (Object.keys(fields).length === 0) { setSaving(false); return }

    try {
      await updateLeadProfile(lead.id, fields, 'admin')
      onLeadUpdate(lead.id, fields)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleLog() {
    if (showLog) { setShowLog(false); return }
    setShowLog(true)
    if (activity.length > 0) return
    setLoadingLog(true)
    try {
      const res = await getLeadActivity(lead.id)
      setActivity(res.entries || [])
    } catch (err) {
      setActivity([{ action: 'error', notes: err.message, timestamp: '' }])
    } finally {
      setLoadingLog(false)
    }
  }

  return (
    <tr>
      <td colSpan={99} className="px-4 pb-4 pt-0 bg-slate-800/60 border-b border-slate-700">
        <div className="grid grid-cols-2 gap-3 mt-3 md:grid-cols-3">
          <Field label="Owner Name" value={form.owner_name} onChange={v => setForm(f => ({ ...f, owner_name: v }))} />
          <Field label="Phone"      value={form.phone}      onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="(000) 000-0000" />
          <Field label="Email"      value={form.email}      onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="email@domain.com" />
          <Field label="Insurance"  value={form.insurance}  onChange={v => setForm(f => ({ ...f, insurance: v }))} placeholder="State Farm, Allstate…" />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500 uppercase tracking-wide">Lead Status</label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="">— No Status —</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="text-xs text-slate-500 self-end pb-2">
            {lead.roof_age && <div>Roof age: {lead.roof_age}</div>}
            {lead.bucket   && <div className={bucketColor(lead.bucket)}>Bucket: {lead.bucket}</div>}
            {lead.job_type && <div>Job type: {lead.job_type}</div>}
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <label className="text-xs text-slate-500 uppercase tracking-wide">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Current notes…"
            rows={3}
            className="bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none placeholder:text-slate-600"
          />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
          </button>
          <button
            onClick={handleToggleLog}
            className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg transition-colors ${showLog ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
          >
            <ClipboardList size={14} />
            Log
          </button>
        </div>

        {showLog && (
          <div className="mt-3 bg-slate-900 rounded-lg p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Activity Log</div>
            {loadingLog && <div className="text-slate-500 text-xs">Loading…</div>}
            {!loadingLog && activity.length === 0 && (
              <div className="text-slate-600 text-xs">No activity recorded for this lead.</div>
            )}
            {!loadingLog && activity.length > 0 && (
              <div className="flex flex-col gap-2 max-h-48 overflow-auto">
                {activity.map((entry, i) => (
                  <div key={i} className="flex gap-3 text-xs">
                    <div className="text-slate-600 whitespace-nowrap shrink-0 w-28">{entry.timestamp}</div>
                    <div className="text-slate-400 shrink-0 w-20">{ACTION_LABELS[entry.action] || entry.action}</div>
                    <div className="text-slate-300">{entry.notes || entry.status || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className="bg-slate-900 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
      />
    </div>
  )
}

// ── Assign dropdown ────────────────────────────────────────────────────────

function AssignCell({ lead, reps, onAssign, onUnassign, assigning }) {
  const [open, setOpen] = useState(false)

  if (assigning) return <span className="text-slate-500 text-xs">Saving…</span>

  return (
    <div className="relative inline-block" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
      >
        {lead.assigned_rep || 'Unassigned'}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl min-w-44 overflow-hidden">
          {lead.assigned_rep_id && (
            <button
              onClick={() => { setOpen(false); onUnassign(lead) }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-800 transition-colors border-b border-slate-700"
            >
              Unassign
            </button>
          )}
          {reps.map(rep => (
            <button
              key={rep.id}
              onClick={() => { setOpen(false); onAssign(lead, rep) }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 transition-colors ${lead.assigned_rep_id === rep.id ? 'text-blue-400' : 'text-slate-200'}`}
            >
              {rep.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared lead table ──────────────────────────────────────────────────────

function LeadTable({ leads, reps, expandedId, setExpandedId, assigning, onAssign, onUnassign, onLeadUpdate, showZip = false }) {
  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[480px]">
        <thead>
          <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide bg-slate-900">
            <th className="text-left px-4 py-3 w-6"></th>
            <th className="text-left px-4 py-3">Address</th>
            {showZip && <th className="text-left px-4 py-3">ZIP</th>}
            <th className="text-left px-4 py-3 hidden md:table-cell">Bucket</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Assigned To</th>
          </tr>
        </thead>
        <tbody>
          {leads.map(lead => {
            const isExpanded = expandedId === lead.id
            return (
              <Fragment key={lead.id}>
                <tr
                  onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  className={`border-b border-slate-800/60 cursor-pointer select-none transition-colors ${isExpanded ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'}`}
                >
                  <td className="px-4 py-3 text-slate-600">
                    <ChevronRight size={14} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-100 font-medium">{lead.address || '—'}</div>
                    {lead.owner_name && <div className="text-slate-500 text-xs mt-0.5">{lead.owner_name}</div>}
                  </td>
                  {showZip && (
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">{lead.zip || '—'}</td>
                  )}
                  <td className={`px-4 py-3 text-xs font-medium hidden md:table-cell ${bucketColor(lead.bucket)}`}>
                    {lead.bucket || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {lead.status
                      ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(lead.status)}`}>{lead.status}</span>
                      : <span className="text-slate-600 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <AssignCell
                      lead={lead}
                      reps={reps}
                      onAssign={onAssign}
                      onUnassign={onUnassign}
                      assigning={assigning === lead.id}
                    />
                  </td>
                </tr>
                {isExpanded && (
                  <LeadProfile
                    lead={lead}
                    reps={reps}
                    onClose={() => setExpandedId(null)}
                    onLeadUpdate={onLeadUpdate}
                  />
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── State persistence ──────────────────────────────────────────────────────

const LEADS_KEY = 'ploks_leads_state'
function saveLeadsState(s) {
  try { sessionStorage.setItem(LEADS_KEY, JSON.stringify(s)) } catch {}
}
function loadLeadsState() {
  try { return JSON.parse(sessionStorage.getItem(LEADS_KEY) || '{}') } catch { return {} }
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState(() => loadLeadsState().tab || 'zip')

  // Shared
  const [zips, setZips] = useState([])
  const [zipCounts, setZipCounts] = useState({})
  const [reps, setReps] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState(() => loadLeadsState().status || '')
  const [search, setSearch] = useState(() => loadLeadsState().search || '')
  const [expandedId, setExpandedId] = useState(null)
  const [assigning, setAssigning] = useState(null)

  // ZIP tab
  const [selectedZip, setSelectedZip] = useState(() => loadLeadsState().zip || '')
  const [filterRep, setFilterRep] = useState(() => loadLeadsState().filterRep || '')

  // Reps tab
  const [selectedRepId, setSelectedRepId] = useState(() => loadLeadsState().rep || '')

  useEffect(() => {
    async function loadMeta() {
      try {
        const [zipRes, repRes, countRes] = await Promise.all([getZipList(), getAllReps(), getAdminZipStats()])
        setZips(zipRes.zips || [])
        setReps(repRes.reps || [])
        setZipCounts(countRes.counts || {})
      } catch (err) {
        setError('Failed to load: ' + err.message)
      } finally {
        setLoadingMeta(false)
      }
    }
    loadMeta()
  }, [])

  // On mount: restore leads for the previously selected ZIP or rep
  useEffect(() => {
    if (activeTab === 'zip' && selectedZip) loadLeads(selectedZip)
    else if (activeTab === 'reps' && selectedRepId) loadRepLeads(selectedRepId)
  }, []) // intentionally empty — runs once on mount to restore session

  // Persist filter state so it survives navigating away and back
  useEffect(() => {
    saveLeadsState({ tab: activeTab, zip: selectedZip, rep: selectedRepId, status: filterStatus, filterRep, search })
  }, [activeTab, selectedZip, selectedRepId, filterStatus, filterRep, search])

  // All ZIPs sorted by assigned-lead count desc, then alphabetically
  const zipOptions = useMemo(() =>
    [...zips]
      .map(z => [z, zipCounts[z] || 0])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  , [zips, zipCounts])

  function resetFilters() {
    setSearch(''); setFilterStatus(''); setFilterRep(''); setExpandedId(null)
  }

  async function loadLeads(zip) {
    if (!zip) return
    setLoading(true); setError(''); setLeads([]); setExpandedId(null)
    try {
      const res = await getAllLeads(zip)
      setLeads(res.leads || [])
    } catch (err) {
      setError('Failed to load leads: ' + err.message)
    } finally { setLoading(false) }
  }

  async function loadRepLeads(repId) {
    if (!repId) return
    setLoading(true); setError(''); setLeads([]); setExpandedId(null)
    try {
      const res = await getLeadsForRep(repId)
      setLeads(res.leads || [])
    } catch (err) {
      setError('Failed to load leads: ' + err.message)
    } finally { setLoading(false) }
  }

  function handleZipChange(zip) {
    setSelectedZip(zip); resetFilters()
    loadLeads(zip)
  }

  function handleRepChange(repId) {
    setSelectedRepId(repId); resetFilters()
    loadRepLeads(repId)
  }

  function handleTabSwitch(tab) {
    setActiveTab(tab)
    setLeads([]); setError(''); resetFilters()
    if (tab === 'zip') { setSelectedRepId('') }
    if (tab === 'reps') { setSelectedZip('') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      if (filterStatus && l.status !== filterStatus) return false
      if (activeTab === 'zip') {
        if (filterRep === '__unassigned' && l.assigned_rep_id) return false
        if (filterRep && filterRep !== '__unassigned' && l.assigned_rep_id !== filterRep) return false
      }
      if (q && !l.address.toLowerCase().includes(q) && !(l.owner_name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [leads, filterStatus, filterRep, search, activeTab])

  async function handleAssign(lead, rep) {
    setAssigning(lead.id)
    try {
      await assignLead(lead.id, rep.id, rep.name, lead.zip)
      setLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, assigned_rep: rep.name, assigned_rep_id: rep.id } : l
      ))
    } catch (err) {
      alert('Assign failed: ' + err.message)
    } finally { setAssigning(null) }
  }

  async function handleUnassign(lead) {
    setAssigning(lead.id)
    try {
      await unassignLead(lead.id, lead.zip)
      setLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, assigned_rep: '', assigned_rep_id: '' } : l
      ))
    } catch (err) {
      alert('Unassign failed: ' + err.message)
    } finally { setAssigning(null) }
  }

  function handleLeadUpdate(leadId, fields) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...fields } : l))
  }

  const selectedRep = reps.find(r => r.id === selectedRepId)
  const refreshActive = activeTab === 'zip' ? () => loadLeads(selectedZip) : () => loadRepLeads(selectedRepId)
  const hasSelection = activeTab === 'zip' ? !!selectedZip : !!selectedRepId

  return (
    <div className="p-3 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 md:mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Leads</h1>
          {hasSelection && !loading && (
            <p className="text-slate-400 text-sm mt-0.5">
              {filtered.length} of {leads.length} leads
              {activeTab === 'zip' && selectedZip ? ` in ZIP ${selectedZip}` : ''}
              {activeTab === 'reps' && selectedRep ? ` for ${selectedRep.name}` : ''}
            </p>
          )}
        </div>
        {hasSelection && (
          <button onClick={refreshActive} disabled={loading} className="text-slate-400 hover:text-slate-200">
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-slate-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => handleTabSwitch('zip')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'zip' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <MapPin size={14} /> ZIP
        </button>
        <button
          onClick={() => handleTabSwitch('reps')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'reps' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Users size={14} /> Reps
        </button>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        {activeTab === 'zip' && (
          <select
            value={selectedZip}
            onChange={e => handleZipChange(e.target.value)}
            disabled={loadingMeta}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-40"
          >
            <option value="">{loadingMeta ? 'Loading ZIPs…' : 'Select ZIP'}</option>
            {zipOptions.map(([z, count]) => (
              <option key={z} value={z}>{count > 0 ? `${z} (${count})` : z}</option>
            ))}
          </select>
        )}

        {activeTab === 'reps' && (
          <select
            value={selectedRepId}
            onChange={e => handleRepChange(e.target.value)}
            disabled={loadingMeta}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-48"
          >
            <option value="">{loadingMeta ? 'Loading reps…' : 'Select a rep…'}</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}

        {hasSelection && (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search address or owner…"
              className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 w-52 placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {activeTab === 'zip' && (
              <select
                value={filterRep}
                onChange={e => setFilterRep(e.target.value)}
                className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
              >
                <option value="">All Reps</option>
                <option value="__unassigned">Unassigned</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </>
        )}
      </div>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      {/* Empty states */}
      {!hasSelection && !loadingMeta && activeTab === 'zip' && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <MapPin size={32} className="text-slate-600 mb-3" />
          <div className="text-slate-400 text-sm font-medium">Select a ZIP code to load leads</div>
          <div className="text-slate-600 text-xs mt-1">{zips.length} territories available</div>
        </div>
      )}
      {!hasSelection && !loadingMeta && activeTab === 'reps' && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users size={32} className="text-slate-600 mb-3" />
          <div className="text-slate-400 text-sm font-medium">Select a rep to view their leads</div>
          <div className="text-slate-600 text-xs mt-1">{reps.length} reps active</div>
        </div>
      )}

      {loading && (
        <div className="text-slate-400 text-sm">
          Loading leads{activeTab === 'zip' ? ` for ZIP ${selectedZip}` : selectedRep ? ` for ${selectedRep.name}` : ''}…
        </div>
      )}

      {!loading && hasSelection && filtered.length === 0 && (
        <div className="text-slate-500 text-sm">No leads match the current filters.</div>
      )}

      {!loading && filtered.length > 0 && (
        <LeadTable
          leads={filtered}
          reps={reps}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          assigning={assigning}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onLeadUpdate={handleLeadUpdate}
          showZip={activeTab === 'reps'}
        />
      )}
    </div>
  )
}
