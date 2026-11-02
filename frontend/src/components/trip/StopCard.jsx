import { useState } from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp, Clock, Ellipsis, ExternalLink, Footprints, Landmark, Mountain, ShoppingBag, Ticket, TramFront, Trash2, TriangleAlert, UtensilsCrossed, Wine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CATEGORY_LABELS, CATEGORY_STYLES, fameLabel } from '../../lib/plan'
import { duration } from '../../lib/format'
import PlacePicker from './PlacePicker'

const CATEGORY_ICONS = { see: Landmark, do: Mountain, eat: UtensilsCrossed, drink: Wine, buy: ShoppingBag }

function Travel({ travel }) {
  const Icon = travel.mode === 'walk' ? Footprints : TramFront
  return (
    <p className="flex items-center gap-1.5 py-2 text-xs text-subtle">
      <Icon className="size-3.5" />
      About {travel.min} min {travel.mode === 'walk' ? 'walk' : 'by transit or taxi'}, {travel.km} km
    </p>
  )
}

function MenuItem({ icon: Icon, children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {Icon && <Icon className="size-3.5 text-subtle" />}
      {children}
    </button>
  )
}

function StopMenu({ stop, day, days, first, last, onEdit, busy }) {
  const [open, setOpen] = useState(false)
  const act = (op) => {
    setOpen(false)
    onEdit({ place_id: stop.id, ...op })
  }
  const others = days.filter((d) => d.index !== day.index)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title="More options" aria-label={`More options for ${stop.name}`} disabled={busy} className="size-7 text-muted-foreground">
          <Ellipsis className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 gap-0 p-1">
        <MenuItem icon={ArrowUp} disabled={first} onClick={() => act({ action: 'shift', delta: -1 })}>Earlier in the day</MenuItem>
        <MenuItem icon={ArrowDown} disabled={last} onClick={() => act({ action: 'shift', delta: 1 })}>Later in the day</MenuItem>
        <p className="mt-1 border-t px-2 pt-1.5 pb-0.5 text-xs text-subtle">Move to</p>
        <div className="max-h-40 overflow-y-auto">
          {others.map((other) => (
            <MenuItem key={other.index} onClick={() => act({ action: 'move', day: other.index })}>
              <span className="truncate">Day {other.index}, {other.title}</span>
            </MenuItem>
          ))}
        </div>
        <div className="mt-1 border-t pt-1">
          <MenuItem icon={Trash2} onClick={() => act({ action: 'remove' })}>Remove from plan</MenuItem>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function StopCard({ stop, next, day, days, spare, first, last, onEdit, busy, hot, onHover }) {
  const fame = fameLabel(stop)
  const Icon = CATEGORY_ICONS[stop.category]
  const text = stop.note || stop.summary
  return (
    <li id={`stop-${stop.id}`} className="relative scroll-mt-[284px] pl-9 @3xl:scroll-mt-[104px]">
      <span className="day-solid absolute top-2.5 left-0 z-[1] flex size-6.5 items-center justify-center rounded-full text-[12.5px] font-semibold ring-3 ring-background">
        {stop.number}
      </span>
      <article
        onMouseEnter={() => onHover(stop.id)}
        onMouseLeave={() => onHover(null)}
        className={`rise overflow-hidden rounded-xl border bg-card transition-colors ${hot ? 'border-(--c)' : 'hover:border-(--c)'}`}
      >
        <div className="flex gap-3 p-3 pb-1">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px]">
              <span className="day-ink font-semibold">{stop.time}</span>
              <span className="text-subtle">{duration(stop.duration_min)}</span>
              <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11.5px] font-medium ${CATEGORY_STYLES[stop.category]}`}>
                <Icon className="size-3" />
                {CATEGORY_LABELS[stop.category]}
              </span>
              {fame && <span className={`rounded-md px-1.5 py-px text-[11.5px] font-medium ${fame === 'Famous' ? 'bg-ochre-soft text-ochre' : 'bg-sage-soft text-sage'}`}>{fame}</span>}
            </p>
            <a href={stop.maps_url} target="_blank" rel="noreferrer" title="Open in Google Maps" className="group mt-1 inline-flex max-w-full items-center gap-1 text-[15.5px] leading-snug font-semibold tracking-tight hover:underline">
              <span className="truncate">{stop.name}</span>
              <ExternalLink className="size-3 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            {stop.area && <p className="text-[12.5px] text-subtle">{stop.area}</p>}
          </div>
          {stop.image && (
            <img src={stop.image} alt="" loading="lazy" onError={(e) => e.currentTarget.remove()} className="size-[72px] shrink-0 rounded-lg bg-muted object-cover" />
          )}
        </div>
        <div className="px-3 pb-1">
          {text && <p className="line-clamp-3 text-[13.5px] leading-snug text-muted-foreground">{text}</p>}
          {stop.hours_warning && (
            <p className="mt-1.5 flex items-center gap-1.5 rounded-md bg-ochre-soft px-2 py-1 text-[12.5px] font-medium text-ochre">
              <TriangleAlert className="size-3.5 shrink-0" />
              {stop.hours_warning}. Move it, or swap it.
            </p>
          )}
          {(stop.hours || stop.price) && (
            <dl className="mt-1.5 space-y-0.5 text-[12px] text-subtle">
              {stop.hours && (
                <div className="flex items-start gap-1.5">
                  <dt className="sr-only">Hours</dt>
                  <Clock className="mt-0.5 size-3 shrink-0" />
                  <dd className="line-clamp-2">{stop.hours}</dd>
                </div>
              )}
              {stop.price && (
                <div className="flex items-start gap-1.5">
                  <dt className="sr-only">Price</dt>
                  <Ticket className="mt-0.5 size-3 shrink-0" />
                  <dd className="line-clamp-2">{stop.price}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
        <div className="flex items-center justify-between px-1.5 pb-1">
          <PlacePicker title={`Swap ${stop.name}`} spare={spare} near={stop} align="start" onPick={(place) => onEdit({ action: 'swap', place_id: stop.id, new_place_id: place.id })}>
            <Button variant="ghost" size="xs" disabled={busy} className="font-normal text-muted-foreground">
              <ArrowLeftRight className="size-3.5" />
              Swap
            </Button>
          </PlacePicker>
          <StopMenu stop={stop} day={day} days={days} first={first} last={last} onEdit={onEdit} busy={busy} />
        </div>
      </article>
      {next?.travel ? <Travel travel={next.travel} /> : !last && <div className="h-3" />}
    </li>
  )
}
