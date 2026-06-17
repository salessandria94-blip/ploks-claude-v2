import { useState } from 'react'
import { Search, Loader2, X } from 'lucide-react'

// Geocodes an address using Nominatim (OpenStreetMap) — no API key required.
// Calls onResult([lat, lng]) on success, onError(msg) on failure.
// Pass active=true + onClear to toggle the button from 🔍 to ✕ when a pin is dropped.
export default function AddressSearch({ onResult, onError, onClear, active = false, compact = false }) {
  const [query,   setQuery]   = useState('')
  const [loading, setLoading] = useState(false)

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

  function handleClear() {
    setQuery('')
    onClear?.()
  }

  const showClear = active && onClear

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
      {showClear ? (
        <button
          type="button"
          onClick={handleClear}
          title="Clear pin"
          className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-red-400 hover:text-red-300 hover:border-slate-500 transition-colors"
        >
          <X size={14} />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!!loading || !query.trim()}
          title="Go to address"
          className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 transition-colors"
        >
          {loading
            ? <Loader2 size={14} className="animate-spin" />
            : <Search size={14} />}
        </button>
      )}
    </form>
  )
}
