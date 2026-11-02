export function money(amount, currency = 'USD') {
  if (amount == null) return ''
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function duration(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// Flight times are local to each airport, so they must never pass through a time zone.
export function clock(iso) {
  const [h, m] = iso.slice(11, 16).split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function hourLabel(hour) {
  if (hour === 0 || hour === 24) return '12 am'
  if (hour === 12) return '12 pm'
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`
}

function parseDay(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shortDate(iso) {
  if (!iso) return ''
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function detectCurrency() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  if (zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta') return 'INR'
  if (zone === 'Europe/London') return 'GBP'
  if (zone.startsWith('Europe/')) return 'EUR'
  return 'USD'
}

export const CABIN_LABELS = {
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
  first: 'First',
}

export function travellers(brief) {
  const total = brief.adults + brief.children + brief.infants
  return `${total} traveller${total === 1 ? '' : 's'}`
}
