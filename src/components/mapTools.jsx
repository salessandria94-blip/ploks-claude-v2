// Shared Leaflet helpers used by both the admin Map and the rep workspace map.
import { useEffect, useRef } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

export const SATELLITE_TILE = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: '© ESRI',
}
export const JACKSONVILLE_CENTER = [30.3322, -81.6557]

export const COLOR_OPEN = '#3b82f6'     // blue  — unclaimed
export const COLOR_OTHERS = '#f97316'   // orange — owned by another rep
export const COLOR_MINE = '#22c55e'     // green — mine
export const COLOR_SELECTED = '#facc15' // yellow — selected by lasso/radius

// The rep's own live position — a pulsing blue dot, distinct from lead pins.
export const repLocationIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 0 5px rgba(37,99,235,0.30)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

export function leadIcon(color, selected) {
  const size = selected ? 18 : 14
  const ring = selected
    ? 'box-shadow:0 0 0 3px rgba(250,204,21,0.6);'
    : 'box-shadow:0 1px 4px rgba(0,0,0,0.5);'
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;${ring}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function pointInPolygon(pt, poly) {
  const x = pt[0], y = pt[1]
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

// Fit map to all loaded leads when the set grows (not on selection changes).
export function FitBounds({ leads }) {
  const map = useMap()
  const lastCount = useRef(0)
  useEffect(() => {
    if (leads.length === 0) { lastCount.current = 0; return }
    if (leads.length === lastCount.current) return
    lastCount.current = leads.length
    const pts = leads.filter(l => l.lat && l.lng).map(l => [l.lat, l.lng])
    if (pts.length === 0) return
    if (pts.length === 1) { map.setView(pts[0], 16); return }
    map.fitBounds(L.latLngBounds(pts), { padding: [50, 50] })
  }, [leads, map])
  return null
}

// Center on a focused lead when it changes.
export function CenterOnLead({ lead, minZoom = 16 }) {
  const map = useMap()
  useEffect(() => {
    if (!lead || !lead.lat || !lead.lng) return
    const t = setTimeout(() => {
      map.invalidateSize()
      map.setView([lead.lat, lead.lng], Math.max(map.getZoom(), minZoom), { animate: true })
    }, 120)
    return () => clearTimeout(t)
  }, [lead, map, minZoom])
  return null
}

// Clear selection when tapping empty map (only when no draw tool is active).
export function ClickToClear({ enabled, onClear }) {
  useMapEvents({ click: () => { if (enabled) onClear() } })
  return null
}

// Lasso / radius drawing via pointer events — works with mouse, touch, stylus.
// Disables panning while a tool is active.
export function DrawTool({ tool, leads, onSelect }) {
  const map = useMap()
  useEffect(() => {
    if (!tool) { map.dragging.enable(); return }
    const container = map.getContainer()
    map.dragging.disable()
    container.style.cursor = 'crosshair'
    container.style.touchAction = 'none'

    let drawing = false
    let layer = null
    let points = []
    let center = null

    const clearLayer = () => { if (layer) { map.removeLayer(layer); layer = null } }
    const toLatLng = e => {
      const rect = container.getBoundingClientRect()
      return map.containerPointToLatLng(L.point(e.clientX - rect.left, e.clientY - rect.top))
    }

    function onDown(e) {
      if (e.button != null && e.button !== 0) return
      e.preventDefault()
      drawing = true
      try { container.setPointerCapture(e.pointerId) } catch { /* noop */ }
      clearLayer()
      const ll = toLatLng(e)
      if (tool === 'lasso') {
        points = [ll]
        layer = L.polyline(points, { color: COLOR_SELECTED, weight: 2 }).addTo(map)
      } else {
        center = ll
        layer = L.circle(center, { radius: 0, color: COLOR_SELECTED, weight: 2, fillColor: COLOR_SELECTED, fillOpacity: 0.12 }).addTo(map)
      }
    }
    function onMove(e) {
      if (!drawing) return
      e.preventDefault()
      const ll = toLatLng(e)
      if (tool === 'lasso') { points.push(ll); layer.setLatLngs(points) }
      else { layer.setRadius(center.distanceTo(ll)) }
    }
    function onUp(e) {
      if (!drawing) return
      drawing = false
      try { container.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      if (tool === 'lasso') {
        if (points.length < 3) { clearLayer(); return }
        const poly = points.map(p => [p.lat, p.lng])
        clearLayer()
        layer = L.polygon(poly, { color: COLOR_SELECTED, weight: 2, fillColor: COLOR_SELECTED, fillOpacity: 0.12 }).addTo(map)
        onSelect(leads.filter(l => l.lat && l.lng && pointInPolygon([l.lat, l.lng], poly)))
      } else {
        const r = layer ? layer.getRadius() : 0
        if (r < 1) { clearLayer(); return }
        onSelect(leads.filter(l => l.lat && l.lng && center.distanceTo(L.latLng(l.lat, l.lng)) <= r))
      }
    }

    container.addEventListener('pointerdown', onDown)
    container.addEventListener('pointermove', onMove)
    container.addEventListener('pointerup', onUp)
    container.addEventListener('pointercancel', onUp)
    return () => {
      container.removeEventListener('pointerdown', onDown)
      container.removeEventListener('pointermove', onMove)
      container.removeEventListener('pointerup', onUp)
      container.removeEventListener('pointercancel', onUp)
      clearLayer()
      map.dragging.enable()
      container.style.cursor = ''
      container.style.touchAction = ''
    }
  }, [tool, leads, map, onSelect])
  return null
}
