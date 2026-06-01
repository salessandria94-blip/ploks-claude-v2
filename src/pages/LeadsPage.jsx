import { useState, useEffect, useMemo, Fragment } from 'react'
import { getAllLeads, getZipList, getAllReps, assignLead, unassignLead, updateLeadProfile } from '../api/sheets.js'
import { RefreshCw, ChevronDown, MapPin, ChevronRight } from 'lucide-react'

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

function LeadProfile({ lead, reps, onClose, onLeadUpdate }) {
  const [form, setForm] = useState({
    owner_name: lead.owner_name || '',
    phone:      lead.phone || '',
    email:      lead.email || '',
    insurance:  lead.insurance || '',
    status:     lead.status || '',
    note:       '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    const fields = {}
    if (form.owner_name !== lead.owner_name) fields.owner_name = form.owner_name
    if (form.phone !== lead.phone)           fields.phone = form.phone
    if (form.email !== lead.email)           fields.email = form.email
    if (form.insurance !== lead.insurance)   fields.insurance = form.insurance
    if (form.status !== lead.status)         fields.status = form.status
    if (form.note.trim())                    fields.notes = form.note.trim()

    if (Object.keys(fields).length === 0) { setSaving(false); return }

    try {
      await updateLeadProfile(lead.id, fields)
      onLeadUpdate(lead.id, { ...fields, notes: lead.notes, note: '' })
      setForm(f => ({ ...f, note: '' }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td colSpan={5} className="px-4 pb-4 pt-0 bg-slate-800/60 border-b border-slate-700">
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

        {lead.notes && (
          <div className="mt-3 text-xs text-slate-400 bg-slate-900 rounded-lg p-3 whitespace-pre-wrap max-h-24 overflow-auto">
            {lead.notes}
          </div>
        )}

        <div className="mt-3 flex flex-col gap-1">
          <label className="text-xs text-slate-500 uppercase tracking-wide">Add Note</label>
          <textarea
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Type a note…"
            rows={2}
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
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-sm">
            Collapse
          </button>
        </div>
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

// ── Main page ──────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [zips, setZips] = useState([])
  const [reps, setReps] = useState([])
  const [selectedZip, setSelectedZip] = useState('')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterRep, setFilterRep] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [assigning, setAssigning] = useState(null)

  useEffect(() => {
    async function loadMeta() {
      try {
        const [zipRes, repRes] = await Promise.all([getZipList(), getAllReps()])
        setZips(zipRes.zips || [])
        setReps(repRes.reps || [])
      } catch (err) {
        setError('Failed to load: ' + err.message)
      } finally {
        setLoadingMeta(false)
      }
    }
    loadMeta()
  }, [])

  async function loadLeads(zip) {
    if (!zip) return
    setLoading(true)
    setError('')
    setLeads([])
    setExpandedId(null)
    try {
      const res = await getAllLeads({ zip })
      setLeads(res.leads || [])
    } catch (err) {
      setError('Failed to load leads: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleZipChange(zip) {
    setSelectedZip(zip)
    setSearch('')
    setFilterRep('')
    setFilterStatus('')
    loadLeads(zip)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      if (filterStatus && l.status !== filterStatus) return false
      if (filterRep === '__unassigned' && l.assigned_rep_id) return false
      if (filterRep && filterRep !== '__unassigned' && l.assigned_rep_id !== filterRep) return false
      if (q && !l.address.toLowerCase().includes(q) && !(l.owner_name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [leads, filterStatus, filterRep, search])

  async function handleAssign(lead, rep) {
    setAssigning(lead.id)
    try {
      await assignLead(lead.id, rep.id, rep.name)
      setLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, assigned_rep: rep.name, assigned_rep_id: rep.id } : l
      ))
    } catch (err) {
      alert('Assign failed: ' + err.message)
    } finally {
      setAssigning(null)
    }
  }

  async function handleUnassign(lead) {
    setAssigning(lead.id)
    try {
      await unassignLead(lead.id)
      setLeads(prev => prev.map(l =>
        l.id === lead.id ? { ...l, assigned_rep: '', assigned_rep_id: '' } : l
      ))
    } catch (err) {
      alert('Unassign failed: ' + err.message)
    } finally {
      setAssigning(null)
    }
  }

  function handleLeadUpdate(leadId, fields) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...fields } : l))
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Leads</h1>
          {selectedZip && !loading && (
            <p className="text-slate-400 text-sm mt-0.5">{filtered.length} of {leads.length} leads in ZIP {selectedZip}</p>
          )}
        </div>
        {selectedZip && (
          <button onClick={() => loadLeads(selectedZip)} disabled={loading} className="text-slate-400 hover:text-slate-200">
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={selectedZip}
          onChange={e => handleZipChange(e.target.value)}
          disabled={loadingMeta}
          className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 min-w-40"
        >
          <option value="">{loadingMeta ? 'Loading ZIPs…' : 'Select a ZIP code'}</option>
          {zips.map(z => <option key={z} value={z}>{z}</option>)}
        </select>

        {selectedZip && (
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
            <select
              value={filterRep}
              onChange={e => setFilterRep(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Reps</option>
              <option value="__unassigned">Unassigned</option>
              {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </>
        )}
      </div>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      {!selectedZip && !loadingMeta && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <MapPin size={32} className="text-slate-600 mb-3" />
          <div className="text-slate-400 text-sm font-medium">Select a ZIP code to load leads</div>
          <div className="text-slate-600 text-xs mt-1">{zips.length} territories available</div>
        </div>
      )}

      {loading && <div className="text-slate-400 text-sm">Loading leads for ZIP {selectedZip}…</div>}

      {!loading && selectedZip && filtered.length === 0 && (
        <div className="text-slate-500 text-sm">No leads match the current filters.</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide bg-slate-900">
                <th className="text-left px-4 py-3 w-6"></th>
                <th className="text-left px-4 py-3">Address</th>
                <th className="text-left px-4 py-3">Bucket</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => {
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
                      <td className={`px-4 py-3 text-xs font-medium ${bucketColor(lead.bucket)}`}>
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
                          onAssign={handleAssign}
                          onUnassign={handleUnassign}
                          assigning={assigning === lead.id}
                        />
                      </td>
                    </tr>
                    {isExpanded && (
                      <LeadProfile
                        lead={lead}
                        reps={reps}
                        onClose={() => setExpandedId(null)}
                        onLeadUpdate={handleLeadUpdate}
                      />
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
