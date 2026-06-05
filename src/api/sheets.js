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
    .select('id, name, slug')
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
    .select('id, name, slug')
    .eq('active', true)
    .order('name')
  if (error) throw new Error(error.message)
  return { reps: data }
}

export async function getRepStats() {
  return getAllReps()
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
  if (error) throw new Error(error.message)
  return { leads: data, repId, count: data.length }
}

export async function getLeadsForZip(zip) {
  return getAllLeads(zip)
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
