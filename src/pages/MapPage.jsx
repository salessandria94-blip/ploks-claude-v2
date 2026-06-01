import { useState, useEffect, useRef, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getZipList, getAllReps, getAllLeads, assignLead, unassignLead } from '../api/sheets.js'
import { ChevronDown, X, MapPin, RefreshCw, Loader2 } from 'lucide-react'

const SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: '© ESRI',
}
const JACKSONVILLE_CENTER = [30.3322, -81.6557]

function leadIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

const BLUE = '#3b82f6'   // unassigned
const ORANGE = '#f97316' // assigned

// Pan/zoom the map to fit all loaded leads whenever the set changes
function FitBounds({ leads }) {
  const map = useMap()
  const lastCount = useRef(0)
  useEffect(() => {
    if (leads.length === 0) return
    // only refit when the count actually grows (avoids fighting the user mid-pan)
    if (leads.length === lastCount.current) return
    lastCount.current = leads.length
    const pts = leads.filter(l => l.lat && l.lng).map(l => [l.lat, l.lng])
    if (pts.length === 0) return
    if (pts.length === 1) { map.setView(pts[0], 16); return }
    map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] })
  }, [leads, map])
  return null
}

// ── Lead card (bottom sheet) ────────────────────────────────────────────────

function LeadCard({ lead, reps, onClose, onAssign, onUnassign, busy }) {
  const [open, setOpen] = useState(false)
  if (!lead) return null
  const isAssigned = !!lead.assigned_rep_id

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[998] bg-slate-900 border-t border-slate-700 rounded-t-2xl p-4 shadow-2xl">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{lead.address}</div>
          <div className="text-slate-400 text-xs mt-0.5">
            ZIP {lead.zip}{lead.bucket ? ` · ${lead.bucket}` : ''}{lead.status ? ` · ${lead.status}` : ''}
          </div>
          {lead.owner_name && <div className="text-slate-300 text-xs mt-1">Owner: {lead.owner_name}</div>}
          {isAssigned && <div className="text-orange-400 text-xs mt-0.5">Assigned to: {lead.assigned_rep}</div>}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
      </div>

      <div className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          disabled={busy}
          className="w-full flex items-center justify-between gap-2 text-sm px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors disabled:opacity-50"
        >
          <span>{busy ? 'Saving…' : isAssigned ? `Reassign (${lead.assigned_rep})` : 'Assign to rep'}</span>
          <ChevronDown size={14} />
        </button>
        {open && !busy && (
          <div className="absolute left-0 bottom-12 z-[999] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
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
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const [zips, setZips] = useState([])
  const [reps, setReps] = useState([])
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [activeZips, setActiveZips] = useState([])      // zips currently displayed
  const [loadingZips, setLoadingZips] = useState([])    // zips currently fetching
  const [leadsByZip, setLeadsByZip] = useState({})      // { zip: [leads] }
  const [selectedLead, setSelectedLead] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [loadingAll, setLoadingAll] = useState(false)
  const [allProgress, setAllProgress] = useState([0, 0])

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

  // Flatten all displayed leads from active zips
  const leads = useMemo(() => {
    return activeZips.flatMap(z => leadsByZip[z] || [])
      .filter(l => l.lat && l.lng)
  }, [activeZips, leadsByZip])

  async function fetchZip(zip) {
    if (leadsByZip[zip]) return leadsByZip[zip]   // cached
    setLoadingZips(prev => [...prev, zip])
    try {
      const res = await getAllLeads(zip)
      const leads = res.leads || []
      setLeadsByZip(prev => ({ ...prev, [zip]: leads }))
      return leads
    } finally {
      setLoadingZips(prev => prev.filter(z => z !== zip))
    }
  }

  async function toggleZip(zip) {
    if (activeZips.includes(zip)) {
      setActiveZips(prev => prev.filter(z => z !== zip))
      return
    }
    setActiveZips(prev => [...prev, zip])
    try {
      await fetchZip(zip)
    } catch (err) {
      setError(`ZIP ${zip}: ${err.message}`)
      setActiveZips(prev => prev.filter(z => z !== zip))
    }
  }

  async function loadAll() {
    setLoadingAll(true)
    setError('')
    setAllProgress([0, zips.length])
    let done = 0
    // Fire all in parallel; render each as it resolves
    await Promise.allSettled(zips.map(async zip => {
      try {
        await fetchZip(zip)
        setActiveZips(prev => prev.includes(zip) ? prev : [...prev, zip])
      } finally {
        done++
        setAllProgress([done, zips.length])
      }
    }))
    setLoadingAll(false)
  }

  function clearAll() {
    setActiveZips([])
    setSelectedLead(null)
  }

  // Update a lead in place across the zip cache
  function patchLead(leadId, patch) {
    setLeadsByZip(prev => {
      const next = {}
      for (const [zip, list] of Object.entries(prev)) {
        next[zip] = list.map(l => l.id === leadId ? { ...l, ...patch } : l)
      }
      return next
    })
    setSelectedLead(prev => prev && prev.id === leadId ? { ...prev, ...patch } : prev)
  }

  async function handleAssign(lead, rep) {
    setBusy(lead.id)
    try {
      await assignLead(lead.id, rep.id, rep.name)
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
      await unassignLead(lead.id)
      patchLead(lead.id, { assigned_rep: '', assigned_rep_id: '' })
    } catch (err) {
      alert('Unassign failed: ' + err.message)
    } finally {
      setBusy(null)
    }
  }

  const unassignedCount = leads.filter(l => !l.assigned_rep_id).length
  const assignedCount = leads.length - unassignedCount

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-slate-100">Map</h1>
            {leads.length > 0 && (
              <p className="text-slate-400 text-xs mt-0.5">
                {leads.length} leads · <span className="text-blue-400">{unassignedCount} open</span> · <span className="text-orange-400">{assignedCount} assigned</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {loadingAll && (
              <span className="text-xs text-blue-400 flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" />
                {allProgress[0]} / {allProgress[1]} ZIPs
              </span>
            )}
            <button
              onClick={loadAll}
              disabled={loadingMeta || loadingAll}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium transition-colors"
            >
              Load All
            </button>
            {activeZips.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ZIP chips */}
        <div className="flex flex-wrap gap-1.5">
          {loadingMeta && <span className="text-slate-500 text-xs">Loading ZIPs…</span>}
          {zips.map(zip => {
            const active = activeZips.includes(zip)
            const loading = loadingZips.includes(zip)
            return (
              <button
                key={zip}
                onClick={() => toggleZip(zip)}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                  active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {loading && <Loader2 size={11} className="animate-spin" />}
                {zip}
              </button>
            )
          })}
        </div>
      </div>

      {error && <div className="text-red-400 text-sm px-4 py-2 bg-red-950/30">{error}</div>}

      {/* Map */}
      <div className="relative flex-1 min-h-0">
        <MapContainer
          center={JACKSONVILLE_CENTER}
          zoom={11}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url={SATELLITE_TILE.url} attribution={SATELLITE_TILE.attribution} />
          <FitBounds leads={leads} />
          {leads.map(lead => (
            <Marker
              key={lead.id}
              position={[lead.lat, lead.lng]}
              icon={leadIcon(lead.assigned_rep_id ? ORANGE : BLUE)}
              eventHandlers={{ click: () => setSelectedLead(lead) }}
            />
          ))}
        </MapContainer>

        {/* Legend */}
        <div className="absolute top-3 left-3 z-[999] bg-slate-900/90 rounded-lg px-3 py-2 text-xs text-slate-300 space-y-1 pointer-events-none">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full inline-block" style={{ background: BLUE }} /> Open</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full inline-block" style={{ background: ORANGE }} /> Assigned</div>
        </div>

        {/* Empty state */}
        {activeZips.length === 0 && !loadingAll && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="bg-slate-900/80 rounded-xl px-5 py-4 text-center">
              <MapPin size={28} className="text-slate-600 mb-2 mx-auto" />
              <div className="text-slate-300 text-sm font-medium">Select a ZIP to plot leads</div>
              <div className="text-slate-500 text-xs mt-1">or tap Load All for the full territory</div>
            </div>
          </div>
        )}

        <LeadCard
          lead={selectedLead}
          reps={reps}
          busy={busy === (selectedLead && selectedLead.id)}
          onClose={() => setSelectedLead(null)}
          onAssign={handleAssign}
          onUnassign={handleUnassign}
        />
      </div>
    </div>
  )
}
