import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { Navigation, Phone, CheckCircle, Clock, MapPin, ChevronDown, X } from 'lucide-react'
import L from 'leaflet'

// Fix Leaflet default icon paths broken by Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow })

const JACKSONVILLE_CENTER = [30.3322, -81.6557]

// Colored circle markers for leads
function leadIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

// Rep GPS dot
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

// PIN gate screen
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  function handleKey(k) {
    if (k === 'del') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      // Placeholder: accept any 4-digit PIN for now — Phase 2 will validate against Sheet
      setTimeout(() => onUnlock({ pin: next }), 150)
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-blue-400 font-bold text-2xl tracking-wide">PLOKS</div>
      <div className="text-slate-300 text-sm">Enter your PIN</div>
      <div className="flex gap-3">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xl font-bold transition-colors ${pin.length > i ? 'border-blue-500 bg-blue-900 text-white' : 'border-slate-700 bg-slate-900 text-slate-600'}`}>
            {pin.length > i ? '●' : ''}
          </div>
        ))}
      </div>
      {error && <div className="text-red-400 text-sm">{error}</div>}
      <div className="grid grid-cols-3 gap-3 w-56">
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((k, i) => (
          <button
            key={i}
            onClick={() => k && handleKey(k)}
            disabled={!k}
            className={`h-14 rounded-xl text-lg font-semibold transition-colors ${k === 'del' ? 'bg-slate-700 text-slate-300 active:bg-slate-600' : k ? 'bg-slate-800 text-white active:bg-slate-700' : 'invisible'}`}
          >
            {k === 'del' ? '⌫' : k}
          </button>
        ))}
      </div>
    </div>
  )
}

// Lead info card
function LeadCard({ lead, onClaim, onNavigate, onClose, claiming }) {
  if (!lead) return null
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[998] bg-slate-900 border-t border-slate-700 rounded-t-2xl p-4 shadow-2xl">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{lead.address}</div>
          <div className="text-slate-400 text-xs mt-0.5">{lead.zip} · {lead.status || 'Available'}</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
      </div>
      {lead.owner_name && <div className="text-slate-300 text-xs mb-3">Owner: {lead.owner_name}</div>}
      <div className="flex gap-2">
        <button
          onClick={onNavigate}
          className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2.5 rounded-lg transition-colors"
        >
          <MapPin size={15} /> Navigate
        </button>
        <button
          onClick={onClaim}
          disabled={claiming}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg transition-colors font-semibold"
        >
          <CheckCircle size={15} /> {claiming ? 'Claiming…' : 'Claim Lead'}
        </button>
      </div>
    </div>
  )
}

export default function FieldView() {
  const { repSlug } = useParams()
  const [session, setSession] = useState(null)
  const [repPos, setRepPos] = useState(null)
  const [leads, setLeads] = useState([])
  const [selectedLead, setSelectedLead] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const [tab, setTab] = useState('map') // 'map' | 'tracker'
  const watchRef = useRef(null)

  // Start GPS watch after unlock
  useEffect(() => {
    if (!session) return
    watchRef.current = navigator.geolocation.watchPosition(
      pos => setRepPos([pos.coords.latitude, pos.coords.longitude]),
      err => console.warn('GPS error', err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    )
    return () => navigator.geolocation.clearWatch(watchRef.current)
  }, [session])

  function handleUnlock(sess) {
    setSession(sess)
    // TODO Phase 2: validate PIN against Apps Script, load rep profile + leads
  }

  function openNavigate(lead) {
    const addr = encodeURIComponent(lead.address + ' ' + lead.zip)
    // iOS: maps://, Android/desktop: https://maps.google.com
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    window.open(isIOS ? `maps://?q=${addr}` : `https://maps.google.com/?q=${addr}`, '_blank')
  }

  async function handleClaim(lead) {
    setClaiming(true)
    // TODO Phase 2: POST to Apps Script API
    await new Promise(r => setTimeout(r, 800))
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: 'claimed', rep: 'Me' } : l))
    setSelectedLead(null)
    setClaiming(false)
  }

  if (!session) return <PinGate onUnlock={handleUnlock} />

  const availableLeads = leads.filter(l => !l.rep)
  const assignedLeads = leads.filter(l => l.rep)
  const myLeads = leads.filter(l => l.status === 'claimed')

  return (
    <div className="fixed inset-0 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <span className="text-blue-400 font-bold tracking-wide">PLOKS</span>
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
        <div className="w-12 text-right text-xs text-slate-500">
          {repPos ? <span className="text-green-400">● GPS</span> : <span className="text-slate-600">○ GPS</span>}
        </div>
      </div>

      {/* Map tab */}
      {tab === 'map' && (
        <div className="relative flex-1 min-h-0">
          <MapContainer
            center={repPos || JACKSONVILLE_CENTER}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
            />
            <RepDot position={repPos} />
            <RecenterButton position={repPos} />
            <MapClickCapture onMapClick={() => setSelectedLead(null)} />
            {availableLeads.map(lead => (
              <Marker
                key={lead.id}
                position={[lead.lat, lead.lng]}
                icon={leadIcon('#3b82f6')}
                eventHandlers={{ click: () => setSelectedLead(lead) }}
              >
                <Popup>{lead.address}</Popup>
              </Marker>
            ))}
            {assignedLeads.map(lead => (
              <Marker
                key={lead.id}
                position={[lead.lat, lead.lng]}
                icon={leadIcon('#ef4444')}
                eventHandlers={{ click: () => setSelectedLead(lead) }}
              >
                <Popup>{lead.address} — {lead.rep}</Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Legend */}
          <div className="absolute top-3 left-3 z-[999] bg-slate-900/90 rounded-lg px-3 py-2 text-xs text-slate-300 space-y-1 pointer-events-none">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Available</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Assigned</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-400 border-2 border-white inline-block" /> You</div>
          </div>

          {/* No leads notice */}
          {leads.length === 0 && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[999] bg-slate-900/95 rounded-xl px-5 py-4 text-center pointer-events-none">
              <MapPin size={24} className="text-slate-500 mx-auto mb-2" />
              <div className="text-slate-300 text-sm font-medium">No leads loaded</div>
              <div className="text-slate-500 text-xs mt-1">Leads will appear here once assigned</div>
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
              <div className="text-slate-400 text-sm">No claimed leads yet</div>
              <div className="text-slate-600 text-xs mt-1">Claim leads from the Map tab</div>
            </div>
          ) : (
            <div className="space-y-3">
              {myLeads.map(lead => (
                <div key={lead.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                  <div className="text-white text-sm font-medium">{lead.address}</div>
                  <div className="text-slate-400 text-xs mt-1">{lead.zip}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded-full">Claimed</span>
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
