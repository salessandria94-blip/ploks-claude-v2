import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import {
  SATELLITE_TILE, JACKSONVILLE_CENTER, leadIcon, FitBounds, CenterOnLead, ClickToClear, DrawTool,
  COLOR_OPEN, COLOR_OTHERS, COLOR_MINE, COLOR_SELECTED,
} from '../components/mapTools.jsx'
import { validatePin, getAllReps, getZipList, getAllLeads, claimLead, unassignLead, updateLeadStatus } from '../api/sheets.js'
import { LayoutDashboard, Map as MapIcon, List, FileText, Calendar, LogOut, X, Navigation, Lasso, Target, Loader2 } from 'lucide-react'

const STATUSES = ['No Contact', 'Contacted', 'Working', 'Closed']
const STORE_KEY = 'ploks_rep_v2'

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
    } catch {
      setError('Connection error'); setPin('')
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

function RepMap({ rep }) {
  const [zips, setZips] = useState([])
  const [selectedZip, setSelectedZip] = useState('')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [tool, setTool] = useState(null)
  const [busy, setBusy] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkProgress, setBulkProgress] = useState([0, 0])

  useEffect(() => { getZipList().then(r => setZips(r.zips || [])).catch(() => {}) }, [])

  const selectedIds = useMemo(() => new Set(selectedLeads.map(l => l.id)), [selectedLeads])
  const geoLeads = useMemo(() => leads.filter(l => l.lat && l.lng), [leads])

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
      await claimLead(lead.id, rep.id, rep.name, null)
      patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id, status: lead.status || 'No Contact' })
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }
  async function releaseOne(lead) {
    setBusy(lead.id)
    try {
      await unassignLead(lead.id)
      patchLead(lead.id, { assigned_rep: '', assigned_rep_id: '', status: '' })
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }
  async function setStatus(lead, status) {
    setBusy(lead.id)
    try {
      await updateLeadStatus(lead.id, status, '', rep.id)
      patchLead(lead.id, { status })
    } catch (err) { alert(err.message) } finally { setBusy(null) }
  }

  async function bulkClaim(targets) {
    setBulkBusy(true); setError(''); setBulkProgress([0, targets.length])
    let done = 0, ok = 0
    await Promise.allSettled(targets.map(async lead => {
      try {
        await claimLead(lead.id, rep.id, rep.name, null)
        patchLead(lead.id, { assigned_rep: rep.name, assigned_rep_id: rep.id, status: lead.status || 'No Contact' })
        ok++
      } finally { done++; setBulkProgress([done, targets.length]) }
    }))
    setBulkBusy(false)
    const failed = targets.length - ok
    if (failed > 0) setError(`${ok} claimed, ${failed} failed (cap reached or already taken).`)
    setSelectedLeads([])
  }
  async function bulkRelease(targets) {
    setBulkBusy(true); setError(''); setBulkProgress([0, targets.length])
    let done = 0
    await Promise.allSettled(targets.map(async lead => {
      try {
        await unassignLead(lead.id)
        patchLead(lead.id, { assigned_rep: '', assigned_rep_id: '', status: '' })
      } finally { done++; setBulkProgress([done, targets.length]) }
    }))
    setBulkBusy(false)
    setSelectedLeads([])
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

        {/* Single lead card */}
        {selectedLead && selectedLeads.length === 0 && (
          <RepLeadCard
            lead={selectedLead}
            rel={relationOf(selectedLead, rep.id)}
            busy={busy === selectedLead.id}
            onClose={() => setSelectedLead(null)}
            onClaim={() => claimOne(selectedLead)}
            onRelease={() => releaseOne(selectedLead)}
            onStatus={s => setStatus(selectedLead, s)}
            onNavigate={() => openNavigate(selectedLead)}
          />
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
                <button
                  onClick={() => bulkClaim(selOpen)}
                  disabled={bulkBusy}
                  className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold"
                >
                  {bulkBusy ? `${bulkProgress[0]}/${bulkProgress[1]}…` : `Claim ${selOpen.length} open`}
                </button>
              )}
              {selMine.length > 0 && (
                <button
                  onClick={() => bulkRelease(selMine)}
                  disabled={bulkBusy}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold"
                >
                  {bulkBusy ? `${bulkProgress[0]}/${bulkProgress[1]}…` : `Release ${selMine.length} mine`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RepLeadCard({ lead, rel, busy, onClose, onClaim, onRelease, onStatus, onNavigate }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-[998] bg-slate-900 border-t border-slate-700 rounded-t-2xl p-4 shadow-2xl">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{lead.address}</div>
          <div className="text-slate-400 text-xs mt-0.5">
            ZIP {lead.zip}{lead.roof_age ? ` · ${lead.roof_age} yr roof` : ''}
            {rel === 'others' && <span className="text-orange-400"> · {lead.assigned_rep}</span>}
            {rel === 'mine' && lead.status && <span className="text-green-400"> · {lead.status}</span>}
          </div>
          {lead.owner_name && <div className="text-slate-300 text-xs mt-0.5">{lead.owner_name}</div>}
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1"><X size={16} /></button>
      </div>

      {rel === 'mine' && (
        <div className="flex flex-wrap gap-1.5 my-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => onStatus(s)}
              disabled={busy}
              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium disabled:opacity-50 ${lead.status === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
            >{s}</button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button onClick={onNavigate} className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2.5 rounded-lg">
          <Navigation size={15} /> Navigate
        </button>
        {rel === 'open' && (
          <button onClick={onClaim} disabled={busy} className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-lg font-semibold">
            {busy ? 'Claiming…' : 'Claim'}
          </button>
        )}
        {rel === 'mine' && (
          <button onClick={onRelease} disabled={busy} className="flex-1 bg-red-900 hover:bg-red-800 disabled:opacity-50 text-red-200 text-sm py-2.5 rounded-lg font-semibold">
            {busy ? '…' : 'Unassign'}
          </button>
        )}
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

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === 'map' && <RepMap rep={rep} />}
        {tab === 'dashboard' && <Placeholder title="Home" lines="Your cards land here next: Claims X/500, Expiring soon, Follow-ups, Pipeline." />}
        {tab === 'leads' && <Placeholder title="My Leads" lines="Your claimed leads — with status, follow-ups, transfer and unassign — ship in the next build." />}
        {tab === 'docs' && <Placeholder title="Documents" lines="Upload and access your documents here (coming soon)." />}
        {tab === 'calendar' && <Placeholder title="Calendar" lines="Reminders and follow-up due dates will show here (coming soon)." />}
      </div>
    </div>
  )
}
