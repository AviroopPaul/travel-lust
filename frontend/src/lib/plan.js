export const CATEGORY_LABELS = { see: 'Sight', do: 'Activity', eat: 'Food', drink: 'Drinks', buy: 'Shopping' }

export const CATEGORY_STYLES = {
  see: 'bg-slate-soft text-slate',
  do: 'bg-sage-soft text-sage',
  eat: 'bg-ochre-soft text-ochre',
  drink: 'bg-plum-soft text-plum',
  buy: 'bg-primary-soft text-primary',
}

// Each day keeps one colour across its header, timeline and map pins.
export function dayColor(index) {
  return `var(--day-${((index - 1) % 6) + 1})`
}

export const STYLE_OPTIONS = [
  ['leisure', 'Leisure', 'Slow mornings, fewer stops'],
  ['balanced', 'A good mix', 'Full days with some rest'],
  ['physical', 'Physical', 'Early starts, hikes, long walks'],
]

export const SPOT_OPTIONS = [
  ['top', 'Top spots only', 'The famous places'],
  ['mixed', 'Famous and hidden', 'Big sights plus a few surprises'],
  ['hidden', 'Little-known spots', 'What most tourists miss'],
]

export function fameLabel(place) {
  if (place.category !== 'see' && place.category !== 'do') return null
  if (place.tier === 'hidden') return 'Little known'
  if (place.tier === 'famous') return 'Famous'
  if (place.fame == null) return null
  if (place.fame >= 15) return 'Famous'
  return place.fame <= 4 ? 'Little known' : null
}

export function distanceKm(a, b) {
  if (a?.lat == null || b?.lat == null) return null
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

export function centreOf(stops) {
  const located = stops.filter((s) => s.lat != null)
  if (!located.length) return null
  return {
    lat: located.reduce((sum, s) => sum + s.lat, 0) / located.length,
    lng: located.reduce((sum, s) => sum + s.lng, 0) / located.length,
  }
}

export function pdfUrl(threadId, inline = false) {
  return `/api/threads/${threadId}/plan.pdf${inline ? '?inline=true' : ''}`
}
