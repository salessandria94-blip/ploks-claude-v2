import { useState, useEffect, useMemo } from 'react'
import { getAllLeads, getZipList, getAllReps, assignLead } from '../api/sheets.js'
import { RefreshCw, ChevronDown, MapPin } from 'lucide-react'

const STATUSES = ['No Contact', 'Contacted', 'Working', 'Closed']

function statusColor(status) {
  if (status === 'Closed')    return 'bg-green-900 text-green-300'
  if (status === 'Working')   return 'bg-yellow-900 text-yellow-300'
  if (status === 'Contacted') return 'bg-blue-900 text-blue-300'
  return 'bg-slate-700 text-slate-300'
}

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
  const [assignDropdown, setAssignDropdown] = useState(null)
  const [assigning, setAssigning] = useState(null)

  // Load ZIP list and reps on mount
  useEffect(() => {
    async function loadMeta() {
      try {
        const [zipRes, repRes] = await Promise.all([getZipList(), getAllReps()])
        setZips(zipRes.zips || [])
        setReps(repRes.reps || [])
      } catch (err) {
        setError('Failed to load ZIP list: ' + err.message)
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
    try {
      const res = await getAllLeads(zip, {
        status: filterStatus || undefined,
      })
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
    loadLeads(zip)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l => {
      if (filterStatus && l.status !== filterStatus) return false
      if (filterRep === '__unassigned' && l.assigned_rep_id) return false
      if (filterRep && filterRep !== '__unassigned' && l.assigned_rep_id !== filterRep) return false
      if (q && !l.address.toLowerCase().includes(q) && !l.owner_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [leads, filterStatus, filterRep, search])

  async function handleAssign(lead, rep) {
    setAssigning(lead.id)
    setAssignDropdown(null)
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

  return (
    <div className="p-6" onClick={() => setAssignDropdown(null)}>
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

      {/* ZIP selector — always visible */}
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
              onChange={e => { setFilterStatus(e.target.value) }}
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

      {loading && (
        <div className="text-slate-400 text-sm">Loading leads for ZIP {selectedZip}…</div>
      )}

      {!loading && selectedZip && filtered.length === 0 && (
        <div className="text-slate-500 text-sm">No leads match the current filters.</div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3">Address</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">Bucket</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Assigned To</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} className="border-b border-slate-800/60 hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 text-slate-100 font-medium">{lead.address || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{lead.owner_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{lead.bucket || '—'}</td>
                  <td className="px-4 py-3">
                    {lead.status
                      ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(lead.status)}`}>{lead.status}</span>
                      : <span className="text-slate-600 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 relative" onClick={e => e.stopPropagation()}>
                    {assigning === lead.id ? (
                      <span className="text-slate-500 text-xs">Saving…</span>
                    ) : (
                      <div className="relative inline-block">
                        <button
                          onClick={() => setAssignDropdown(assignDropdown === lead.id ? null : lead.id)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                        >
                          {lead.assigned_rep || 'Unassigned'}
                          <ChevronDown size={12} />
                        </button>
                        {assignDropdown === lead.id && (
                          <div className="absolute left-0 top-8 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl min-w-44 overflow-hidden">
                            {reps.map(rep => (
                              <button
                                key={rep.id}
                                onClick={() => handleAssign(lead, rep)}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-800 transition-colors ${lead.assigned_rep_id === rep.id ? 'text-blue-400' : 'text-slate-200'}`}
                              >
                                {rep.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
