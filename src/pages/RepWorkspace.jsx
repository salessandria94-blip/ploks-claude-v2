import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  SATELLITE_TILE, JACKSONVILLE_CENTER, leadIcon, FitBounds, CenterOnLead, ClickToClear, DrawTool,
  COLOR_OPEN, COLOR_OTHERS, COLOR_MINE, COLOR_SELECTED,
} from '../components/mapTools.jsx'
import {
  validatePin, getAllReps, getZipList, getAllLeads, getLeadsForRep, claimLead, unassignLead,
  updateLeadStatus, updateLeadProfile, getLeadActivity, assignLead,
  claimLeadsBulk, unassignLeadsBulk,
} from '../api/sheets.js'
import { LayoutDashboard, Map as MapIcon, List, FileText, Calendar, LogOut, X, Navigation, Lasso, Target, Loader2, ClipboardList, RefreshCw } from 'lucide-react'

const STATUSES = ['No Contact', 'Contacted', 'Working', 'Closed']
const STORE_KEY = 'ploks_rep_v2'
const ACTION_LABELS = {
  admin_assign: 'Assigned', admin_unassign: 'Unassigned', status_update: 'Status changed',
  claim: 'Claimed', bulk_claim: 'Claimed', unassign: 'Unassigned', bulk_unassign: 'Released',
  note: 'Note', edit: 'Edited', auto_recycle: 'Recycled', event: 'Event',
}

function relationOf(lead, repId) {
  if (lead.assigned_rep_id && String(lead.assigned_rep_id) === String(repId)) return 'mine'
  if (lead.assigned_rep_id) return 'others'
  return 'open'
}
function colorFor(rel, selected) {
  if (selected) return COLOR_SELECTED
  if (rel === 'mine') return COLOR_MINE
  if (rel === 'others') return COLOR_OTHERS
  return COLOR_OPEN
}
function openNavigate(lead) {
  const addr = encodeURIComponent(`${lead.address} ${lead.zip}`)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  window.open(isIOS ? `maps://?q=${addr}` : `https://maps.google.com/?q=${addr}`, '_blank')
}

// ── Lifecycle helpers (client-side, from the timestamps the API returns) ──────
const DAY_MS = 86400000
function daysSince(ts) { return ts ? (Date.now() - new Date(ts).getTime()) / DAY_MS : null }
// Contacted for 30–90 days = sitting in follow-up.
function isFollowup(l) {
  if ((l.status || '').toLowerCase() !== 'contacted') return false
  const d = daysSince(l.status_changed_at)
  return d != null && d > 30 && d <= 90
}
// No-Contact claims auto-release at 7 days; surface how many remain.
function expiresInDays(l) {
  const s = (l.status || '').toLowerCase()
  if (s && s !== 'no contact') return null
  const d = daysSince(l.claimed_at)
  if (d == null) return null
  return Math.max(0, Math.ceil(7 - d))
}
function statusBadgeClass(s) {
  const u = (s || '').toLowerCase()
  if (u === 'closed') return 'bg-green-900 text-green-300'
  if (u === 'working') return 'bg-yellow-900 text-yellow-300'
  if (u === 'contacted') return 'bg-blue-900 text-blue-300'
  return 'bg-slate-700 text-slate-300'
}

// ── Login ─────────────────────────────────────────────────────────────────

function RepLogin({ lockedSlug, onUnlock }) {
  const [reps, setReps] = useState([])
  const [slug, setSlug] = useState(lockedSlug || '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (lockedSlug) return
    getAllReps().then(r => setReps(r.reps || [])).catch(() => setError('Could not load reps'))
  }, [lockedSlug])

  async function submit(nextPin) {
    if (!slug) { setError('Pick your name first'); setPin(''); return }
    setLoading(true)
    try {
      const res = await validatePin(slug, nextPin)
      if (res.ok) onUnlock(res.rep)
      else { setError('Wrong PIN'); setPin('') }
    } catch (e) {
      setError(e.message || 'Connection error'); setPin('')
    } finally { setLoading(false) }
  }

  function key(k) {
    if (loading) return
    if (k === 'del') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) submit(next)
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-5 p-6">
      <div className="text-blue-400 font-bold text-2xl tracking-wide">PLOKS</div>

      {!lockedSlug && (
        <select
          value={slug}
          onChange={e => { setSlug(e.target.value); setError('') }}
          className="bg-slate-800 border border-slate-700 text-slate-100 text-base rounded-xl px-4 py-3 w-64 focus:outline-none focus:border-blue-500"
        >
          <option value="">Select your name…</option>
          {reps.map(r => <option key={r.id} value={r.slug}>{r.name}</option>)}
        </select>
      )}
      {lockedSlug && <div className="text-slate-300 text-sm">Welcome, {lockedSlug}</div>}

      <div className="flex gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${pin.length > i ? 'border-blue-500 bg-blue-900 text-white' : 'border-slate-700 bg-slate-900 text-slate-600'}`}>
            {pin.length > i ? '●' : ''}
          </div>
        ))}
      </div>
      {loading && <div className="text-blue-400 text-sm">Checking…</div>}
      {error && <div className="text-red-400 text-sm">{error}</div>}

      <div className="grid grid-cols-3 gap-3 w-56">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (
          <button
            key={i}
            onClick={() => k && key(k)}
            disabled={!k || loading}
            className={`h-14 rounded-xl text-lg font-semibold transition-colors ${k === 'del' ? 'bg-slate-700 text-slate-300 active:bg-slate-600' : k ? 'bg-slate-800 text-white active:bg-slate-700' : 'invisible'}`}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Map tab ─────────────────────────────────────────────────────────────────

// Keep the Leaflet canvas correctly sized when the tab is shown or the
// bottom profile panel opens/closes.
function MapResizer({ active, panelOpen }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 160)
    return () => clearTimeout(t)
  }, [active, panelOpen, map])
  return null
}

function RepMap({ rep, active }) {
  const [zips, setZips] = useState([])
  const [reps, setReps] = useState([])
  const [selectedZip, setSelectedZip] = useState('')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [tool, setTool] = useState(null)
  const [busy, setBusy] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => { getZipList().then(r => setZips(r.zips || [])).catch(() => {}) }, [])
  useEffect(() => { getAllReps().then(r => setReps(r.reps || [])).catch(() => {}) }, [])

  const selectedIds = useMemo(() => new Set(selectedLeads.map(l => l.id)), [selectedLeads])
  const geoLeads = useMemo(() => leads.filter(l => l.lat && l.lng), [leads])
  const panelOpen = !!selectedLead && selectedLeads.length === 0

  async function loadZip(zip) {
    setSelectedZip(zip)
    setSelectedLead(null); setSelectedLeads([]); setError('')
    if (!zip) { setLeads([]); return }
    setLoading(true)
    try {
      const res = await getAllLeads(zip)
      setLeads(res.leads || [])
    } catch (err) {
      setError(err.message)
    } finally { setLoading(false) }
  }

  function patchLead(id, patch) {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
    setSelectedLead(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev))
    setSelectedLeads(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
  }

  function handleMarkerClick(lead) {
    if (tool) return
    setSelectedLeads([])
    setSelectedLead(lead)
  }
  const handleAreaSelect = useCallback(sel => { setSelectedLead(null); setSelectedLeads(sel) }, [])

  async function claimOne(lead) {
    setBusy(lead.id)
    try {
      await claimLead(lead.id, rep.id, rep.name, null, lead.zip)
      patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id, status: lead.status || 'No Contact' })
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }
  async function releaseOne(lead) {
    setBusy(lead.id)
    try {
      await unassignLead(lead.id, lead.zip)
      patchLead(lead.id, { assigned_rep: '', assigned_rep_id: '', status: '' })
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }
  async function setStatus(lead, status) {
    setBusy(lead.id)
    try {
      await updateLeadStatus(lead.id, status, '', rep.id, lead.zip)
      patchLead(lead.id, { status })
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }
  async function saveProfile(lead, fields) {
    // notes is the current value (replace); a stamped snapshot is logged server-side
    await updateLeadProfile(lead.id, fields, rep.id)
    patchLead(lead.id, fields)
  }
  async function transfer(lead, toRep) {
    setBusy(lead.id)
    try {
      await assignLead(lead.id, toRep.id, toRep.name, lead.zip)
      patchLead(lead.id, { assigned_rep: toRep.name, assigned_rep_id: toRep.id })
      setSelectedLead(null)
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }

  async function bulkClaim(targets) {
    setBulkBusy(true); setError('')
    try {
      const res = await claimLeadsBulk(targets.map(l => l.id), rep.id, rep.name, selectedZip)
      const claimed = new Set(res.claimed || [])
      setLeads(prev => prev.map(l => (claimed.has(l.id)
        ? { ...l, assigned_rep: rep.name, assigned_rep_id: rep.id, status: l.status || 'No Contact' }
        : l)))
      const failed = targets.length - claimed.size
      if (failed > 0) setError(`${claimed.size} claimed, ${failed} skipped (already taken or cap).`)
    } catch (err) { setError(err.message) }
    finally { setBulkBusy(false); setSelectedLeads([]) }
  }
  async function bulkRelease(targets) {
    setBulkBusy(true); setError('')
    try {
      const res = await unassignLeadsBulk(targets.map(l => l.id), rep.id, selectedZip)
      const released = new Set(res.released || [])
      setLeads(prev => prev.map(l => (released.has(l.id)
        ? { ...l, assigned_rep: '', assigned_rep_id: '', status: '' }
        : l)))
    } catch (err) { setError(err.message) }
    finally { setBulkBusy(false); setSelectedLeads([]) }
  }

  const mineCount = geoLeads.filter(l => relationOf(l, rep.id) === 'mine').length
  const openCount = geoLeads.filter(l => relationOf(l, rep.id) === 'open').length
  const selOpen = selectedLeads.filter(l => relationOf(l, rep.id) === 'open')
  const selMine = selectedLeads.filter(l => relationOf(l, rep.id) === 'mine')

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0 flex items-center gap-2">
        <select
          value={selectedZip}
          onChange={e => loadZip(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 flex-1 focus:outline-none focus:border-blue-500"
        >
          <option value="">Select a ZIP…</option>
          {zips.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        {loading && <Loader2 size={16} className="animate-spin text-blue-400" />}
        {selectedZip && !loading && (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            <span className="text-blue-400">{openCount}</span>/<span className="text-green-400">{mineCount}</span>
          </span>
        )}
      </div>

      {error && <div className="text-red-400 text-xs px-3 py-1.5 bg-red-950/30 shrink-0">{error}</div>}

      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <MapContainer center={JACKSONVILLE_CENTER} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
          <FitBounds leads={geoLeads} />
          <CenterOnLead lead={selectedLead} />
          <MapResizer active={active} panelOpen={panelOpen} />
          <ClickToClear enabled={!tool} onClear={() => { setSelectedLead(null); setSelectedLeads([]) }} />
          <DrawTool tool={tool} leads={geoLeads} onSelect={handleAreaSelect} />
          {geoLeads.map(lead => {
            const rel = relationOf(lead, rep.id)
            const sel = selectedIds.has(lead.id) || (selectedLead && selectedLead.id === lead.id)
            return (
              <Marker
                key={lead.id}
                position={[lead.lat, lead.lng]}
                icon={leadIcon(colorFor(rel, sel), sel)}
                eventHandlers={{ click: () => handleMarkerClick(lead) }}
              />
            )
          })}
        </MapContainer>

        {/* Legend */}
        <div className="absolute top-2 left-2 z-[999] bg-slate-900/90 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-300 space-y-1 pointer-events-none">
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_OPEN }} /> Open</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_MINE }} /> Mine</div>
          <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLOR_OTHERS }} /> Taken</div>
        </div>

        {/* Tools */}
        <div className="absolute top-2 right-2 z-[999] flex flex-col gap-2">
          <button
            onClick={() => setTool(t => (t === 'lasso' ? null : 'lasso'))}
            className={`p-2 rounded-lg border shadow-lg ${tool === 'lasso' ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-slate-900/90 border-slate-700 text-slate-300'}`}
          ><Lasso size={16} /></button>
          <button
            onClick={() => setTool(t => (t === 'radius' ? null : 'radius'))}
            className={`p-2 rounded-lg border shadow-lg ${tool === 'radius' ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-slate-900/90 border-slate-700 text-slate-300'}`}
          ><Target size={16} /></button>
        </div>

        {tool && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[999] bg-yellow-900/90 text-yellow-100 text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
            {tool === 'lasso' ? 'Draw a loop to select' : 'Drag out a circle to select'}
          </div>
        )}

        {!selectedZip && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 rounded-xl px-5 py-4 text-center">
              <MapIcon size={26} className="text-slate-600 mb-2 mx-auto" />
              <div className="text-slate-300 text-sm font-medium">Pick a ZIP to load leads</div>
            </div>
          </div>
        )}

        {/* Multi-select action bar */}
        {selectedLeads.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 z-[998] bg-slate-900 border-t border-slate-700 rounded-t-2xl p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-semibold text-sm">{selectedLeads.length} selected</div>
              <button onClick={() => setSelectedLeads([])} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
            </div>
            <div className="flex gap-2">
              {selOpen.length > 0 && (
                <button onClick={() => bulkClaim(selOpen)} disabled={bulkBusy}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold">
                  {bulkBusy ? 'Claiming…' : `Claim ${selOpen.length} open`}
                </button>
              )}
              {selMine.length > 0 && (
                <button onClick={() => bulkRelease(selMine)} disabled={bulkBusy}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold">
                  {bulkBusy ? 'Releasing…' : `Release ${selMine.length} mine`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected lead — full profile below the map */}
      {panelOpen && (
        <RepLeadProfile
          lead={selectedLead}
          rel={relationOf(selectedLead, rep.id)}
          reps={reps}
          meId={rep.id}
          busy={busy === selectedLead.id}
          onClose={() => setSelectedLead(null)}
          onClaim={() => claimOne(selectedLead)}
          onRelease={() => releaseOne(selectedLead)}
          onStatus={s => setStatus(selectedLead, s)}
          onSave={fields => saveProfile(selectedLead, fields)}
          onTransfer={toRep => transfer(selectedLead, toRep)}
          onNavigate={() => openNavigate(selectedLead)}
        />
      )}
    </div>
  )
}

function ProfileField({ label, value, onChange, placeholder, disabled }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        disabled={disabled}
        className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 disabled:opacity-60"
      />
    </div>
  )
}

function RepLeadProfile({ lead, rel, reps, meId, busy, variant = 'panel', onClose, onClaim, onRelease, onStatus, onSave, onTransfer, onNavigate }) {
  const editable = rel === 'open' || rel === 'mine'
  const transferReps = reps.filter(r => r.id !== meId)
  const [form, setForm] = useState({ owner_name: '', phone: '', email: '', insurance: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [activity, setActivity] = useState([])
  const [loadingLog, setLoadingLog] = useState(false)

  useEffect(() => {
    setForm({
      owner_name: lead.owner_name || '', phone: lead.phone || '',
      email: lead.email || '', insurance: lead.insurance || '', notes: lead.notes || '',
    })
    setLogOpen(false); setActivity([])
  }, [lead.id])

  async function handleSave() {
    const fields = {}
    if (form.owner_name !== (lead.owner_name || '')) fields.owner_name = form.owner_name
    if (form.phone !== (lead.phone || '')) fields.phone = form.phone
    if (form.email !== (lead.email || '')) fields.email = form.email
    if (form.insurance !== (lead.insurance || '')) fields.insurance = form.insurance
    if (form.notes !== (lead.notes || '')) fields.notes = form.notes
    if (Object.keys(fields).length === 0) return
    setSaving(true); setSaved(false)
    try {
      await onSave(fields)           // notes persist in the box (current value)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert('Save failed: ' + e.message) } finally { setSaving(false) }
  }

  async function openLog() {
    setLogOpen(true)
    setLoadingLog(true)
    try { const r = await getLeadActivity(lead.id); setActivity(r.entries || []) }
    catch (e) { setActivity([{ action: 'error', notes: e.message, timestamp: '' }]) }
    finally { setLoadingLog(false) }
  }
  const repName = id => (reps.find(r => r.id === id) || {}).name || id || 'System'

  return (
    <div
      className={variant === 'full'
        ? 'h-full overflow-auto bg-slate-900'
        : 'shrink-0 border-t border-slate-700 bg-slate-900 overflow-auto'}
      style={variant === 'full' ? undefined : { maxHeight: '55vh' }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-white font-semibold text-base leading-tight">{lead.address}</div>
            <div className="text-slate-400 text-xs mt-0.5">
              ZIP {lead.zip}{lead.roof_age ? ` · ${lead.roof_age} yr roof` : ''}{lead.job_type ? ` · ${lead.job_type}` : ''}
            </div>
            <div className="text-xs mt-1">
              {rel === 'mine' && <span className="text-green-400">Mine{lead.status ? ` · ${lead.status}` : ''}</span>}
              {rel === 'others' && <span className="text-orange-400">Claimed by {lead.assigned_rep}{lead.status ? ` · ${lead.status}` : ''}</span>}
              {rel === 'open' && <span className="text-blue-400">Open</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={18} /></button>
        </div>

        {/* Primary actions */}
        <div className="flex flex-wrap gap-2 mb-3">
          {rel === 'open' && (
            <button onClick={onClaim} disabled={busy} className="flex-1 min-w-28 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold">
              {busy ? 'Claiming…' : 'Claim lead'}
            </button>
          )}
          {rel === 'mine' && (
            <>
              <button onClick={onRelease} disabled={busy} className="bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-200 text-sm px-4 py-2.5 rounded-lg font-semibold">
                {busy ? '…' : 'Unassign'}
              </button>
              {transferReps.length > 0 && (
                <select
                  value=""
                  onChange={e => { const r = transferReps.find(x => x.id === e.target.value); if (r) onTransfer(r) }}
                  disabled={busy}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-sm px-3 py-2.5 rounded-lg disabled:opacity-50 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Transfer to…</option>
                  {transferReps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              )}
            </>
          )}
          <button onClick={onNavigate} className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white text-sm px-4 py-2.5 rounded-lg">
            <Navigation size={15} /> Navigate
          </button>
        </div>

        {/* Status quick buttons (mine) */}
        {rel === 'mine' && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {STATUSES.map(s => (
              <button key={s} onClick={() => onStatus(s)} disabled={busy}
                className={`text-xs px-2.5 py-1.5 rounded-lg font-medium disabled:opacity-50 ${lead.status === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Editable fields */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <ProfileField label="Owner" value={form.owner_name} onChange={v => setForm(f => ({ ...f, owner_name: v }))} disabled={!editable} />
          <ProfileField label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="(000) 000-0000" disabled={!editable} />
          <ProfileField label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="email@domain.com" disabled={!editable} />
          <ProfileField label="Insurance" value={form.insurance} onChange={v => setForm(f => ({ ...f, insurance: v }))} placeholder="Carrier" disabled={!editable} />
        </div>

        {/* Notes — current value, persists after save */}
        <div className="flex flex-col gap-1 mb-3">
          <label className="text-[11px] text-slate-500 uppercase tracking-wide">Notes</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Current notes…"
            rows={3}
            disabled={!editable}
            className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none placeholder:text-slate-600 disabled:opacity-60"
          />
        </div>

        {/* Save + Log */}
        <div className="flex items-center gap-3">
          {editable && (
            <button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium">
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
            </button>
          )}
          <button onClick={openLog} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300">
            <ClipboardList size={14} /> Log
          </button>
        </div>
      </div>

      {/* Log popup */}
      {logOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setLogOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="text-white font-semibold text-sm">Activity log</div>
              <button onClick={() => setLogOpen(false)} className="text-slate-500 hover:text-slate-300 p-1"><X size={18} /></button>
            </div>
            <div className="text-slate-500 text-xs px-4 pt-2">{lead.address}</div>
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              {loadingLog && <div className="text-slate-500 text-xs">Loading…</div>}
              {!loadingLog && activity.length === 0 && <div className="text-slate-600 text-sm">No activity recorded yet.</div>}
              {!loadingLog && activity.map((e, i) => (
                <div key={i} className="border-b border-slate-800 pb-2 last:border-0">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300 font-medium">{ACTION_LABELS[e.action] || e.action}</span>
                    <span className="text-slate-600">{e.timestamp}</span>
                  </div>
                  <div className="text-slate-500 text-xs mt-0.5">{repName(e.rep_id)}</div>
                  {(e.notes || e.status) && <div className="text-slate-300 text-sm mt-1 whitespace-pre-wrap">{e.notes || e.status}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Leads tab ────────────────────────────────────────────────────────────────

function RepLeads({ rep, active }) {
  const [leads, setLeads] = useState([])
  const [reps, setReps] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [sub, setSub] = useState('active') // active | followup | all
  const [openLead, setOpenLead] = useState(null)
  const [busy, setBusy] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try {
      const [lr, rr] = await Promise.all([getLeadsForRep(rep.id), getAllReps()])
      setLeads(lr.leads || [])
      setReps(rr.reps || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  // Load the first time the tab is opened, then keep it mounted.
  useEffect(() => { if (active && !loaded) { setLoaded(true); load() } }, [active, loaded]) // eslint-disable-line

  function patchLead(id, patch) {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)))
    setOpenLead(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev))
  }
  function removeLead(id) { setLeads(prev => prev.filter(l => l.id !== id)); setOpenLead(null) }

  async function onStatus(lead, status) {
    setBusy(lead.id)
    try { await updateLeadStatus(lead.id, status, '', rep.id, lead.zip); patchLead(lead.id, { status }) }
    catch (e) { alert(e.message) } finally { setBusy(null) }
  }
  async function onSave(lead, fields) { await updateLeadProfile(lead.id, fields, rep.id); patchLead(lead.id, fields) }
  async function onRelease(lead) {
    setBusy(lead.id)
    try { await unassignLead(lead.id, lead.zip); removeLead(lead.id) }
    catch (e) { alert(e.message) } finally { setBusy(null) }
  }
  async function onTransfer(lead, toRep) {
    setBusy(lead.id)
    try { await assignLead(lead.id, toRep.id, toRep.name, lead.zip); removeLead(lead.id) }
    catch (e) { alert(e.message) } finally { setBusy(null) }
  }

  const followupCount = leads.filter(isFollowup).length
  const list = sub === 'followup' ? leads.filter(isFollowup)
    : sub === 'all' ? leads
    : leads.filter(l => !isFollowup(l))

  if (openLead) {
    return (
      <RepLeadProfile
        variant="full"
        lead={openLead}
        rel="mine"
        reps={reps}
        meId={rep.id}
        busy={busy === openLead.id}
        onClose={() => setOpenLead(null)}
        onClaim={() => {}}
        onRelease={() => onRelease(openLead)}
        onStatus={s => onStatus(openLead, s)}
        onSave={fields => onSave(openLead, fields)}
        onTransfer={r => onTransfer(openLead, r)}
        onNavigate={() => openNavigate(openLead)}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        {['active', 'followup', 'all'].map(s => (
          <button key={s} onClick={() => setSub(s)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${sub === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
            {s === 'active' ? 'Active' : s === 'followup' ? `Follow-up${followupCount ? ` (${followupCount})` : ''}` : 'All'}
          </button>
        ))}
        <button onClick={load} disabled={loading} className="ml-auto text-slate-400 hover:text-slate-200">
          <RefreshCw size={15} className={loading ? 'animate-spin text-blue-400' : ''} />
        </button>
      </div>

      {error && <div className="text-red-400 text-xs px-3 py-1.5 bg-red-950/30 shrink-0">{error}</div>}

      <div className="flex-1 overflow-auto">
        {loading && <div className="text-slate-400 text-sm p-4">Loading your leads…</div>}
        {!loading && list.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">
            {sub === 'followup' ? 'No follow-ups right now.' : 'No leads yet — claim some on the Map.'}
          </div>
        )}
        {!loading && list.map(lead => {
          const exp = expiresInDays(lead)
          return (
            <button key={lead.id} onClick={() => setOpenLead(lead)}
              className="w-full text-left px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800/40 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-slate-100 text-sm font-medium truncate">{lead.address}</div>
                <div className="text-slate-500 text-xs mt-0.5">ZIP {lead.zip}{lead.owner_name ? ` · ${lead.owner_name}` : ''}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {exp != null && exp <= 2 && <span className="text-[11px] text-amber-400 whitespace-nowrap">⚠ {exp}d</span>}
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(lead.status)}`}>{lead.status || 'No Contact'}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Placeholder tabs ─────────────────────────────────────────────────────────

function Placeholder({ title, lines }) {
  return (
    <div className="p-6 text-center flex flex-col items-center justify-center h-full">
      <div className="text-slate-300 font-semibold mb-2">{title}</div>
      <div className="text-slate-500 text-sm max-w-xs">{lines}</div>
    </div>
  )
}

// ── Shell ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'leads', label: 'Leads', icon: List },
  { id: 'docs', label: 'Docs', icon: FileText },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
]

export default function RepWorkspace() {
  const { repSlug } = useParams()
  const [rep, setRep] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') } catch { return null }
  })
  const [tab, setTab] = useState('map')

  function unlock(r) {
    setRep(r)
    try { localStorage.setItem(STORE_KEY, JSON.stringify(r)) } catch { /* noop */ }
  }
  function logout() {
    setRep(null)
    try { localStorage.removeItem(STORE_KEY) } catch { /* noop */ }
  }

  if (!rep) return <RepLogin lockedSlug={repSlug || ''} onUnlock={unlock} />

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="text-blue-400 font-bold tracking-wide">PLOKS</span>
          <span className="text-slate-400 text-xs">{rep.name}</span>
        </div>
        <button onClick={logout} className="text-slate-500 hover:text-slate-300 flex items-center gap-1 text-xs">
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {/* Tab nav */}
      <div className="flex shrink-0 bg-slate-900 border-b border-slate-800 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 min-w-16 flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${tab === id ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500'}`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>

      {/* Content — the map stays mounted so its ZIP + leads persist across tabs */}
      <div className="flex-1 min-h-0 relative">
        <div className={tab === 'map' ? 'h-full' : 'hidden'}>
          <RepMap rep={rep} active={tab === 'map'} />
        </div>
        <div className={tab === 'leads' ? 'h-full' : 'hidden'}>
          <RepLeads rep={rep} active={tab === 'leads'} />
        </div>
        {tab === 'dashboard' && <Placeholder title="Home" lines="Your cards land here next: Claims X/500, Expiring soon, Follow-ups, Pipeline." />}
        {tab === 'docs' && <Placeholder title="Documents" lines="Upload and access your documents here (coming soon)." />}
        {tab === 'calendar' && <Placeholder title="Calendar" lines="Reminders and follow-up due dates will show here (coming soon)." />}
      </div>
    </div>
  )
}
