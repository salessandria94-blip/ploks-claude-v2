import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  SATELLITE_TILE, JACKSONVILLE_CENTER, leadIcon, FitBounds, ClickToClear, DrawTool, pointInPolygon,
} from '../components/mapTools.jsx'
import {
  getAllReps, assignLead, unassignLead, updateLeadProfile, getLeadActivity,
  getAllAssignedLeads, getRepLocations, getLeadsNearPin, getLeadsInBounds,
} from '../api/sheets.js'
import {
  Map as MapIcon, List, X, Loader2, Lasso, Target, Menu, Navigation,
  ChevronDown, ClipboardList, LogOut, Trash2,
} from 'lucide-react'
import AddressSearch from '../components/AddressSearch.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  'no contact': '#22c55e',
  'contacted':  '#f59e0b',
  'working':    '#a855f7',
  'follow up':  '#f97316',
  'closed':     '#6b7280',
}
const SELECTED_COLOR = '#facc15'
const UNASSIGNED_COLOR = '#60a5fa'  // revealed-but-unassigned leads

const STATUS_LEGEND = [
  ['No Contact',  '#22c55e'],
  ['Contacted',   '#f59e0b'],
  ['Working',     '#a855f7'],
  ['Follow Up',   '#f97316'],
  ['Closed',      '#6b7280'],
  ['Unassigned',  '#60a5fa'],
]
const LEAD_STATUSES = ['No Contact', 'Contacted', 'Working', 'Follow Up', 'Closed']

// ── Icon helpers ──────────────────────────────────────────────────────────────

function repLocIcon(name) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return L.divIcon({
    className: '',
    html: `<div style="background:#0ea5e9;color:white;border:2.5px solid white;border-radius:50%;
      width:30px;height:30px;display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;
      box-shadow:0 0 0 3px rgba(14,165,233,0.35),0 2px 8px rgba(0,0,0,0.7);">${initials}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function pinColor(lead, selected) {
  if (selected) return SELECTED_COLOR
  if (!lead.assigned_rep_id) return UNASSIGNED_COLOR
  const key = (lead.status || 'no contact').toLowerCase()
  return STATUS_COLORS[key] || STATUS_COLORS['no contact']
}

const SEARCH_PIN = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.3 21.7 0 14 0z" fill="#ef4444" stroke="white" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize: [28, 40], iconAnchor: [14, 40],
})

// ── Leaflet helpers ───────────────────────────────────────────────────────────

function FlyToLocation({ coords }) {
  const map = useMap()
  useEffect(() => { if (coords) map.flyTo(coords, 17) }, [coords, map])
  return null
}

function FlyToRep({ target }) {
  const map = useMap()
  const prev = useRef(null)
  useEffect(() => {
    if (target && target !== prev.current) {
      prev.current = target
      map.flyTo([target.lat, target.lng], 14, { animate: true, duration: 1.5 })
    }
  }, [target, map])
  return null
}

function CenterAndResize({ focusLead, panelOpen }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 130)
    return () => clearTimeout(t)
  }, [panelOpen, map])
  useEffect(() => {
    if (!focusLead?.lat || !focusLead?.lng) return
    const t = setTimeout(() => {
      map.invalidateSize()
      map.setView([focusLead.lat, focusLead.lng], Math.max(map.getZoom(), 16), { animate: true })
    }, 150)
    return () => clearTimeout(t)
  }, [focusLead, map])
  return null
}

// ── Rep filter menu ───────────────────────────────────────────────────────────

function RepMenu({ reps, repFilter, onSelect, open, onToggle, repLocations, onFlyTo }) {
  const ref = useRef(null)
  const activeRepIds = new Set((repLocations || []).map(l => l.rep_id))

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onToggle() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  return (
    <div ref={ref} className="absolute top-3 left-3 z-[999]">
      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg text-sm font-medium transition-colors ${
          open || repFilter
            ? 'bg-blue-600 border-blue-500 text-white'
            : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
        }`}
      >
        <Menu size={15} />
        {repFilter ? repFilter.name : 'All Reps'}
        {repFilter && activeRepIds.has(repFilter.id) && (
          <Navigation size={12} className="text-green-400 fill-green-400" />
        )}
      </button>

      {open && (
        <div className="absolute top-11 left-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 min-w-56 max-h-80 overflow-y-auto">
          <button
            onClick={() => { onSelect(null); onToggle() }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium mb-0.5 ${
              !repFilter ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Reps
          </button>
          <div className="border-t border-slate-700/50 my-1" />
          {reps.map(rep => {
            const isLive = activeRepIds.has(rep.id)
            const loc = (repLocations || []).find(l => l.rep_id === rep.id)
            return (
              <button
                key={rep.id}
                onClick={() => {
                  onSelect(rep)
                  if (loc) onFlyTo({ lat: loc.lat, lng: loc.lng })
                  onToggle()
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  repFilter?.id === rep.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <span>{rep.name}</span>
                {isLive && (
                  <span className="flex items-center gap-1 shrink-0">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                    </span>
                    <Navigation size={11} className={repFilter?.id === rep.id ? 'text-white fill-white' : 'text-green-400 fill-green-400'} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Lead panels ───────────────────────────────────────────────────────────────

function PanelInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''}
        className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-slate-600" />
    </div>
  )
}

function AssignDropdown({ lead, reps, busy, onAssign, onUnassign }) {
  const [open, setOpen] = useState(false)
  const isAssigned = !!lead.assigned_rep_id
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={busy}
        className="w-full flex items-center justify-between gap-2 text-sm px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
        <span>{busy ? 'Saving…' : isAssigned ? `Reassign · ${lead.assigned_rep}` : 'Assign to rep'}</span>
        <ChevronDown size={14} />
      </button>
      {open && !busy && (
        <div className="absolute left-0 z-[999] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto top-12">
          {isAssigned && (
            <button onClick={() => { setOpen(false); onUnassign(lead) }}
              className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-slate-800 border-b border-slate-700">
              Unassign
            </button>
          )}
          {reps.map(r => (
            <button key={r.id} onClick={() => { setOpen(false); onAssign(lead, r) }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 ${lead.assigned_rep_id === r.id ? 'text-blue-400' : 'text-slate-200'}`}>
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SingleLeadPanel({ lead, reps, busy, onAssign, onUnassign, onClose, onLeadUpdate }) {
  const [form, setForm] = useState({ owner_name: '', phone: '', email: '', insurance: '', notes: '' })
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [activity, setActivity] = useState([])
  const [loadingLog, setLoadingLog] = useState(false)

  useEffect(() => {
    setForm({ owner_name: lead.owner_name || '', phone: lead.phone || '',
      email: lead.email || '', insurance: lead.insurance || '', notes: lead.notes || '' })
    setStatus(lead.status || '')
    setLogOpen(false); setActivity([])
  }, [lead.id])

  async function handleSave() {
    const fields = {}
    if (form.owner_name !== (lead.owner_name || '')) fields.owner_name = form.owner_name
    if (form.phone      !== (lead.phone || ''))      fields.phone      = form.phone
    if (form.email      !== (lead.email || ''))      fields.email      = form.email
    if (form.insurance  !== (lead.insurance || ''))  fields.insurance  = form.insurance
    if (form.notes      !== (lead.notes || ''))      fields.notes      = form.notes
    if (status          !== (lead.status || ''))     fields.status     = status
    if (!Object.keys(fields).length) return
    setSaving(true)
    try {
      await updateLeadProfile(lead.id, fields, 'manager')
      onLeadUpdate(lead.id, fields)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  async function openLog() {
    setLogOpen(v => !v)
    if (activity.length > 0 || logOpen) return
    setLoadingLog(true)
    try { const r = await getLeadActivity(lead.id); setActivity(r.entries || []) }
    catch (e) { setActivity([{ action: 'error', notes: e.message }]) }
    finally { setLoadingLog(false) }
  }

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900 overflow-auto" style={{ maxHeight: '55vh' }}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-white font-semibold text-base">{lead.address}</div>
            <div className="text-slate-400 text-xs mt-0.5">ZIP {lead.zip}{lead.roof_age ? ` · ${lead.roof_age} yr roof` : ''}</div>
            <div className="text-xs mt-0.5">
              {lead.assigned_rep
                ? <span className="text-orange-400">Assigned to {lead.assigned_rep}</span>
                : <span className="text-sky-400">Unassigned</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={18} /></button>
        </div>

        <div className="mb-3 max-w-xs">
          <AssignDropdown lead={lead} reps={reps} busy={busy} onAssign={onAssign} onUnassign={onUnassign} />
        </div>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {LEAD_STATUSES.map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium ${status === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <PanelInput label="Owner"     value={form.owner_name} onChange={v => setForm(f => ({ ...f, owner_name: v }))} />
          <PanelInput label="Phone"     value={form.phone}      onChange={v => setForm(f => ({ ...f, phone: v }))}      placeholder="(000) 000-0000" />
          <PanelInput label="Email"     value={form.email}      onChange={v => setForm(f => ({ ...f, email: v }))}      placeholder="email@domain.com" />
          <PanelInput label="Insurance" value={form.insurance}  onChange={v => setForm(f => ({ ...f, insurance: v }))}  placeholder="Carrier" />
        </div>

        <div className="flex flex-col gap-1 mb-3">
          <label className="text-[11px] text-slate-500 uppercase tracking-wide">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Current notes…" rows={3}
            className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 resize-none placeholder:text-slate-600" />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg font-medium">
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}
          </button>
          <button onClick={openLog} className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300">
            <ClipboardList size={14} /> Log
          </button>
        </div>

        {logOpen && (
          <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Activity — {lead.address}</div>
            {loadingLog && <div className="text-slate-500 text-xs">Loading…</div>}
            {!loadingLog && activity.length === 0 && <div className="text-slate-600 text-xs">No activity yet.</div>}
            {!loadingLog && activity.map((e, i) => (
              <div key={i} className="flex gap-3 text-xs border-b border-slate-800 pb-2 mb-2 last:border-0 last:mb-0">
                <div className="text-slate-600 whitespace-nowrap shrink-0 w-24">{e.timestamp}</div>
                <div className="text-slate-400 shrink-0 w-20">{e.action}</div>
                <div className="text-slate-300">{e.notes || e.status || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MultiSelectPanel({ leads, reps, bulkBusy, bulkProgress, onBulkAssign, onClear }) {
  const [repId, setRepId] = useState('')
  const rep = reps.find(r => r.id === repId)
  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900 max-h-72 overflow-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-semibold">{leads.length} leads selected</div>
          <button onClick={onClear} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm">
            <Trash2 size={14} /> Clear
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={repId} onChange={e => setRepId(e.target.value)} disabled={bulkBusy}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50">
            <option value="">Select a rep…</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button onClick={() => rep && onBulkAssign(leads, rep)} disabled={!rep || bulkBusy}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium">
            {bulkBusy ? `Assigning ${bulkProgress[0]}/${bulkProgress[1]}…` : `Assign all to ${rep ? rep.name : 'rep'}`}
          </button>
        </div>
        <div className="flex flex-col gap-1 max-h-32 overflow-auto text-xs">
          {leads.map(l => (
            <div key={l.id} className="flex justify-between gap-3 text-slate-400">
              <span className="truncate">{l.address}</span>
              <span className="shrink-0 text-slate-600">{l.assigned_rep || 'unassigned'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Manager Map ───────────────────────────────────────────────────────────────

function ManagerMap({ active }) {
  const [reps, setReps]               = useState([])
  const [allLeads, setAllLeads]       = useState([])   // all assigned leads (loaded on mount)
  const [repFilter, setRepFilter]     = useState(null)
  const [zipFilter, setZipFilter]     = useState('')
  const [loading, setLoading]         = useState(true)
  const [repLocations, setRepLocations] = useState([])
  const [repFlyTarget, setRepFlyTarget] = useState(null)
  const [menuOpen, setMenuOpen]       = useState(false)
  const [selectedLead, setSelectedLead]   = useState(null)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [tool, setTool]               = useState(null)
  const [busy, setBusy]               = useState(null)
  const [bulkBusy, setBulkBusy]       = useState(false)
  const [bulkProgress, setBulkProgress] = useState([0, 0])
  const [error, setError]             = useState('')
  const [flyTarget, setFlyTarget]     = useState(null)
  // Lasso reveal / geo-search
  const [geoLeads, setGeoLeads]       = useState([])   // unassigned leads revealed by lasso
  const [geoLoading, setGeoLoading]   = useState(false)
  const [geoAnchor, setGeoAnchor]     = useState(null) // { lat, lng, radiusM } for radius circle

  // Load reps + all assigned leads on mount
  useEffect(() => {
    async function init() {
      try {
        const [repRes, leadRes] = await Promise.all([getAllReps(), getAllAssignedLeads()])
        // Filter out the Sales Manager from assignable reps
        setReps((repRes.reps || []).filter(r => !r.is_manager))
        setAllLeads((leadRes.leads || []).filter(l => l.lat && l.lng))
      } catch (err) { setError('Failed to load: ' + err.message) }
      finally { setLoading(false) }
    }
    init()
  }, [])

  // Poll rep GPS locations every 60 s
  useEffect(() => {
    async function poll() {
      try { const r = await getRepLocations(); setRepLocations(r.locations || []) } catch { /* silent */ }
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => clearInterval(id)
  }, [])

  // ZIP options from current rep-filtered leads
  const zipOptions = useMemo(() => {
    const src = repFilter ? allLeads.filter(l => String(l.assigned_rep_id) === String(repFilter.id)) : allLeads
    const counts = {}
    src.forEach(l => { counts[l.zip] = (counts[l.zip] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))
  }, [allLeads, repFilter])

  // Assigned leads filtered by rep + zip
  const filteredLeads = useMemo(() => {
    let out = allLeads
    if (repFilter) out = out.filter(l => String(l.assigned_rep_id) === String(repFilter.id))
    if (zipFilter) out = out.filter(l => l.zip === zipFilter)
    return out
  }, [allLeads, repFilter, zipFilter])

  // Merge geo-search results with filtered leads (avoid duplicates)
  const filteredIds = useMemo(() => new Set(filteredLeads.map(l => l.id)), [filteredLeads])
  const displayLeads = useMemo(() => [
    ...filteredLeads,
    ...geoLeads.filter(l => !filteredIds.has(l.id) && l.lat && l.lng),
  ], [filteredLeads, geoLeads, filteredIds])

  const selectedIds = useMemo(() => new Set(selectedLeads.map(l => l.id)), [selectedLeads])

  function patchLead(leadId, patch) {
    setAllLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
    setGeoLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
    setSelectedLead(prev => prev?.id === leadId ? { ...prev, ...patch } : prev)
    setSelectedLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
  }

  function clearSelection() { setSelectedLead(null); setSelectedLeads([]) }
  function clearGeo() { setGeoLeads([]); setGeoAnchor(null) }

  function handleRepSelect(rep) {
    setRepFilter(rep); setZipFilter(''); clearSelection()
  }

  function handleMarkerClick(lead) {
    if (tool) return
    setSelectedLeads([])
    setSelectedLead(lead)
  }

  // Lasso / radius — select visible leads AND reveal hidden ones via geo-search
  const handleAreaSelect = useCallback((sel, geometry) => {
    setTool(null)
    setSelectedLead(null)
    setSelectedLeads(sel)  // select whatever was already visible

    if (!geometry) return
    setGeoLeads([]); setGeoAnchor(null); setGeoLoading(true)

    if (geometry.type === 'radius') {
      const miles = geometry.radiusM / 1609.34
      setGeoAnchor({ lat: geometry.center.lat, lng: geometry.center.lng, radiusM: geometry.radiusM })
      getLeadsNearPin(geometry.center.lat, geometry.center.lng, miles)
        .then(r => setGeoLeads((r.leads || []).filter(l => l.lat && l.lng)))
        .catch(() => {})
        .finally(() => setGeoLoading(false))
    } else {
      const lats = geometry.poly.map(p => p[0])
      const lngs = geometry.poly.map(p => p[1])
      getLeadsInBounds(Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs))
        .then(r => {
          const filtered = (r.leads || []).filter(l => l.lat && l.lng && pointInPolygon([l.lat, l.lng], geometry.poly))
          setGeoLeads(filtered)
        })
        .catch(() => {})
        .finally(() => setGeoLoading(false))
    }
  }, [])

  async function handleAssign(lead, rep) {
    setBusy(lead.id)
    try {
      await assignLead(lead.id, rep.id, rep.name, lead.zip)
      patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id })
      // If it was a geo lead, pull it into allLeads now
      if (!filteredIds.has(lead.id)) {
        setAllLeads(prev => [...prev, { ...lead, assigned_rep: rep.name, assigned_rep_id: rep.id }])
      }
    } catch (err) { alert('Assign failed: ' + err.message) }
    finally { setBusy(null) }
  }

  async function handleUnassign(lead) {
    setBusy(lead.id)
    try {
      await unassignLead(lead.id, lead.zip)
      setAllLeads(prev => prev.filter(l => l.id !== lead.id))
      setGeoLeads(prev => prev.map(l => l.id === lead.id ? { ...l, assigned_rep: '', assigned_rep_id: '' } : l))
      setSelectedLead(null)
    } catch (err) { alert('Unassign failed: ' + err.message) }
    finally { setBusy(null) }
  }

  async function handleBulkAssign(targets, rep) {
    setBulkBusy(true); setError('')
    setBulkProgress([0, targets.length])
    let done = 0, ok = 0
    await Promise.allSettled(targets.map(async lead => {
      try {
        await assignLead(lead.id, rep.id, rep.name, lead.zip)
        patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id })
        if (!filteredIds.has(lead.id)) {
          setAllLeads(prev => [...prev, { ...lead, assigned_rep: rep.name, assigned_rep_id: rep.id }])
        }
        ok++
      } finally { done++; setBulkProgress([done, targets.length]) }
    }))
    setBulkBusy(false)
    if (targets.length - ok > 0) setError(`${ok} assigned, ${targets.length - ok} failed.`)
    setSelectedLeads([])
  }

  const panelOpen = !!selectedLead || selectedLeads.length > 0
  const hasGeo = geoLeads.length > 0 || geoLoading

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-900 shrink-0 flex flex-wrap items-center gap-2">
        {/* ZIP dropdown */}
        <div className="relative min-w-36">
          <select
            value={zipFilter}
            onChange={e => { setZipFilter(e.target.value); clearSelection() }}
            disabled={loading || zipOptions.length === 0}
            className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">{loading ? 'Loading…' : zipOptions.length === 0 ? 'No ZIPs' : 'All ZIPs'}</option>
            {zipOptions.map(([zip, count]) => (
              <option key={zip} value={zip}>{zip} ({count})</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <AddressSearch onResult={setFlyTarget} compact />

        {loading && <Loader2 size={16} className="animate-spin text-blue-400 shrink-0" />}
        {!loading && (
          <span className="text-slate-500 text-xs shrink-0">
            {filteredLeads.length} assigned
            {geoLeads.length > 0 && <span className="text-sky-400"> +{geoLeads.filter(l => !filteredIds.has(l.id)).length} revealed</span>}
            {repFilter && <span className="text-blue-400"> · {repFilter.name}</span>}
          </span>
        )}
      </div>

      {error && <div className="text-red-400 text-sm px-4 py-2 bg-red-950/30 shrink-0">{error}</div>}

      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <MapContainer center={JACKSONVILLE_CENTER} zoom={11} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
          <FlyToLocation coords={flyTarget} />
          <FlyToRep target={repFlyTarget} />
          {flyTarget && <Marker position={flyTarget} icon={SEARCH_PIN} />}
          <FitBounds leads={allLeads} />
          <CenterAndResize focusLead={selectedLead} panelOpen={panelOpen} />
          <ClickToClear enabled={!tool} onClear={clearSelection} />
          <DrawTool tool={tool} leads={displayLeads} onSelect={handleAreaSelect} />

          {/* Radius geo-search circle */}
          {geoAnchor && (
            <Circle center={[geoAnchor.lat, geoAnchor.lng]} radius={geoAnchor.radiusM}
              pathOptions={{ color: '#60a5fa', weight: 1.5, fillColor: '#60a5fa', fillOpacity: 0.06 }} />
          )}

          {/* Lead pins — status color for assigned, sky-blue for unassigned */}
          {displayLeads.map(lead => {
            const isSel = selectedIds.has(lead.id) || selectedLead?.id === lead.id
            return (
              <Marker
                key={lead.id}
                position={[lead.lat, lead.lng]}
                icon={leadIcon(pinColor(lead, isSel), isSel)}
                eventHandlers={{ click: () => handleMarkerClick(lead) }}
              />
            )
          })}

          {/* Rep GPS dots */}
          {repLocations.map(loc => {
            const r = reps.find(r => r.id === loc.rep_id)
            return r ? (
              <Marker key={loc.rep_id} position={[loc.lat, loc.lng]} icon={repLocIcon(r.name)} zIndexOffset={2000} />
            ) : null
          })}
        </MapContainer>

        {/* Rep filter menu */}
        <RepMenu
          reps={reps}
          repFilter={repFilter}
          onSelect={handleRepSelect}
          open={menuOpen}
          onToggle={() => setMenuOpen(o => !o)}
          repLocations={repLocations}
          onFlyTo={setRepFlyTarget}
        />

        {/* Tool buttons top-right */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
          <button onClick={() => setTool(t => t === 'lasso' ? null : 'lasso')} title="Lasso reveal"
            className={`p-2 rounded-lg border shadow-lg transition-colors ${tool === 'lasso' ? 'bg-sky-500 border-sky-400 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'}`}>
            <Lasso size={16} />
          </button>
          <button onClick={() => setTool(t => t === 'radius' ? null : 'radius')} title="Radius reveal"
            className={`p-2 rounded-lg border shadow-lg transition-colors ${tool === 'radius' ? 'bg-sky-500 border-sky-400 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'}`}>
            <Target size={16} />
          </button>
          {hasGeo && (
            <button onClick={() => { clearGeo(); clearSelection() }} title="Clear reveal"
              className="p-2 rounded-lg border shadow-lg bg-sky-700 border-sky-600 text-white">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Draw hint */}
        {tool && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] bg-sky-900/90 text-sky-100 text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
            {tool === 'lasso' ? 'Draw a loop to reveal leads' : 'Drag a circle to reveal leads'}
          </div>
        )}

        {/* Geo-search loading indicator */}
        {geoLoading && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[999] bg-sky-900/90 text-sky-100 text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 pointer-events-none">
            <Loader2 size={12} className="animate-spin" /> Revealing leads…
          </div>
        )}

        {/* Status legend */}
        <div className="absolute bottom-4 left-3 z-[999] bg-slate-900/90 rounded-lg px-3 py-2 text-xs text-slate-300 space-y-1 pointer-events-none">
          {STATUS_LEGEND.map(([label, color]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: color }} />
              {label}
            </div>
          ))}
          {repLocations.length > 0 && (
            <>
              <div className="border-t border-slate-700/50 my-0.5" />
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: '#0ea5e9' }} />
                Rep (live)
              </div>
            </>
          )}
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 rounded-xl px-5 py-4 flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-blue-400" />
              <div className="text-slate-300 text-sm">Loading all assigned leads…</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom panels */}
      {selectedLead && selectedLeads.length === 0 && (
        <SingleLeadPanel
          lead={selectedLead}
          reps={reps}
          busy={busy === selectedLead.id}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
          onClose={clearSelection}
          onLeadUpdate={patchLead}
        />
      )}
      {!selectedLead && selectedLeads.length > 0 && (
        <MultiSelectPanel
          leads={selectedLeads}
          reps={reps}
          bulkBusy={bulkBusy}
          bulkProgress={bulkProgress}
          onBulkAssign={handleBulkAssign}
          onClear={clearSelection}
        />
      )}
    </div>
  )
}

// ── Manager Leads Tab (placeholder — adjustments TBD) ─────────────────────────

function ManagerLeads() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-slate-500 text-sm px-6">
        <List size={32} className="mx-auto mb-3 text-slate-700" />
        <div className="font-medium text-slate-400 mb-1">Leads Tab</div>
        <div>Adjustments coming — tell me what you want here.</div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function SalesManagerWorkspace({ rep, onLogout }) {
  const [tab, setTab] = useState('map')

  return (
    <div className="flex flex-col h-dvh bg-slate-950 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900">
        <div className="flex items-center gap-2">
          <span className="text-blue-400 font-bold text-sm tracking-wide">PLOKS</span>
          <span className="text-slate-600 text-xs">·</span>
          <span className="text-slate-400 text-xs">Sales Manager</span>
        </div>
        <button onClick={onLogout} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg hover:bg-slate-800">
          <LogOut size={13} /> Sign out
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'map'   && <ManagerMap active={tab === 'map'} />}
        {tab === 'leads' && <ManagerLeads />}
      </div>

      {/* Bottom tab bar */}
      <nav className="shrink-0 flex border-t border-slate-800 bg-slate-900">
        {[
          { id: 'map',   label: 'Map',   Icon: MapIcon },
          { id: 'leads', label: 'Leads', Icon: List    },
        ].map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              tab === id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={20} strokeWidth={tab === id ? 2.5 : 1.8} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}
