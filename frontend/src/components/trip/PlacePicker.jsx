import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CATEGORY_LABELS, distanceKm, fameLabel } from '../../lib/plan'

const FILTERS = [
  ['all', 'All'],
  ['sights', 'Sights'],
  ['food', 'Food'],
  ['shopping', 'Shopping'],
]

function matches(place, filter) {
  if (filter === 'sights') return place.category === 'see' || place.category === 'do'
  if (filter === 'food') return place.category === 'eat' || place.category === 'drink'
  if (filter === 'shopping') return place.category === 'buy'
  return true
}

export default function PlacePicker({ title, spare, near, onPick, children, side = 'bottom', align = 'end' }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')

  const places = useMemo(() => {
    if (!open) return []
    const rows = spare.filter((p) => matches(p, filter)).map((p) => ({ ...p, km: near ? distanceKm(near, p) : null }))
    if (near) rows.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9))
    return rows.slice(0, 40)
  }, [open, spare, near, filter])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[min(340px,calc(100vw-24px))] gap-0 p-0">
        <div className="border-b px-3 pt-2.5 pb-2">
          <p className="truncate text-[13.5px] font-medium">{title}</p>
          <div className="mt-1.5 flex gap-1">
            {FILTERS.map(([key, label]) => (
              <Button
                key={key}
                variant={filter === key ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setFilter(key)}
                className="font-normal"
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1" data-testid="place-options">
          {places.map((place) => {
            const fame = fameLabel(place)
            return (
              <li key={place.id}>
                <button
                  onClick={() => {
                    setOpen(false)
                    onPick(place)
                  }}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{place.name}</span>
                    <span className="block truncate text-xs text-subtle">
                      {[CATEGORY_LABELS[place.category], place.area, fame].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  {place.km != null && <span className="shrink-0 pt-0.5 text-xs text-subtle">{place.km < 10 ? place.km.toFixed(1) : Math.round(place.km)} km</span>}
                </button>
              </li>
            )
          })}
          {!places.length && <li className="px-2 py-3 text-[13px] text-subtle">Nothing here yet. Tell me in the chat what you would like, such as &quot;add a ramen place&quot;.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
