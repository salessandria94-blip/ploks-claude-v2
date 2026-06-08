import { useState, useEffect } from 'react'
import { getAllReps, createRep } from '../api/sheets.js'
import { Users, ExternalLink, Copy, Check, RefreshCw, UserPlus, X, Eye, EyeOff, Phone, Mail } from 'lucide-react'

const FIELD_BASE = `${window.location.origin}/field`

// ── Helpers ───────────────────────────────────────────────────────────────────

function nameToSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function genPin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

// ── Rep Card ──────────────────────────────────────────────────────────────────

function RepCard({ rep }) {
  const [copied, setCopied] = useState(false)
  const [pinVisible, setPinVisible] = useState(false)
  const fieldUrl = `${FIELD_BASE}/${rep.slug}`

  function handleCopy() {
    navigator.clipboard.writeText(fieldUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      {/* Name + contact */}
      <div className="flex flex-col gap-1">
        <div className="text-slate-100 font-semibold text-base">{rep.name}</div>
        <div className="text-slate-500 text-xs">ID: {rep.id}</div>
        {rep.phone && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1">
            <Phone size={11} className="shrink-0" />
            {rep.phone}
          </div>
        )}
        {rep.email && (
          <div className="flex items-center gap-1.5 text-slate-400 text-xs">
            <Mail size={11} className="shrink-0" />
            {rep.email}
          </div>
        )}
      </div>

      {/* PIN */}
      {rep.pin && (
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs">PIN</span>
          <span className="font-mono text-sm text-slate-300">
            {pinVisible ? rep.pin : '••••'}
          </span>
          <button
            onClick={() => setPinVisible(v => !v)}
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            {pinVisible ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      )}

      {/* Field URL */}
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

// ── New Rep Modal ─────────────────────────────────────────────────────────────

function NewRepModal({ onSave, onClose }) {
  const [name,   setName]   = useState('')
  const [phone,  setPhone]  = useState('')
  const [email,  setEmail]  = useState('')
  const [pin,    setPin]    = useState(genPin)
  const [slug,   setSlug]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Auto-generate slug from name
  useEffect(() => {
    setSlug(nameToSlug(name))
  }, [name])

  async function handleSave() {
    if (!name.trim()) return setError('Name is required')
    if (!slug.trim()) return setError('URL slug is required')
    if (!pin.trim())  return setError('PIN is required')
    setSaving(true)
    setError('')
    try {
      const res = await createRep(name, phone, email, pin, slug)
      onSave(res.rep)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-slate-100 font-bold text-lg">New Rep</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">
            Name <span className="text-red-400">*</span>
          </label>
          <input
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="John Smith"
            autoFocus
          />
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">Phone</label>
          <input
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(904) 555-1234"
            type="tel"
          />
        </div>

        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">Email</label>
          <input
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="john@oakvalley.com"
            type="email"
          />
        </div>

        {/* PIN + Slug row */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 w-24 shrink-0">
            <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">PIN</label>
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-100 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={6}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <label className="text-slate-400 text-xs font-medium uppercase tracking-wide">URL Slug</label>
            <input
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-slate-300 text-sm font-mono focus:outline-none focus:border-blue-500 transition-colors"
              value={slug}
              onChange={e => setSlug(e.target.value)}
              placeholder="auto from name"
            />
          </div>
        </div>

        {/* Preview URL */}
        {slug && (
          <div className="bg-slate-800 rounded-lg px-3 py-2 text-slate-500 text-xs font-mono truncate">
            {FIELD_BASE}/{slug}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Creating…' : 'Create Rep'}
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Reps Page ─────────────────────────────────────────────────────────────────

export default function RepsPage() {
  const [reps,    setReps]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [showNew, setShowNew] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await getAllReps()
      setReps(res.reps || [])
    } catch (err) {
      setError('Failed to load: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function handleNewRep(rep) {
    setReps(prev => [...prev, rep].sort((a, b) => a.name.localeCompare(b.name)))
    setShowNew(false)
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Reps</h1>
          {!loading && reps.length > 0 && (
            <p className="text-slate-400 text-sm mt-0.5">{reps.length} reps</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            <UserPlus size={14} />
            New Rep
          </button>
          <button onClick={load} disabled={loading} className="text-slate-400 hover:text-slate-200 transition-colors">
            <RefreshCw size={16} className={loading ? 'animate-spin text-blue-400' : ''} />
          </button>
        </div>
      </div>

      {/* New rep modal */}
      {showNew && <NewRepModal onSave={handleNewRep} onClose={() => setShowNew(false)} />}

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      {loading && (
        <div className="text-slate-400 text-sm">Loading reps…</div>
      )}

      {!loading && reps.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Users size={32} className="text-slate-600 mb-3" />
          <div className="text-slate-400 text-sm font-medium">No reps yet</div>
          <div className="text-slate-600 text-xs mt-1">Click New Rep to add your first one</div>
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
