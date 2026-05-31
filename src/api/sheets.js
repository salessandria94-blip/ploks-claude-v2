// Apps Script Web App bridge — Phase 2 implementation
// All reads/writes go through this module. Nothing talks to Google directly.

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL
const API_SECRET = import.meta.env.VITE_API_SECRET

async function call(action, payload = {}) {
  if (!API_URL) throw new Error('VITE_APPS_SCRIPT_URL not set')
  // Apps Script drops POST bodies on redirect — use GET with encoded params instead
  const params = new URLSearchParams({
    action,
    secret: API_SECRET,
    data: JSON.stringify(payload),
  })
  const res = await fetch(`${API_URL}?${params.toString()}`, { redirect: 'follow' })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  const text = await res.text()
  const data = JSON.parse(text)
  if (data.error) throw new Error(data.error)
  return data
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

export async function claimLead(leadId, repId, location) {
  return call('claimLead', { leadId, repId, location })
}

export async function updateLeadStatus(leadId, status, notes) {
  return call('updateLeadStatus', { leadId, status, notes })
}

export async function logActivity(entry) {
  return call('logActivity', entry)
}

export async function getAllLeads(filters = {}) {
  return call('getAllLeads', filters)
}

export async function getAllReps() {
  return call('getAllReps', {})
}

export async function assignLead(leadId, repId, repName) {
  return call('assignLead', { leadId, repId, repName })
}
