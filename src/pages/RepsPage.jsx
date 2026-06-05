import { useState, useEffect } from 'react'
import { getRepStats } from '../api/sheets.js'
import { Users, ExternalLink, Copy, Check, RefreshCw } from 'lucide-react'

const FIELD_BASE = `${window.location.origin}/field`

function RepCard({ rep }) {
  const [copied, setCopied] = useState(false)
  const fieldUrl = `${FIELD_BASE}/${rep.slug}`

  function handleCopy() {
    navigator.clipboard.writeText(fieldUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div>
        <div className="text-slate-100 font-semibold text-base">{rep.name}</div>
        <div className="text-slate-500 text-xs mt-0.5">ID: {rep.id}</div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400 truncate font-mono">
          /field/{rep.slug}
        </div>
        <button
          onClick={handleCopy}
          title="Copy field link"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
        <a
          href={fieldUrl}
          target="_blank"
          rel="noreferrer"
          title="Open field view"
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors shrink-0"
        >
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  )
}

export default function RepsPage() {
  const [reps, setReps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await getRepStats()
      setReps(res.reps || [])
    } catch (err) {
      setError('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Reps</h1>
          {!loading && reps.length > 0 && (
            <p className="text-slate-400 text-sm mt-0.5">{reps.length} reps</p>
          )}
        </div>
        <button onClick={load} disabled={loading} className="text-slate-400 hover:text-slate-200">
          <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      {loading && (
        <div className="text-slate-400 text-sm">Loading reps…</div>
      )}

      {!loading && reps.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users size={32} className="text-slate-600 mb-3" />
          <div className="text-slate-400 text-sm font-medium">No reps found</div>
          <div className="text-slate-600 text-xs mt-1">No reps found in the database</div>
        </div>
      )}

      {!loading && reps.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reps.map(rep => <RepCard key={rep.id} rep={rep} />)}
        </div>
      )}
    </div>
  )
}
