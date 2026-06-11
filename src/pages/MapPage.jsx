import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { getZipList, getAllReps, assignLead, unassignLead, updateLeadProfile, getLeadActivity, getAdminLeadsForZip, getAdminZipStats } from '../api/sheets.js'
import { ChevronDown, X, MapPin, Loader2, Lasso, Target, Trash2, ClipboardList, Menu } from 'lucide-react'
import AddressSearch from '../components/AddressSearch.jsx'

const SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: '© ESRI',
}
const JACKSONVILLE_CENTER = [30.3322, -81.6557]

// Status-based pin colors (matches rep workspace)
const STATUS_COLORS = {
  'no contact': '#22c55e',
  'contacted':  '#f59e0b',
  'working':    '#a855f7',
  'follow up':  '#f97316',
  'closed':     '#6b7280',
}
const SELECTED_COLOR = '#3b82f6'

const STATUS_LEGEND = [
  ['No Contact', '#22c55e'],
  ['Contacted',  '#f59e0b'],
  ['Working',    '#a855f7'],
  ['Follow Up',  '#f97316'],
  ['Closed',     '#6b7280'],
]

function pinColor(lead, selected) {
  if (selected) return SELECTED_COLOR
  const key = (lead.status || 'no contact').toLowerCase()
  return STATUS_COLORS[key] || STATUS_COLORS['no contact']
}

function leadIcon(color, selected) {
  const size = selected ? 18 : 14
  const ring = selected
    ? `box-shadow:0 0 0 3px rgba(59,130,246,0.5);`
    : 'box-shadow:0 1px 4px rgba(0,0,0,0.5);'
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;${ring}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ── Geometry ─────────────────────────────────────────────────────────────────

function pointInPolygon(pt, poly) {
  const x = pt[0], y = pt[1]
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// ── Map helpers ───────────────────────────────────────────────────────────────

function FlyToLocation({ coords }) {
  const map = useMap()
  useEffect(() => { if (coords) map.flyTo(coords, 17) }, [coords, map])
  return null
}

const SEARCH_PIN_ICON = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.3 21.7 0 14 0z" fill="#ef4444" stroke="white" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize:   [28, 40],
  iconAnchor: [14, 40],
})

function FitBounds({ leads }) {
  const map = useMap()
  const lastCount = useRef(0)
  useEffect(() => {
    if (leads.length === 0) { lastCount.current = 0; return }
    if (leads.length === lastCount.current) return
    lastCount.current = leads.length
    const pts = leads.filter(l => l.lat && l.lng).map(l => [l.lat, l.lng])
    if (pts.length === 0) return
    if (pts.length === 1) { map.setView(pts[0], 16); return }
    map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] })
  }, [leads, map])
  return null
}

function CenterAndResize({ focusLead, panelOpen }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 130)
    return () => clearTimeout(t)
  }, [panelOpen, map])
  useEffect(() => {
    if (!focusLead || !focusLead.lat || !focusLead.lng) return
    const t = setTimeout(() => {
      map.invalidateSize()
      map.setView([focusLead.lat, focusLead.lng], Math.max(map.getZoom(), 16), { animate: true })
    }, 150)
    return () => clearTimeout(t)
  }, [focusLead, map])
  return null
}

function ClickToClear({ enabled, onClear }) {
  useMapEvents({ click: () => { if (enabled) onClear() } })
  return null
}

function DrawTool({ tool, leads, onSelect }) {
  const map = useMap()
  useEffect(() => {
    if (!tool) { map.dragging.enable(); return }
    const container = map.getContainer()
    map.dragging.disable()
    container.style.cursor = 'crosshair'
    container.style.touchAction = 'none'

    let drawing = false
    let layer = null
    let points = []
    let center = null

    const clearLayer = () => { if (layer) { map.removeLayer(layer); layer = null } }
    const toLatLng = e => {
      const rect = container.getBoundingClientRect()
      return map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top))
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return
      e.preventDefault()
      drawing = true
      try { container.setPointerCapture(e.pointerId) } catch { /* noop */ }
      clearLayer()
      const ll = toLatLng(e)
      if (tool === 'lasso') {
        points = [ll]
        layer = L.polyline(points, { color: '#22c55e', weight: 2 }).addTo(map)
      } else {
        center = ll
        layer = L.circle(center, { radius: 0, color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.12 }).addTo(map)
      }
    }
    function onMove(e) {
      if (!drawing) return
      e.preventDefault()
      const ll = toLatLng(e)
      if (tool === 'lasso') { points.push(ll); layer.setLatLngs(points) }
      else { layer.setRadius(center.distanceTo(ll)) }
    }
    function onUp(e) {
      if (!drawing) return
      drawing = false
      try { container.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      if (tool === 'lasso') {
        if (points.length < 3) { clearLayer(); return }
        const poly = points.map(p => [p.lat, p.lng])
        clearLayer()
        layer = L.polygon(poly, { color: '#22c55e', weight: 2, fillColor: '#22c55e', fillOpacity: 0.12 }).addTo(map)
        onSelect(leads.filter(l => l.lat && l.lng && pointInPolygon([l.lat, l.lng], poly)))
      } else {
        const r = layer ? layer.getRadius() : 0
        if (r < 1) { clearLayer(); return }
        onSelect(leads.filter(l => l.lat && l.lng && center.distanceTo(L.latLng(l.lat, l.lng)) <= r))
      }
    }

    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)
    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
      clearLayer()
      map.dragging.enable()
      container.style.cursor = ''
      container.style.touchAction = ''
    }
  }, [tool, leads, map, onSelect])
  return null
}

// ── Assign dropdown ───────────────────────────────────────────────────────────

function AssignDropdown({ lead, reps, busy, onAssign, onUnassign, dropUp }) {
  const [open, setOpen] = useState(false)
  const isAssigned = !!lead.assigned_rep_id
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="w-full flex items-center justify-between gap-2 text-sm px-3 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
      >
        <span>{busy ? 'Saving…' : isAssigned ? `Reassign · ${lead.assigned_rep}` : 'Assign to rep'}</span>
        <ChevronDown size={14} />
      </button>
      {open && !busy && (
        <div className={`absolute left-0 z-[999] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto ${dropUp ? 'bottom-12' : 'top-12'}`}>
          {isAssigned && (
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

// ── Bottom panels ─────────────────────────────────────────────────────────────

const LEAD_STATUSES = ['No Contact', 'Contacted', 'Working', 'Follow Up', 'Closed']

function PanelInput({ label, value, onChange, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || ''}
        className="bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 placeholder:text-slate-600"
      />
    </div>
  )
}

function SingleLeadPanel({ lead, reps, busy, onAssign, onUnassign, onClose, onLeadUpdate }) {
  const [form, setForm] = useState({
    owner_name: lead.owner_name || '', phone: lead.phone || '',
    email: lead.email || '', insurance: lead.insurance || '', notes: lead.notes || '',
  })
  const [status, setStatus] = useState(lead.status || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [logOpen, setLogOpen]       = useState(false)
  const [activity, setActivity]     = useState([])
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
      await updateLeadProfile(lead.id, fields, 'admin')
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
    catch (e) { setActivity([{ action: 'error', notes: e.message, timestamp: '' }]) }
    finally { setLoadingLog(false) }
  }

  return (
    <div className="shrink-0 border-t border-slate-800 bg-slate-900 overflow-auto" style={{ maxHeight: '55vh' }}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-white font-semibold text-base">{lead.address}</div>
            <div className="text-slate-400 text-xs mt-0.5">
              ZIP {lead.zip}{lead.roof_age ? ` · ${lead.roof_age} yr roof` : ''}{lead.job_type ? ` · ${lead.job_type}` : ''}
            </div>
            <div className="text-xs mt-0.5">
              {lead.assigned_rep
                ? <span className="text-orange-400">Assigned to {lead.assigned_rep}</span>
                : <span className="text-blue-400">Open</span>}
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
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${status === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
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
          <div className="text-white font-semibold text-base">{leads.length} leads selected</div>
          <button onClick={onClear} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm">
            <Trash2 size={14} /> Clear
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select
            value={repId}
            onChange={e => setRepId(e.target.value)}
            disabled={bulkBusy}
            className="bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">Select a rep…</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button
            onClick={() => rep && onBulkAssign(leads, rep)}
            disabled={!rep || bulkBusy}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium transition-colors"
          >
            {bulkBusy ? `Assigning ${bulkProgress[0]}/${bulkProgress[1]}…` : `Assign all to ${rep ? rep.name : 'rep'}`}
          </button>
        </div>

        <div className="flex flex-col gap-1 max-h-32 overflow-auto text-xs">
          {leads.map(l => (
            <div key={l.id} className="flex justify-between gap-3 text-slate-400">
              <span className="truncate">{l.address}</span>
              <span className="shrink-0 text-slate-600">{l.assigned_rep || 'open'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Rep Filter Menu ───────────────────────────────────────────────────────────

function RepMenu({ reps, repFilter, onSelect, open, onToggle }) {
  const ref = useRef(null)
  // Close on outside click
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
        title="Filter by rep"
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg text-sm font-medium transition-colors ${
          open || repFilter
            ? 'bg-blue-600 border-blue-500 text-white'
            : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
        }`}
      >
        <Menu size={15} />
        {repFilter ? repFilter.name : 'All Reps'}
      </button>

      {open && (
        <div className="absolute top-11 left-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 min-w-52 max-h-80 overflow-y-auto">
          <button
            onClick={() => { onSelect(null); onToggle() }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
              !repFilter ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Reps
          </button>
          <div className="border-t border-slate-700/50 my-1" />
          {reps.map(rep => (
            <button
              key={rep.id}
              onClick={() => { onSelect(rep); onToggle() }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                repFilter?.id === rep.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {rep.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [zips, setZips]           = useState([])
  const [zipCounts, setZipCounts] = useState({})   // zip → assigned lead count
  const [reps, setReps]           = useState([])
  const [loadingMeta, setLoadingMeta]   = useState(true)
  const [selectedZip, setSelectedZip]   = useState('')
  const [leads, setLeads]               = useState([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [repFilter, setRepFilter]       = useState(null)   // null = All Reps
  const [menuOpen, setMenuOpen]         = useState(false)
  const [selectedLead, setSelectedLead]   = useState(null)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [tool, setTool]           = useState(null)
  const [busy, setBusy]           = useState(null)
  const [bulkBusy, setBulkBusy]   = useState(false)
  const [bulkProgress, setBulkProgress] = useState([0, 0])
  const [error, setError]         = useState('')
  const [flyTarget, setFlyTarget] = useState(null)

  // Load ZIPs, reps, and assigned lead counts in parallel
  useEffect(() => {
    async function loadMeta() {
      try {
        const [zipRes, repRes, countRes] = await Promise.all([
          getZipList(),
          getAllReps(),
          getAdminZipStats(),
        ])
        setZips(zipRes.zips || [])
        setReps(repRes.reps || [])
        setZipCounts(countRes.counts || {})
      } catch (err) {
        setError('Failed to load map data: ' + err.message)
      } finally {
        setLoadingMeta(false)
      }
    }
    loadMeta()
  }, [])

  // Load assigned leads for a ZIP
  async function selectZip(zip) {
    if (!zip) {
      setSelectedZip('')
      setLeads([])
      setSelectedLead(null)
      setSelectedLeads([])
      return
    }
    setSelectedZip(zip)
    setLoadingLeads(true)
    setSelectedLead(null)
    setSelectedLeads([])
    setError('')
    try {
      const res = await getAdminLeadsForZip(zip)
      setLeads((res.leads || []).filter(l => l.lat && l.lng))
    } catch (err) {
      setError(`ZIP ${zip}: ${err.message}`)
      setLeads([])
    } finally {
      setLoadingLeads(false)
    }
  }

  // Apply rep filter
  const filteredLeads = useMemo(() => {
    if (!repFilter) return leads
    return leads.filter(l => String(l.assigned_rep_id) === String(repFilter.id))
  }, [leads, repFilter])

  const selectedIds = useMemo(() => new Set(selectedLeads.map(l => l.id)), [selectedLeads])

  function patchLead(leadId, patch) {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
    setSelectedLead(prev => prev && prev.id === leadId ? { ...prev, ...patch } : prev)
    setSelectedLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
  }

  function clearSelection() {
    setSelectedLead(null)
    setSelectedLeads([])
  }

  function handleMarkerClick(lead) {
    if (tool) return
    setSelectedLeads([])
    setSelectedLead(lead)
  }

  const handleAreaSelect = useCallback(sel => {
    setSelectedLead(null)
    setSelectedLeads(sel)
  }, [])

  async function handleAssign(lead, rep) {
    setBusy(lead.id)
    try {
      await assignLead(lead.id, rep.id, rep.name, lead.zip)
      patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id })
    } catch (err) {
      alert('Assign failed: ' + err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleUnassign(lead) {
    setBusy(lead.id)
    try {
      await unassignLead(lead.id, lead.zip)
      patchLead(lead.id, { assigned_rep: '', assigned_rep_id: '' })
    } catch (err) {
      alert('Unassign failed: ' + err.message)
    } finally {
      setBusy(null)
    }
  }

  async function handleBulkAssign(targets, rep) {
    setBulkBusy(true)
    setError('')
    setBulkProgress([0, targets.length])
    let done = 0, ok = 0
    await Promise.allSettled(targets.map(async lead => {
      try {
        await assignLead(lead.id, rep.id, rep.name, lead.zip)
        patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id })
        ok++
      } finally {
        done++
        setBulkProgress([done, targets.length])
      }
    }))
    setBulkBusy(false)
    const failed = targets.length - ok
    if (failed > 0) setError(`${ok} assigned, ${failed} failed.`)
    setSelectedLeads([])
  }

  const panelOpen = !!selectedLead || selectedLeads.length > 0

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-100 shrink-0">Map</h1>

        {/* ZIP dropdown */}
        <div className="relative min-w-40">
          <select
            value={selectedZip}
            onChange={e => selectZip(e.target.value)}
            disabled={loadingMeta}
            className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">
              {loadingMeta ? 'Loading ZIPs…' : 'Select a ZIP…'}
            </option>
            {zips.map(zip => (
              <option key={zip} value={zip}>
                {zip}{zipCounts[zip] ? ` (${zipCounts[zip]})` : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <AddressSearch onResult={setFlyTarget} compact />

        {loadingLeads && <Loader2 size={16} className="animate-spin text-blue-400 shrink-0" />}

        {filteredLeads.length > 0 && (
          <span className="text-slate-500 text-xs shrink-0">
            {filteredLeads.length} leads
            {repFilter ? <span className="text-blue-400"> · {repFilter.name}</span> : ''}
          </span>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm px-4 py-2 bg-red-950/30 shrink-0">{error}</div>
      )}

      {/* ── Map area ─────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={JACKSONVILLE_CENTER}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
          <FlyToLocation coords={flyTarget} />
          {flyTarget && <Marker position={flyTarget} icon={SEARCH_PIN_ICON} />}
          <FitBounds leads={leads} />
          <CenterAndResize focusLead={selectedLead} panelOpen={panelOpen} />
          <ClickToClear enabled={!tool} onClear={clearSelection} />
          <DrawTool tool={tool} leads={filteredLeads} onSelect={handleAreaSelect} />

          {/* Pins — colored by status */}
          {filteredLeads.map(lead => {
            const isSel = selectedIds.has(lead.id) || (selectedLead?.id === lead.id)
            return (
              <Marker
                key={lead.id}
                position={[lead.lat, lead.lng]}
                icon={leadIcon(pinColor(lead, isSel), isSel)}
                eventHandlers={{ click: () => handleMarkerClick(lead) }}
              />
            )
          })}
        </MapContainer>

        {/* Rep filter menu (top-left) */}
        <RepMenu
          reps={reps}
          repFilter={repFilter}
          onSelect={setRepFilter}
          open={menuOpen}
          onToggle={() => setMenuOpen(o => !o)}
        />

        {/* Lasso / radius tools (top-right) */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
          <button
            onClick={() => setTool(t => (t === 'lasso' ? null : 'lasso'))}
            title="Lasso select"
            className={`p-2 rounded-lg border shadow-lg transition-colors ${
              tool === 'lasso'
                ? 'bg-green-600 border-green-500 text-white'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Lasso size={16} />
          </button>
          <button
            onClick={() => setTool(t => (t === 'radius' ? null : 'radius'))}
            title="Radius select"
            className={`p-2 rounded-lg border shadow-lg transition-colors ${
              tool === 'radius'
                ? 'bg-green-600 border-green-500 text-white'
                : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Target size={16} />
          </button>
        </div>

        {/* Draw hint */}
        {tool && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] bg-green-900/90 text-green-200 text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
            {tool === 'lasso' ? 'Draw a loop around leads to select' : 'Drag out from a center point to select'}
          </div>
        )}

        {/* Status legend (bottom-left) */}
        <div className="absolute bottom-4 left-3 z-[999] bg-slate-900/90 rounded-lg px-3 py-2 text-xs text-slate-300 space-y-1 pointer-events-none">
          {STATUS_LEGEND.map(([label, color]) => (
            <div key={label} className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!selectedZip && !loadingLeads && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 rounded-xl px-5 py-4 text-center">
              <MapPin size={28} className="text-slate-600 mb-2 mx-auto" />
              <div className="text-slate-300 text-sm font-medium">Select a ZIP to view assigned leads</div>
              <div className="text-slate-500 text-xs mt-1">Number in dropdown = leads assigned to any rep</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom panels ─────────────────────────────────────────────────────── */}
      {selectedLead && (
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
