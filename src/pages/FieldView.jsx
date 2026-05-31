import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Navigation, CheckCircle, MapPin, X, RefreshCw, Layers } from 'lucide-react'

const MAP_STYLES = [
  { id: 'streets', label: 'Light', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap' },
  { id: 'dark', label: 'Dark', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '© CartoDB' },
  { id: 'satellite', label: 'Satellite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: '© ESRI' },
]
import L from 'leaflet'
import { validatePin, getLeadsForRep, claimLead, updateLeadStatus } from '../api/sheets.js'

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const JACKSONVILLE_CENTER = [30.3322, -81.6557]

function leadIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

const repIcon = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function RepDot({ position }) {
  if (!position) return null
  return <Marker position={position} icon={repIcon} zIndexOffset={1000} />
}

function RecenterButton({ position }) {
  const map = useMap()
  if (!position) return null
  return (
    <button
      onClick={() => map.setView(position, 17)}
      className="absolute bottom-36 right-3 z-[999] bg-slate-800 border border-slate-600 text-white rounded-full p-2 shadow-lg"
      title="Center on my location"
    >
      <Navigation size={18} className="text-blue-400" />
    </button>
  )
}

function MapClickCapture({ onMapClick }) {
  useMapEvents({ click: onMapClick })
  return null
}

// ── PIN gate ──────────────────────────────────────────────────────────────

function PinGate({ repSlug, onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleKey(k) {
    if (loading) return
    if (k === 'del') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      setLoading(true)
      try {
        const result = await validatePin(repSlug, next)
        if (result.ok) {
          onUnlock(result.rep)
        } else {
          setError('Wrong PIN — try again')
          setPin('')
        }
      } catch (err) {
        setError('Connection error — try again')
        setPin('')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-blue-400 font-bold text-2xl tracking-wide">PLOKS</div>
      <div className="text-slate-300 text-sm">{repSlug ? `Welcome, ${repSlug}` : 'Enter your PIN'}</div>
      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-colors ${pin.length > i ? 'border-blue-500 bg-blue-900 text-white' : 'border-slate-700 bg-slate-900 text-slate-600'}`}>
            {pin.length > i ? '●' : ''}
          </div>
        ))}
      </div>
      {loading && <div className="text-blue-400 text-sm">Checking…</div>}
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-3 w-56">
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => (
          <button
            key={i}
            onClick={() => k && handleKey(k)}
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

// ── Lead card ─────────────────────────────────────────────────────────────

function LeadCard({ lead, onClaim, onNavigate, onClose, claiming }) {
  if (!lead) return null
  const isAssigned = lead.assigned_rep_id && lead.status !== 'claimed'
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[998] bg-slate-900 border-t border-slate-700 rounded-t-2xl p-4 shadow-2xl">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{lead.address}</div>
          <div className="text-slate-400 text-xs mt-0.5">{lead.zip} · {lead.bucket || lead.status || 'Available'}</div>
          {lead.roof_age && <div className="text-slate-500 text-xs mt-0.5">Roof age: {lead.roof_age} yrs</div>}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
      </div>
      {lead.owner_name && <div className="text-slate-300 text-xs mb-1">Owner: {lead.owner_name}</div>}
      {isAssigned && <div className="text-red-400 text-xs mb-3">Assigned to: {lead.assigned_rep}</div>}
      <div className="flex gap-2">
        <button
          onClick={onNavigate}
          className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2.5 rounded-lg transition-colors"
        >
          <MapPin size={15} /> Navigate
        </button>
        {!isAssigned && (
          <button
            onClick={onClaim}
            disabled={claiming}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg transition-colors font-semibold"
          >
            <CheckCircle size={15} /> {claiming ? 'Claiming…' : 'Claim Lead'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function FieldView() {
  const { repSlug } = useParams()
  const [rep, setRep] = useState(null)
  const [repPos, setRepPos] = useState(null)
  const [leads, setLeads] = useState([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [tab, setTab] = useState('map')
  const [mapStyle, setMapStyle] = useState('streets')
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [gpsRequested, setGpsRequested] = useState(false)
  const watchRef = useRef(null)

  function startGps() {
    if (!navigator.geolocation) return
    setGpsRequested(true)
    watchRef.current = navigator.geolocation.watchPosition(
      pos => setRepPos([pos.coords.latitude, pos.coords.longitude]),
      err => console.warn('GPS error', err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
  }

  useEffect(() => {
    return () => { if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current) }
  }, [])

  // Load leads after unlock
  async function loadLeads(repData) {
    setLoadingLeads(true)
    try {
      const result = await getLeadsForRep(repData.id)
      setLeads(result.leads || [])
    } catch (err) {
      console.error('Failed to load leads', err)
    } finally {
      setLoadingLeads(false)
    }
  }

  function handleUnlock(repData) {
    setRep(repData)
    loadLeads(repData)
  }

  function openNavigate(lead) {
    const addr = encodeURIComponent(`${lead.address} ${lead.zip}`)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    window.open(isIOS ? `maps://?q=${addr}` : `https://maps.google.com/?q=${addr}`, '_blank')
  }

  async function handleClaim(lead) {
    setClaiming(true)
    try {
      const location = repPos ? { lat: repPos[0], lng: repPos[1] } : null
      await claimLead(lead.id, rep.id, rep.name, location)
      // Refresh leads after claim
      const result = await getLeadsForRep(rep.id)
      setLeads(result.leads || [])
      setSelectedLead(null)
    } catch (err) {
      alert('Claim failed: ' + err.message)
    } finally {
      setClaiming(false)
    }
  }

  if (!rep) return <PinGate repSlug={repSlug} onUnlock={handleUnlock} />

  const availableLeads = leads.filter(l => !l.assigned_rep_id)
  const assignedLeads = leads.filter(l => l.assigned_rep_id)
  const myLeads = leads.filter(l => l.assigned_rep_id === rep.id)

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div>
          <span className="text-blue-400 font-bold tracking-wide">PLOKS</span>
          <span className="text-slate-500 text-xs ml-2">{rep.name}</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('map')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'map' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Map
          </button>
          <button
            onClick={() => setTab('tracker')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === 'tracker' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Tracker {myLeads.length > 0 && <span className="ml-1 bg-blue-500 text-white text-xs rounded-full px-1.5">{myLeads.length}</span>}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => loadLeads(rep)} disabled={loadingLeads} className="text-slate-500 hover:text-slate-300">
            <RefreshCw size={15} className={loadingLeads ? 'animate-spin text-blue-400' : ''} />
          </button>
          {repPos
            ? <span className="text-xs text-green-400">● GPS</span>
            : gpsRequested
              ? <span className="text-xs text-slate-500">○ GPS</span>
              : <button onClick={startGps} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded-lg font-medium">Enable Location</button>
          }
        </div>
      </div>

      {/* Map tab */}
      {tab === 'map' && (
        <div className="relative flex-1 min-h-0">
          {/* Map style picker */}
          {showStylePicker && (
            <div className="absolute top-12 right-3 z-[1000] bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
              {MAP_STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setMapStyle(s.id); setShowStylePicker(false) }}
                  className={`flex items-center gap-2 w-full px-4 py-3 text-sm transition-colors ${mapStyle === s.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                >
                  {mapStyle === s.id && <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />}
                  {mapStyle !== s.id && <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" />}
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <MapContainer
            center={repPos || JACKSONVILLE_CENTER}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              key={mapStyle}
              url={MAP_STYLES.find(s => s.id === mapStyle).url}
              attribution={MAP_STYLES.find(s => s.id === mapStyle).attribution}
            />
            <RepDot position={repPos} />
            <RecenterButton position={repPos} />
            <MapClickCapture onMapClick={() => setSelectedLead(null)} />
            {availableLeads.map(lead => (
              <Marker key={lead.id} position={[lead.lat, lead.lng]} icon={leadIcon('#3b82f6')}
                eventHandlers={{ click: () => setSelectedLead(lead) }}>
                <Popup>{lead.address}</Popup>
              </Marker>
            ))}
            {assignedLeads.map(lead => (
              <Marker key={lead.id} position={[lead.lat, lead.lng]} icon={leadIcon('#ef4444')}
                eventHandlers={{ click: () => setSelectedLead(lead) }}>
                <Popup>{lead.address} — {lead.assigned_rep}</Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map style toggle button */}
          <button
            onClick={() => setShowStylePicker(p => !p)}
            className="absolute top-3 right-3 z-[999] bg-slate-900/90 border border-slate-700 text-slate-300 rounded-lg p-2 shadow-lg"
          >
            <Layers size={16} />
          </button>

          <div className="absolute top-3 left-3 z-[999] bg-slate-900/90 rounded-lg px-3 py-2 text-xs text-slate-300 space-y-1 pointer-events-none">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Available</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Assigned</div>
          </div>

          {loadingLeads && (
            <div className="absolute top-3 right-3 z-[999] bg-slate-900/90 rounded-lg px-3 py-2 text-xs text-blue-400">
              Loading leads…
            </div>
          )}


          <LeadCard
            lead={selectedLead}
            claiming={claiming}
            onClaim={() => handleClaim(selectedLead)}
            onNavigate={() => openNavigate(selectedLead)}
            onClose={() => setSelectedLead(null)}
          />
        </div>
      )}

      {/* Tracker tab */}
      {tab === 'tracker' && (
        <div className="flex-1 overflow-auto p-4">
          {myLeads.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle size={32} className="text-slate-600 mx-auto mb-3" />
              <div className="text-slate-400 text-sm">No assigned leads yet</div>
            </div>
          ) : (
            <div className="space-y-3">
              {myLeads.map(lead => (
                <div key={lead.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="text-white text-sm font-medium">{lead.address}</div>
                  <div className="text-slate-400 text-xs mt-1">{lead.zip} · {lead.bucket || ''}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">{lead.status || 'Assigned'}</span>
                    {lead.roof_age && <span className="text-xs text-slate-500">{lead.roof_age} yr roof</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
