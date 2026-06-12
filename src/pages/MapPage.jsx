import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import {
  getAllReps, assignLead, unassignLead, updateLeadProfile, getLeadActivity,
  getAllAssignedLeads, getRepLocations, getZipList, getLeadsNearPin, getLeadsInBounds,
} from '../api/sheets.js'
import { ChevronDown, X, MapPin, Loader2, Lasso, Target, Trash2, ClipboardList, Menu, Navigation, LocateFixed } from 'lucide-react'
import AddressSearch from '../components/AddressSearch.jsx'

const SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: '© ESRI',
}
const JACKSONVILLE_CENTER = [30.3322, -81.6557]

// ── Lead pin colors by status ─────────────────────────────────────────────────
const STATUS_COLORS = {
  'no contact': '#22c55e',
  'contacted':  '#f59e0b',
  'working':    '#a855f7',
  'follow up':  '#ef4444',
  'closed':     '#6b7280',
}
const SELECTED_COLOR = '#3b82f6'
const STATUS_LEGEND = [
  ['No Contact', '#22c55e'],
  ['Contacted',  '#f59e0b'],
  ['Working',    '#a855f7'],
  ['Follow Up',  '#ef4444'],
  ['Closed',     '#6b7280'],
  ['Unassigned', '#60a5fa'],
]

function pinColor(lead, selected) {
  if (selected) return SELECTED_COLOR
  if (!lead.assigned_rep_id) return '#60a5fa'   // unassigned / geo-revealed = sky-blue
  const key = (lead.status || 'no contact').toLowerCase()
  return STATUS_COLORS[key] || STATUS_COLORS['no contact']
}

const MY_LOCATION_ICON = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 6px rgba(37,99,235,0.25)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

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

// Rep location dot — sky-blue circle with initials
function repLocIcon(name) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return L.divIcon({
    className: '',
    html: `<div style="
      background:#0ea5e9;color:white;border:2.5px solid white;border-radius:50%;
      width:30px;height:30px;display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:700;letter-spacing:0;
      box-shadow:0 0 0 3px rgba(14,165,233,0.35),0 2px 8px rgba(0,0,0,0.7);
    ">${initials}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

// ── Geometry ──────────────────────────────────────────────────────────────────

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

// Fly to a rep's live GPS position (new object reference = new fly)
function FlyToRepLocation({ target }) {
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

const SEARCH_PIN_ICON = L.divIcon({
  className: '',
  html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.3 21.7 0 14 0z" fill="#ef4444" stroke="white" stroke-width="1.5"/>
    <circle cx="14" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize:   [28, 40],
  iconAnchor: [14, 40],
})

// Fit map to leads when the loaded set first appears (not on filter changes)
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

    let drawing = false, layer = null, points = [], center = null
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
        onSelect(leads.filter(l => l.lat && l.lng && pointInPolygon([l.lat, l.lng], poly)), { type: 'lasso', poly })
      } else {
        const r = layer ? layer.getRadius() : 0
        if (r < 1) { clearLayer(); return }
        onSelect(leads.filter(l => l.lat && l.lng && center.distanceTo(L.latLng(l.lat, l.lng)) <= r), { type: 'radius', center, radiusM: r })
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
    <div className="shrink-0 border-t border-slate-800 bg-slate-900">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-white font-semibold text-base">{leads.length} leads selected</div>
          <button onClick={onClear} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-sm">
            <Trash2 size={14} /> Clear
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            {bulkBusy ? `Assigning ${bulkProgress[0]}/${bulkProgress[1]}…` : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Rep filter menu ───────────────────────────────────────────────────────────

const ALL_STATUSES = ['no contact', 'contacted', 'working', 'follow up', 'closed', 'unassigned']

function RepMenu({ reps, repFilter, onSelect, open, onToggle, repLocations, statusFilter, onStatusToggle }) {
  const ref = useRef(null)
  const activeRepIds = new Set((repLocations || []).map(l => l.rep_id))
  const allStatusesOn = statusFilter.size === ALL_STATUSES.length

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onToggle() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  const isActive = open || repFilter || !allStatusesOn

  return (
    <div ref={ref} className="absolute top-3 left-3 z-[999]">
      <button
        onClick={onToggle}
        title="Leads & rep filters"
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-blue-600 border-blue-500 text-white'
            : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
        }`}
      >
        <Menu size={15} />
        {repFilter && activeRepIds.has(repFilter.id) && (
          <Navigation size={12} className="text-green-400 fill-green-400" />
        )}
        {!allStatusesOn && (
          <span className="ml-0.5 bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
            {statusFilter.size}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 left-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1.5 min-w-60 max-h-[80vh] overflow-y-auto">

          {/* ── All Leads section ── */}
          <div className="px-2 pt-1 pb-0.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">All Leads</span>
            {!allStatusesOn && (
              <button
                onClick={() => ALL_STATUSES.forEach(s => !statusFilter.has(s) && onStatusToggle(s))}
                className="text-[10px] text-blue-400 hover:text-blue-300"
              >
                Show all
              </button>
            )}
          </div>
          {STATUS_LEGEND.map(([label, color]) => {
            const key = label.toLowerCase()
            const on = statusFilter.has(key)
            return (
              <button
                key={key}
                onClick={() => onStatusToggle(key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  on ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-800'
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0 transition-opacity"
                  style={{ background: color, opacity: on ? 1 : 0.25 }}
                />
                {label}
                {on && <span className="ml-auto text-slate-600 text-xs">✓</span>}
              </button>
            )
          })}

          <div className="border-t border-slate-700/50 my-1.5" />

          {/* ── All Reps section ── */}
          <div className="px-2 pb-0.5">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">All Reps</span>
          </div>
          <button
            onClick={() => { onSelect(null); onToggle() }}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-0.5 ${
              !repFilter ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Reps
          </button>
          <div className="border-t border-slate-700/50 my-1" />
          {reps.map(rep => {
            const isLive = activeRepIds.has(rep.id)
            return (
              <button
                key={rep.id}
                onClick={() => { onSelect(rep); onToggle() }}
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [reps, setReps]             = useState([])
  const [allLeads, setAllLeads]     = useState([])   // all assigned leads, lat/lng filtered
  const [repFilter, setRepFilter]   = useState(null) // null = All Reps
  const [zipFilter, setZipFilter]   = useState('')   // '' = all ZIPs
  const [statusFilter, setStatusFilter] = useState(() => new Set(ALL_STATUSES))
  const [loading, setLoading]       = useState(true)
  const [repLocations, setRepLocations] = useState([]) // live rep GPS dots
  const [repFlyTarget, setRepFlyTarget] = useState(null) // snap map to live rep
  const [menuOpen, setMenuOpen]     = useState(false)
  const [selectedLead, setSelectedLead]   = useState(null)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [tool, setTool]             = useState(null)
  const [busy, setBusy]             = useState(null)
  const [bulkBusy, setBulkBusy]     = useState(false)
  const [bulkProgress, setBulkProgress] = useState([0, 0])
  const [allZips, setAllZips]       = useState([])
  const [error, setError]           = useState('')
  const [flyTarget, setFlyTarget]   = useState(null)
  // Geo-search (lasso reveal)
  const [geoLeads, setGeoLeads]     = useState([])
  const [geoAnchor, setGeoAnchor]   = useState(null)
  const [geoLoading, setGeoLoading] = useState(false)
  // Own GPS
  const [myLocation, setMyLocation] = useState(null)
  const [gpsActive, setGpsActive]   = useState(false)
  const gpsWatchRef = useRef(null)

  // On mount: load reps + all assigned leads + full ZIP list in parallel
  useEffect(() => {
    async function init() {
      try {
        const [repRes, leadRes, zipRes] = await Promise.all([getAllReps(), getAllAssignedLeads(), getZipList()])
        setReps(repRes.reps || [])
        setAllLeads((leadRes.leads || []).filter(l => l.lat && l.lng))
        setAllZips(zipRes.zips || [])
      } catch (err) {
        setError('Failed to load map data: ' + err.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  // Poll rep GPS locations every 60 seconds (dots auto-hide after 5 min stale)
  useEffect(() => {
    async function poll() {
      try { const r = await getRepLocations(); setRepLocations(r.locations || []) }
      catch { /* silent */ }
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => clearInterval(id)
  }, [])

  // ZIP options: all ZIPs from DB, sorted by activity count desc then alphabetically
  const zipOptions = useMemo(() => {
    const source = repFilter
      ? allLeads.filter(l => String(l.assigned_rep_id) === String(repFilter.id))
      : allLeads
    const counts = {}
    source.forEach(l => { counts[l.zip] = (counts[l.zip] || 0) + 1 })
    return allZips
      .map(zip => [zip, counts[zip] || 0])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [allZips, allLeads, repFilter])

  function toggleStatus(key) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size === 1) return next  // keep at least one visible
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // GPS toggle
  function toggleGPS() {
    if (gpsActive) {
      if (gpsWatchRef.current != null) navigator.geolocation.clearWatch(gpsWatchRef.current)
      gpsWatchRef.current = null
      setGpsActive(false)
      setMyLocation(null)
    } else {
      setGpsActive(true)
      gpsWatchRef.current = navigator.geolocation.watchPosition(
        pos => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
        () => { setGpsActive(false); setMyLocation(null) },
        { enableHighAccuracy: true }
      )
    }
  }

  function clearGeo() { setGeoLeads([]); setGeoAnchor(null); setSelectedLeads([]) }

  // Displayed leads = rep filter + zip filter + status filter, all client-side
  const filteredLeads = useMemo(() => {
    let out = allLeads
    if (repFilter) out = out.filter(l => String(l.assigned_rep_id) === String(repFilter.id))
    if (zipFilter) out = out.filter(l => l.zip === zipFilter)
    if (statusFilter.size < ALL_STATUSES.length) {
      out = out.filter(l => statusFilter.has((l.status || 'no contact').toLowerCase()))
    }
    return out
  }, [allLeads, repFilter, zipFilter, statusFilter])

  // Merge assigned (filtered) leads with geo-search revealed leads
  const filteredIds = useMemo(() => new Set(filteredLeads.map(l => l.id)), [filteredLeads])
  const displayLeads = useMemo(() => [
    ...filteredLeads,
    ...(statusFilter.has('unassigned')
      ? geoLeads.filter(l => !filteredIds.has(l.id) && l.lat && l.lng)
      : []),
  ], [filteredLeads, geoLeads, filteredIds, statusFilter])

  const selectedIds = useMemo(() => new Set(selectedLeads.map(l => l.id)), [selectedLeads])

  // Rep quick-stats computed from already-loaded leads (no extra API call)
  const repStats = useMemo(() => {
    const out = {}
    reps.forEach(r => {
      const rl = allLeads.filter(l => String(l.assigned_rep_id) === String(r.id))
      const s = k => rl.filter(l => (l.status || '').toLowerCase() === k).length
      out[r.id] = { assigned: rl.length, contacted: s('contacted'), working: s('working'), closed: s('closed') }
    })
    return out
  }, [reps, allLeads])

  function handleRepSelect(rep) {
    setRepFilter(rep)
    setZipFilter('')            // ZIP options change when rep changes — reset
    setSelectedLead(null)
    setSelectedLeads([])
    // If this rep has an active GPS location, snap the map to them
    if (rep) {
      const loc = repLocations.find(l => l.rep_id === rep.id)
      if (loc) setRepFlyTarget({ lat: loc.lat, lng: loc.lng }) // new object = triggers fly
    }
  }

  function patchLead(leadId, patch) {
    setAllLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
    setGeoLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch } : l))
    setSelectedLead(prev => prev?.id === leadId ? { ...prev, ...patch } : prev)
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

  const handleAreaSelect = useCallback((sel, geometry) => {
    setTool(null)
    setSelectedLead(null)
    setSelectedLeads(sel)
    if (!geometry) return
    setGeoLeads([]); setGeoAnchor(null); setGeoLoading(true)

    const selIds = new Set(sel.map(l => l.id))

    function onGeoResult(leads) {
      setGeoLeads(leads)
      // Merge geo-revealed leads into selectedLeads so the assign panel has the full picture
      const newOnes = leads.filter(l => !selIds.has(l.id))
      if (newOnes.length) setSelectedLeads(prev => [...prev, ...newOnes])
    }

    if (geometry.type === 'radius') {
      const miles = geometry.radiusM / 1609.34
      setGeoAnchor({ lat: geometry.center.lat, lng: geometry.center.lng, radiusM: geometry.radiusM })
      getLeadsNearPin(geometry.center.lat, geometry.center.lng, miles)
        .then(r => onGeoResult((r.leads || []).filter(l => l.lat && l.lng)))
        .catch(() => {})
        .finally(() => setGeoLoading(false))
    } else {
      const lats = geometry.poly.map(p => p[0])
      const lngs = geometry.poly.map(p => p[1])
      getLeadsInBounds(Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs))
        .then(r => onGeoResult((r.leads || []).filter(l => l.lat && l.lng && pointInPolygon([l.lat, l.lng], geometry.poly))))
        .catch(() => {})
        .finally(() => setGeoLoading(false))
    }
  }, [])

  async function handleAssign(lead, rep) {
    setBusy(lead.id)
    try {
      await assignLead(lead.id, rep.id, rep.name, lead.zip)
      patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id })
    } catch (err) { alert('Assign failed: ' + err.message) }
    finally { setBusy(null) }
  }

  async function handleUnassign(lead) {
    setBusy(lead.id)
    try {
      await unassignLead(lead.id, lead.zip)
      patchLead(lead.id, { assigned_rep: '', assigned_rep_id: '' })
    } catch (err) { alert('Unassign failed: ' + err.message) }
    finally { setBusy(null) }
  }

  async function handleBulkAssign(targets, rep) {
    setBulkBusy(true)
    setError('')
    setBulkProgress([0, targets.length])
    let done = 0, ok = 0
    await Promise.allSettled(targets.map(async lead => {
      try {
        await assignLead(lead.id, rep.id, rep.name, lead.zip)
        const patch = { assigned_rep: rep.name, assigned_rep_id: rep.id }
        // If this was a geo-revealed unassigned lead, add it to allLeads
        setAllLeads(prev => {
          if (prev.some(l => l.id === lead.id)) return prev.map(l => l.id === lead.id ? { ...l, ...patch } : l)
          return [...prev, { ...lead, ...patch }]
        })
        patchLead(lead.id, patch)
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
      <style>{`
        .rep-stat-popup .leaflet-popup-content-wrapper {
          background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.8); padding: 0; color: #f1f5f9;
        }
        .rep-stat-popup .leaflet-popup-content { margin: 0; }
        .rep-stat-popup .leaflet-popup-tip-container .leaflet-popup-tip { background: #0f172a; }
        .rep-stat-popup .leaflet-popup-close-button { color: #475569 !important; top: 8px !important; right: 10px !important; font-size: 18px !important; }
        .rep-stat-popup .leaflet-popup-close-button:hover { color: #94a3b8 !important; }
      `}</style>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-100 shrink-0">Map</h1>

        {/* ZIP dropdown — all ZIPs, sorted by activity desc */}
        <div className="relative min-w-40">
          <select
            value={zipFilter}
            onChange={e => { setZipFilter(e.target.value); setSelectedLead(null); setSelectedLeads([]) }}
            disabled={loading}
            className="w-full appearance-none bg-slate-800 border border-slate-700 text-slate-100 text-sm rounded-lg px-3 py-2 pr-8 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          >
            <option value="">{loading ? 'Loading…' : 'ZIPs'}</option>
            {zipOptions.map(([zip, count]) => (
              <option key={zip} value={zip}>
                {count > 0 ? `${zip} (${count})` : zip}
              </option>
            ))}
            <option value="">All ZIPs</option>
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        <AddressSearch onResult={setFlyTarget} compact />

        {loading && <Loader2 size={16} className="animate-spin text-blue-400 shrink-0" />}

        {!loading && (
          <span className="text-slate-500 text-xs shrink-0">
            {filteredLeads.length} assigned
            {geoLeads.filter(l => !filteredIds.has(l.id)).length > 0 &&
              <span className="text-sky-400"> +{geoLeads.filter(l => !filteredIds.has(l.id)).length} revealed</span>}
            {repFilter && <span className="text-blue-400"> · {repFilter.name}</span>}
            {zipFilter  && <span className="text-slate-600"> · ZIP {zipFilter}</span>}
          </span>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm px-4 py-2 bg-red-950/30 shrink-0">{error}</div>
      )}

      {/* ── Map ──────────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={JACKSONVILLE_CENTER}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
          <FlyToLocation coords={flyTarget} />
          <FlyToRepLocation target={repFlyTarget} />
          {flyTarget && <Marker position={flyTarget} icon={SEARCH_PIN_ICON} />}
          <FitBounds leads={allLeads} />
          <CenterAndResize focusLead={selectedLead} panelOpen={panelOpen} />
          <ClickToClear enabled={!tool} onClear={clearSelection} />
          <DrawTool tool={tool} leads={displayLeads} onSelect={handleAreaSelect} />

          {/* Radius reveal circle */}
          {geoAnchor && (
            <Circle center={[geoAnchor.lat, geoAnchor.lng]} radius={geoAnchor.radiusM}
              pathOptions={{ color: '#60a5fa', weight: 1.5, fillColor: '#60a5fa', fillOpacity: 0.06 }} />
          )}

          {/* Own GPS location */}
          {myLocation && <Marker position={myLocation} icon={MY_LOCATION_ICON} zIndexOffset={3000} />}

          {/* Lead pins — colored by status; sky-blue for geo-revealed unassigned */}
          {displayLeads.map(lead => {
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

          {/* Rep location dots — sky-blue, click for quick-stats popup */}
          {repLocations.map(loc => {
            const r = reps.find(r => r.id === loc.rep_id)
            const st = repStats[loc.rep_id] || {}
            return r ? (
              <Marker key={loc.rep_id} position={[loc.lat, loc.lng]} icon={repLocIcon(r.name)} zIndexOffset={2000}>
                <Popup className="rep-stat-popup" minWidth={230} maxWidth={280}>
                  <div style={{ padding: '12px 14px', fontFamily: 'inherit' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', lineHeight: 1.2 }}>{r.name}</div>
                        {r.email && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>✉ {r.email}</div>}
                        {r.phone && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>✆ {r.phone}</div>}
                      </div>
                      <a
                        href={`/field/${r.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, background: '#16a34a', color: 'white', padding: '4px 9px', borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 10, marginTop: 2 }}
                      >
                        Field View ↗
                      </a>
                    </div>
                    {/* Stats row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, borderTop: '1px solid #1e293b', paddingTop: 10 }}>
                      {[
                        { label: 'Assigned',  val: st.assigned  || 0, color: '#60a5fa' },
                        { label: 'Contacted', val: st.contacted || 0, color: '#f59e0b' },
                        { label: 'Working',   val: st.working   || 0, color: '#a855f7' },
                        { label: 'Closed',    val: st.closed    || 0, color: '#6b7280' },
                      ].map(({ label, val, color }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                          <div style={{ fontSize: 9, color: '#64748b', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ) : null
          })}
        </MapContainer>

        {/* Rep filter menu (top-left) */}
        <RepMenu
          reps={reps}
          repFilter={repFilter}
          onSelect={handleRepSelect}
          open={menuOpen}
          onToggle={() => setMenuOpen(o => !o)}
          repLocations={repLocations}
          statusFilter={statusFilter}
          onStatusToggle={toggleStatus}
        />

        {/* Tools (top-right) */}
        <div className="absolute top-3 right-3 z-[999] flex flex-col gap-2">
          <button onClick={() => setTool(t => (t === 'lasso' ? null : 'lasso'))} title="Lasso reveal"
            className={`p-2 rounded-lg border shadow-lg transition-colors ${tool === 'lasso' ? 'bg-sky-500 border-sky-400 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'}`}>
            <Lasso size={16} />
          </button>
          <button onClick={() => setTool(t => (t === 'radius' ? null : 'radius'))} title="Radius reveal"
            className={`p-2 rounded-lg border shadow-lg transition-colors ${tool === 'radius' ? 'bg-sky-500 border-sky-400 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'}`}>
            <Target size={16} />
          </button>
          {(geoLeads.length > 0 || geoLoading) && (
            <button onClick={clearGeo} title="Clear revealed leads"
              className="p-2 rounded-lg border shadow-lg bg-sky-700 border-sky-600 text-white">
              <X size={16} />
            </button>
          )}
          <div className="border-t border-slate-700/50 my-0.5" />
          <button onClick={toggleGPS} title={gpsActive ? 'Stop GPS' : 'Show my location'}
            className={`p-2 rounded-lg border shadow-lg transition-colors ${gpsActive ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'}`}>
            <LocateFixed size={16} />
          </button>
          {myLocation && (
            <button onClick={() => setFlyTarget(myLocation)} title="Center on my location"
              className="p-2 rounded-lg border shadow-lg bg-slate-900/90 border-slate-700 text-blue-400 hover:text-blue-300">
              <Navigation size={16} />
            </button>
          )}
        </div>

        {/* Draw hint */}
        {tool && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[999] bg-sky-900/90 text-sky-100 text-xs px-3 py-1.5 rounded-lg shadow-lg pointer-events-none">
            {tool === 'lasso' ? 'Draw a loop to reveal leads' : 'Drag a circle to reveal leads'}
          </div>
        )}

        {/* Geo-search loading */}
        {geoLoading && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[999] bg-sky-900/90 text-sky-100 text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 pointer-events-none">
            <Loader2 size={12} className="animate-spin" /> Revealing leads…
          </div>
        )}

        {/* Empty / loading state */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 rounded-xl px-5 py-4 flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-blue-400" />
              <div className="text-slate-300 text-sm">Loading all assigned leads…</div>
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
