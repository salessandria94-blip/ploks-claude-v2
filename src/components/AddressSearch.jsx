import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

// Geocodes an address using Nominatim (OpenStreetMap) — no API key required.
// Calls onResult([lat, lng]) on success, onError(msg) on failure.
export default function AddressSearch({ onResult, onError, compact = false }) {
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=us`
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      if (!data[0]) {
        onError?.('Address not found.')
        return
      }
      onResult([parseFloat(data[0].lat), parseFloat(data[0].lon)])
    } catch {
      onError?.('Geocoding failed — check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search address…"
        className={`bg-slate-800 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-colors ${
          compact ? 'px-2.5 py-1 w-48' : 'px-3 py-1.5 w-64'
        }`}
      />
      <button
        type="submit"
        disabled={!!loading || !query.trim()}
        className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 transition-colors"
        title="Go to address"
      >
        {loading
          ? <Loader2 size={14} className="animate-spin" />
          : <Search size={14} />}
      </button>
    </form>
  )
}
