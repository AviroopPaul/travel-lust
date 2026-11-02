import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { dayColor } from '../../lib/plan'

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

// Leaflet has no option for inline styles, so the day's colour is set when the icon is created.
function coloured(options, color) {
  const icon = L.divIcon(options)
  const create = icon.createIcon
  icon.createIcon = function (old) {
    const el = create.call(this, old)
    el.style.setProperty('--c', color)
    return el
  }
  return icon
}

function pin(number, color) {
  return coloured({ className: 'map-pin', html: `<span>${number}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }, color)
}

function dot(color) {
  return coloured({ className: 'map-dot', html: '', iconSize: [11, 11], iconAnchor: [5, 5] }, color)
}

// One map for the whole trip. It shows every day at first, then follows the day being read.
export default function TripMap({ days, activeDay, hotStop, onPickStop, onPickDay }) {
  const box = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const markers = useRef(new Map())
  const placed = useRef(false)

  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: true, scrollWheelZoom: false })
    L.tileLayer(TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    // The panel slides open and the window can resize, and Leaflet does not notice either.
    const watcher = new ResizeObserver(() => map.current?.invalidateSize())
    watcher.observe(box.current)
    return () => {
      watcher.disconnect()
      map.current.remove()
      map.current = null
      placed.current = false
    }
  }, [])

  useEffect(() => {
    const instance = map.current
    layer.current.clearLayers()
    markers.current.clear()
    const style = getComputedStyle(document.documentElement)
    const focused = days.find((d) => d.index === activeDay)
    const bounds = []

    days.forEach((day) => {
      const located = day.stops.filter((s) => s.lat != null)
      const isFocus = !focused || day === focused
      const color = dayColor(day.index)
      const hex = style.getPropertyValue(`--day-${((day.index - 1) % 6) + 1}`).trim()
      const points = located.map((s) => [s.lat, s.lng])
      if (isFocus) {
        bounds.push(...points)
        if (points.length > 1) L.polyline(points, { color: hex, weight: focused ? 3 : 2, dashArray: '4 6', opacity: 0.9 }).addTo(layer.current)
      }
      located.forEach((stop) => {
        const icon = isFocus ? pin(stop.number, color) : dot(color)
        const marker = L.marker([stop.lat, stop.lng], { icon, title: stop.name, alt: stop.name, zIndexOffset: isFocus ? 500 : 0 })
          .bindTooltip(`Day ${day.index}: ${stop.name}`, { direction: 'top', offset: [0, -12] })
          .on('click', () => (isFocus ? onPickStop(stop.id, day.index) : onPickDay(day.index)))
          .addTo(layer.current)
        markers.current.set(stop.id, marker)
      })
    })

    if (!bounds.length) {
      instance.setView([20, 0], 2)
    } else if (!placed.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Leaflet can only animate from a view it already has.
      instance.fitBounds(bounds, { padding: [34, 34], maxZoom: 15, animate: false })
    } else {
      instance.flyToBounds(bounds, { padding: [34, 34], maxZoom: 15, duration: 0.55 })
    }
    placed.current = true
  }, [days, activeDay, onPickStop, onPickDay])

  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const el = marker.getElement()
      if (el) el.classList.toggle('is-hot', id === hotStop)
    })
  }, [hotStop])

  return <div ref={box} data-testid="trip-map" className="isolate size-full" />
}
