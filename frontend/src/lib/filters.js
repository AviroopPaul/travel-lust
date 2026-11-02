// Mirrors server/app/flights/rank.py. The server filters for its summaries and for typed
// requests. This copy makes every control in the filter bar instant.

export const EMPTY_FILTERS = {
  max_stops: null,
  max_price: null,
  max_duration_min: null,
  airlines_include: [],
  airlines_exclude: [],
  depart_after_hour: null,
  depart_before_hour: null,
  arrive_after_hour: null,
  arrive_before_hour: null,
  no_red_eye: false,
  no_overnight_layover: false,
  allow_self_transfer: false,
  max_layover_min: null,
  min_layover_min: null,
  avoid_layover_airports: [],
  sort: 'best',
}

function matchesAirline(flight, wanted) {
  const names = [...flight.airlines, ...flight.airline_codes].map((n) => n.toLowerCase())
  return wanted.some((w) => names.some((n) => n.includes(w.toLowerCase()) || w.toLowerCase().includes(n)))
}

export function passes(f, it) {
  if (f.max_stops != null && it.stops > f.max_stops) return false
  if (f.max_price != null && it.price > f.max_price) return false
  if (f.max_duration_min != null && it.duration_min > f.max_duration_min) return false
  if (f.airlines_include?.length && !matchesAirline(it, f.airlines_include)) return false
  if (f.airlines_exclude?.length && matchesAirline(it, f.airlines_exclude)) return false
  if (f.depart_after_hour != null && it.depart_hour < f.depart_after_hour) return false
  if (f.depart_before_hour != null && it.depart_hour >= f.depart_before_hour) return false
  if (f.arrive_after_hour != null && it.arrive_hour < f.arrive_after_hour) return false
  if (f.arrive_before_hour != null && it.arrive_hour >= f.arrive_before_hour) return false
  if (f.no_red_eye && it.red_eye) return false
  if (f.no_overnight_layover && it.overnight_layover) return false
  if (f.max_layover_min != null && it.layovers.some((l) => l.duration_min > f.max_layover_min)) return false
  if (f.min_layover_min != null && it.layovers.some((l) => l.duration_min < f.min_layover_min)) return false
  if (f.avoid_layover_airports?.length && it.layovers.some((l) => f.avoid_layover_airports.includes(l.airport))) return false
  return true
}

function score(it, cheapest, fastest) {
  return (
    (it.price - cheapest) / Math.max(cheapest, 1) +
    0.6 * ((it.duration_min - fastest) / Math.max(fastest, 1)) +
    0.08 * it.stops +
    (it.overnight_layover ? 0.12 : 0) +
    (it.red_eye ? 0.06 : 0)
  )
}

const SORTS = {
  cheapest: (a, b) => a.price - b.price || a.duration_min - b.duration_min,
  fastest: (a, b) => a.duration_min - b.duration_min || a.price - b.price,
  earliest: (a, b) => a.depart_at.localeCompare(b.depart_at),
  lowest_co2: (a, b) => (a.co2_kg ?? Infinity) - (b.co2_kg ?? Infinity),
}

function hours(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

// Labels are worked out against what is on screen, so "cheapest" stays true under any filter.
export function visibleFlights(itineraries, filters) {
  const kept = itineraries.filter((it) => passes(filters, it))
  if (!kept.length) return []
  const cheapest = Math.min(...kept.map((i) => i.price))
  const fastest = Math.min(...kept.map((i) => i.duration_min))
  const byBest = [...kept].sort((a, b) => score(a, cheapest, fastest) - score(b, cheapest, fastest))
  const cheapestId = [...kept].sort(SORTS.cheapest)[0].id
  const fastestId = [...kept].sort(SORTS.fastest)[0].id
  const baseline = kept.find((i) => i.id === cheapestId)
  const labelled = byBest.map((it) => {
    const tags = []
    if (it.id === byBest[0].id) tags.push('best')
    if (it.id === cheapestId) tags.push('cheapest')
    if (it.id === fastestId) tags.push('fastest')
    const saved = baseline.duration_min - it.duration_min
    let note = null
    if (it.price > baseline.price && saved > 0) note = `${hours(saved)} faster than the cheapest`
    return { ...it, tags, note }
  })
  return filters.sort && SORTS[filters.sort] ? labelled.sort(SORTS[filters.sort]) : labelled
}

export function activeCount(f) {
  let count = 0
  if (f.max_stops != null) count++
  if (f.max_price != null) count++
  if (f.max_duration_min != null) count++
  if (f.airlines_include?.length || f.airlines_exclude?.length) count++
  if (f.depart_after_hour != null || f.depart_before_hour != null || f.arrive_after_hour != null || f.arrive_before_hour != null) count++
  if (f.no_red_eye) count++
  if (f.no_overnight_layover) count++
  if (f.max_layover_min != null || f.min_layover_min != null || f.avoid_layover_airports?.length) count++
  return count
}
