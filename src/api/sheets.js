// Apps Script Web App bridge — Phase 2 implementation
// All reads/writes go through this module. Nothing talks to Google directly.

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const API_SECRET = import.meta.env.VITE_API_SECRET

async function call(action, payload = {}, attempt = 0) {
  if (!API_URL) throw new Error('VITE_APPS_SCRIPT_URL not set')
  // Apps Script drops POST bodies on redirect — use GET with encoded params instead
  const params = new URLSearchParams({
    action,
    secret: API_SECRET,
    data: JSON.stringify(payload),
  })
  // Mobile connections stall silently — without a timeout the request hangs
  // forever. Abort after 20s and auto-retry once before surfacing an error.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${API_URL}?${params.toString()}`, {
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`API error ${res.status}`)
    const data = JSON.parse(await res.text())
    if (data.error) throw new Error(data.error)
    return data
  } catch (e) {
    // Retry once on a stalled/aborted connection (transient on mobile).
    if ((e.name === 'AbortError' || e.name === 'TypeError') && attempt < 1) {
      return call(action, payload, attempt + 1)
    }
    if (e.name === 'AbortError') throw new Error('Network timed out — try again')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function validatePin(repSlug, pin) {
  // Returns rep profile if valid, throws if invalid
  return call('validatePin', { repSlug, pin })
}

export async function getLeadsForZip(zip) {
  return call('getLeadsForZip', { zip })
}

export async function getLeadsForRep(repId) {
  return call('getLeadsForRep', { repId })
}

export async function claimLead(leadId, repId, repName, location, zip) {
  return call('claimLead', { leadId, repId, repName, location, zip })
}

export async function updateLeadStatus(leadId, status, notes, repId) {
  return call('updateLeadStatus', { leadId, status, notes, repId })
}

export async function logActivity(entry) {
  return call('logActivity', entry)
}

export async function getAllLeads(zip, filters = {}) {
  return call('getAllLeads', { zip, ...filters })
}

export async function getZipList() {
  return call('getZipList', {})
}

export async function getAllReps() {
  return call('getAllReps', {})
}

export async function assignLead(leadId, repId, repName) {
  return call('assignLead', { leadId, repId, repName })
}

export async function unassignLead(leadId) {
  return call('unassignLead', { leadId })
}

export async function claimLeadsBulk(leadIds, repId, repName, zip) {
  return call('claimLeadsBulk', { leadIds, repId, repName, zip })
}

export async function unassignLeadsBulk(leadIds, repId, zip) {
  return call('unassignLeadsBulk', { leadIds, repId, zip })
}

export async function updateLeadProfile(leadId, fields) {
  return call('updateLeadProfile', { leadId, fields })
}

export async function unassignAll() {
  return call('unassignAll', {})
}

export async function getLeadActivity(leadId) {
  return call('getLeadActivity', { leadId })
}

export async function getRepStats() {
  return call('getRepStats', {})
}

