// PLOKS API — Supabase backend
// All reads/writes go directly to Postgres. No more Apps Script.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function insertLog(action, leadId, repId, status = '', notes = '') {
  await supabase.from('activity_log').insert({
    action,
    lead_id:  leadId  || null,
    rep_id:   repId   || null,
    status:   status  || null,
    notes:    notes   || null,
  })
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function validatePin(repSlug, pin) {
  const { data, error } = await supabase
    .from('reps')
    .select('id, name, slug, is_manager')
    .eq('slug', repSlug)
    .eq('pin', pin)
    .single()
  if (error || !data) throw new Error('Invalid PIN')
  return { ok: true, rep: data }
}

// ── Reps ──────────────────────────────────────────────────────────────────────

export async function getAllReps() {
  const { data, error } = await supabase
    .from('reps')
    .select('id, name, slug, phone, email, pin')
    .eq('active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return { reps: data }
}

export async function getRepStats() {
  return getAllReps()
}

export async function updateRep(id, fields) {
  const updates = {}
  if (fields.name  !== undefined) updates.name  = fields.name
  if (fields.phone !== undefined) updates.phone = fields.phone
  if (fields.email !== undefined) updates.email = fields.email
  if (fields.pin   !== undefined) updates.pin   = fields.pin
  const { error } = await supabase.from('reps').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function deactivateRep(id) {
  const { error } = await supabase.from('reps').update({ active: false }).eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function createRep(name, phone, email, pin, slug) {
  // Auto-generate next REP-XXX id based on existing max
  const { data: existing } = await supabase
    .from('reps')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
  let nextId = 'REP-001'
  if (existing && existing.length > 0) {
    const num = parseInt((existing[0].id || '').replace(/\D/g, ''), 10) || 0
    nextId = `REP-${String(num + 1).padStart(3, '0')}`
  }

  const { data, error } = await supabase
    .from('reps')
    .insert({
      id:     nextId,
      name:   name.trim(),
      slug:   slug.trim(),
      pin:    pin.trim(),
      phone:  phone?.trim() || null,
      email:  email?.trim() || null,
      active: true,
    })
    .select('id, name, slug, phone, email, pin')
    .single()
  if (error) throw new Error(error.message)
  return { ok: true, rep: data }
}

// ── Leads — reads ─────────────────────────────────────────────────────────────

export async function getZipList() {
  const { data, error } = await supabase.rpc('get_zip_list')
  if (error) throw new Error(error.message)
  return { zips: data.map(r => r.zip) }
}

export async function getAllLeads(zip) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('zip', zip)
    .eq('bucket', 'ACTIVE')
  if (error) throw new Error(error.message)
  return { leads: data, zip, found: true, count: data.length }
}

export async function getLeadsForRep(repId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('assigned_rep_id', repId)
    .limit(5000)   // a single rep won't exceed this; guards against PostgREST 1000-row default
  if (error) throw new Error(error.message)
  return { leads: data, repId, count: data.length }
}

export async function getLeadById(leadId) {
  const [{ data: lead, error: e1 }, { data: activity, error: e2 }] = await Promise.all([
    supabase.from('leads').select('*').eq('id', leadId).single(),
    supabase.from('activity_log').select('*').eq('lead_id', leadId).order('ts', { ascending: false }).limit(30),
  ])
  if (e1) throw new Error(e1.message)
  return { lead: lead || null, activity: activity || [] }
}

export async function getLeadsForRepByStatus(repId, status) {
  let q = supabase
    .from('leads')
    .select('id, address, zip, status, owner_name, phone, claimed_at, status_changed_at')
    .eq('assigned_rep_id', repId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('status_changed_at', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  return { leads: data || [] }
}

export async function getLeadsForZip(zip) {
  return getAllLeads(zip)
}

export async function getAdminLeadsForZip(zip) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('zip', zip)
    .not('assigned_rep_id', 'is', null)
  if (error) throw new Error(error.message)
  return { leads: data || [] }
}

export async function getAdminZipStats() {
  // Must paginate — Supabase caps un-ranged queries at 1000 rows and we have
  // 1400+ assigned leads, so a single fetch gives wrong per-ZIP counts.
  const PAGE = 1000
  let all = [], from = 0
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('zip')
      .not('assigned_rep_id', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  const counts = {}
  all.forEach(r => { counts[r.zip] = (counts[r.zip] || 0) + 1 })
  return { counts }
}

export async function getAllAssignedLeads() {
  // Supabase PostgREST hard-caps at 1000 rows server-side regardless of .limit().
  // Paginate in 1000-row pages until we have everything.
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .not('assigned_rep_id', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break   // last page
    from += PAGE
  }
  return { leads: all }
}

export async function pingRepLocation(repId, lat, lng) {
  const { error } = await supabase
    .from('rep_locations')
    .upsert({ rep_id: repId, lat, lng, updated_at: new Date().toISOString() }, { onConflict: 'rep_id' })
  if (error) throw new Error(error.message)
}

export async function getRepLocations() {
  const { data, error } = await supabase
    .from('rep_locations')
    .select('rep_id, lat, lng, updated_at')
  if (error) throw new Error(error.message)
  const cutoff = Date.now() - 5 * 60 * 1000          // hide dots older than 5 min
  return { locations: (data || []).filter(l => new Date(l.updated_at).getTime() > cutoff) }
}

export async function getUnassignedLeadsByZip(zip) {
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('zip', zip)
      .is('assigned_rep_id', null)
      .not('lat', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { leads: all }
}

export async function getLeadsInBounds(latMin, latMax, lngMin, lngMax) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('bucket', 'ACTIVE')
    .gte('lat', latMin).lte('lat', latMax)
    .gte('lng', lngMin).lte('lng', lngMax)
  if (error) throw new Error(error.message)
  return { leads: data || [] }
}

export async function getLeadsNearPin(lat, lng, radiusMiles = 2) {
  const DEG_LAT = radiusMiles / 69.0
  const DEG_LNG = radiusMiles / (69.0 * Math.cos(lat * Math.PI / 180))
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('bucket', 'ACTIVE')
    .gte('lat', lat - DEG_LAT).lte('lat', lat + DEG_LAT)
    .gte('lng', lng - DEG_LNG).lte('lng', lng + DEG_LNG)
  if (error) throw new Error(error.message)
  const leads = (data || []).filter(l =>
    l.lat && l.lng && haversineMiles(lat, lng, l.lat, l.lng) <= radiusMiles
  )
  return { leads, count: leads.length, pinLat: lat, pinLng: lng, miles: radiusMiles }
}

export async function getLeadActivity(leadId) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('lead_id', leadId)
    .order('ts', { ascending: false })
  if (error) throw new Error(error.message)
  const entries = (data || []).map(r => ({
    timestamp: r.ts
      ? new Date(r.ts).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '',
    action:  r.action   || '',
    rep_id:  r.rep_id   || '',
    status:  r.status   || '',
    notes:   r.notes    || '',
  }))
  return { entries, leadId }
}

// ── Leads — writes ────────────────────────────────────────────────────────────

export async function claimLead(leadId, repId, repName, location, zip) {
  const { data, error } = await supabase.rpc('claim_lead_safe', {
    p_lead_id:  leadId,
    p_rep_id:   repId,
    p_rep_name: repName || repId,
  })
  if (error) throw new Error(error.message)
  if (!data.ok) {
    if (data.error === 'cap')   throw new Error("You've reached your 500 No Contact lead cap.")
    if (data.error === 'taken') throw new Error('Lead was just claimed by someone else.')
    throw new Error('Claim failed')
  }
  await insertLog('claim', leadId, repId)
  return { ok: true, leadId, repId }
}

export async function claimLeadsBulk(leadIds, repId, repName, zip) {
  const CHUNK = 100
  const claimed = []
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('claim_leads_bulk_safe', {
      p_lead_ids: leadIds.slice(i, i + CHUNK),
      p_rep_id:   repId,
      p_rep_name: repName || repId,
    })
    if (error) throw new Error(error.message)
    if (!data.ok && data.error === 'cap') break  // cap hit — stop claiming
    claimed.push(...(data.claimed || []))
  }
  if (claimed.length) {
    await supabase.from('activity_log').insert(
      claimed.map(id => ({ action: 'bulk_claim', lead_id: id, rep_id: repId }))
    )
  }
  return { ok: true, claimed, skipped: leadIds.filter(id => !claimed.includes(id)) }
}

export async function unassignLead(leadId, zip) {
  const { error } = await supabase
    .from('leads')
    .update({
      assigned_rep:     null,
      assigned_rep_id:  null,
      assigned_week:    null,
      status:           'No Contact',
      claimed_at:       null,
      status_changed_at: null,
    })
    .eq('id', leadId)
  if (error) throw new Error(error.message)
  await insertLog('unassign', leadId, '')
  return { ok: true, leadId }
}

export async function unassignLeadsBulk(leadIds, repId, zip) {
  const CHUNK = 100
  const released = []
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('leads')
      .update({
        assigned_rep:      null,
        assigned_rep_id:   null,
        assigned_week:     null,
        status:            'No Contact',
        claimed_at:        null,
        status_changed_at: null,
      })
      .in('id', leadIds.slice(i, i + CHUNK))
      .eq('assigned_rep_id', repId)
      .select('id')
    if (error) throw new Error(error.message)
    released.push(...(data || []).map(r => r.id))
  }
  if (released.length) {
    await supabase.from('activity_log').insert(
      released.map(id => ({ action: 'bulk_unassign', lead_id: id, rep_id: repId }))
    )
  }
  return { ok: true, released }
}

export async function assignLead(leadId, repId, repName, zip) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('leads')
    .update({
      assigned_rep:    repName || repId,
      assigned_rep_id: repId,
      assigned_week:   now.slice(0, 10),
      claimed_at:      now,
    })
    .eq('id', leadId)
  if (error) throw new Error(error.message)
  await insertLog('admin_assign', leadId, repId, '', `Assigned to ${repName || repId}`)
  return { ok: true, leadId, repId }
}

export async function updateLeadStatus(leadId, status, notes, repId, zip) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('leads')
    .update({ status, status_changed_at: now })
    .eq('id', leadId)
  if (error) throw new Error(error.message)
  await insertLog('status_update', leadId, repId || '', status, notes || '')
  return { ok: true, leadId, status }
}

export async function updateLeadProfile(leadId, fields, repId) {
  const updates = {}
  if (fields.owner_name !== undefined) updates.owner_name = fields.owner_name
  if (fields.phone      !== undefined) updates.phone      = fields.phone
  if (fields.email      !== undefined) updates.email      = fields.email
  if (fields.insurance  !== undefined) updates.insurance  = fields.insurance
  if (fields.notes      !== undefined) updates.notes      = fields.notes
  if (fields.status     !== undefined) {
    updates.status = fields.status
    updates.status_changed_at = new Date().toISOString()
  }
  if (Object.keys(updates).length) {
    const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
    if (error) throw new Error(error.message)
  }
  const logs = []
  if (fields.notes !== undefined)
    logs.push({ action: 'note', lead_id: leadId, rep_id: repId || '', notes: String(fields.notes) })
  const LABELS = { owner_name: 'Owner', phone: 'Phone', email: 'Email', insurance: 'Insurance' }
  const editParts = Object.keys(fields).filter(k => LABELS[k]).map(k => `${LABELS[k]}: ${fields[k]}`)
  if (editParts.length)
    logs.push({ action: 'edit', lead_id: leadId, rep_id: repId || '', notes: editParts.join(', ') })
  if (logs.length) await supabase.from('activity_log').insert(logs)
  return { ok: true, leadId }
}

export async function unassignAll() {
  const { error } = await supabase
    .from('leads')
    .update({
      assigned_rep: null, assigned_rep_id: null, assigned_week: null,
      status: 'No Contact', claimed_at: null, status_changed_at: null,
    })
    .not('assigned_rep_id', 'is', null)
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function logActivity(entry) {
  await insertLog(entry.action || 'event', entry.leadId, entry.repId, entry.status, entry.notes)
  return { ok: true }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
  // All aggregation runs server-side via RPC — no row limit issues
  const [{ data: stats, error: e1 }, { data: reps, error: e2 }] = await Promise.all([
    supabase.rpc('ploks_dashboard_stats'),
    supabase.from('reps').select('id, name, slug').eq('active', true).order('name'),
  ])
  if (e1) throw new Error(e1.message)
  if (e2) throw new Error(e2.message)

  // Coerce all numeric fields from strings (jsonb returns them as numbers already, but be safe)
  const n = v => Number(v) || 0
  const raw = stats || {}

  const totals = {
    total:      n(raw.totals?.total),
    open:       n(raw.totals?.open),
    claimed:    n(raw.totals?.claimed),
    contacted:  n(raw.totals?.contacted),
    follow_up:  n(raw.totals?.follow_up),
    working:    n(raw.totals?.working),
    closed:     n(raw.totals?.closed),
  }

  const repById = Object.fromEntries(
    (raw.rep_stats || []).map(r => [r.id, r])
  )
  const repStats = (reps || []).map(r => ({
    id: r.id, name: r.name, slug: r.slug,
    claimed:   n(repById[r.id]?.claimed),
    contacted: n(repById[r.id]?.contacted),
    follow_up: n(repById[r.id]?.follow_up),
    working:   n(repById[r.id]?.working),
    closed:    n(repById[r.id]?.closed),
  }))

  const zipStats = (raw.zip_stats || []).map(z => ({
    zip:       z.zip,
    total:     n(z.total),
    contacted: n(z.contacted),
    follow_up: n(z.follow_up),
    working:   n(z.working),
    closed:    n(z.closed),
    score:     n(z.score),
  }))

  return { totals, repStats, zipStats }
}

export async function getRecentActivity(limit = 20) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('id, ts, action, lead_id, rep_id, status, notes')
    .order('ts', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return { entries: data || [] }
}

// Full paginated activity feed with optional rep + action filters.
// Tries to join leads for address; falls back gracefully if FK not defined.
export async function getActivityPage({ limit = 60, offset = 0, repId = null, actions = null } = {}) {
  let q = supabase
    .from('activity_log')
    .select('id, ts, action, lead_id, rep_id, status, notes, leads(address, zip)')
    .order('ts', { ascending: false })
    .range(offset, offset + limit - 1)
  if (repId)   q = q.eq('rep_id', repId)
  if (actions && actions.length) q = q.in('action', actions)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { entries: data || [], hasMore: (data || []).length === limit }
}

// ── Appointments ──────────────────────────────────────────────────────────────

export async function createAppointment(leadId, repId, scheduledAt, notes) {
  const { data, error } = await supabase
    .from('appointments')
    .insert({ lead_id: String(leadId), rep_id: String(repId), scheduled_at: scheduledAt, notes: notes || null })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return { ok: true, appointment: data }
}

export async function getAppointmentsForRep(repId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, leads(address, zip, status)')
    .eq('rep_id', String(repId))
    .order('scheduled_at', { ascending: true })
  if (error) throw new Error(error.message)
  return { appointments: data || [] }
}

export async function getAppointmentsForAdmin() {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, leads(address, zip, status), reps(name)')
    .order('scheduled_at', { ascending: true })
  if (error) throw new Error(error.message)
  return { appointments: data || [] }
}

export async function deleteAppointment(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return { ok: true }
}
