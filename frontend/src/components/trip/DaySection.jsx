import { ExternalLink, Plane, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { centreOf, dayColor } from '../../lib/plan'
import FlightLeg from './FlightLeg'
import PlacePicker from './PlacePicker'
import StopCard from './StopCard'

function AddFlights({ onAdd, busy }) {
  return (
    <button
      onClick={onAdd}
      disabled={busy}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate/50 bg-slate-soft/50 p-3 text-left transition-colors hover:bg-slate-soft"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate text-card">
        <Plane className="size-4 rotate-45" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">Add your flights</span>
        <span className="block text-[12.5px] text-subtle">Find them in the chat, and they will appear here on the right days.</span>
      </span>
    </button>
  )
}

function dayNote(day) {
  if (day.stops.length) return `${day.stops.length} stop${day.stops.length === 1 ? '' : 's'}, until about ${day.ends_at}`
  return 'Travel day'
}

export default function DaySection({ day, days, spare, outbound, inbound, first, last, onEdit, onPatch, busy, hotStop, onHover }) {
  const near = centreOf(day.stops)
  return (
    <section id={`day-${day.index}`} data-day={day.index} style={{ '--c': dayColor(day.index) }} className="scroll-mt-[284px] @3xl:scroll-mt-[104px]">
      <header className="day-tint flex items-center gap-3 rounded-xl p-2.5">
        <span className="day-solid flex size-11 shrink-0 flex-col items-center justify-center rounded-lg leading-none">
          <span className="text-[9.5px] font-semibold tracking-wider uppercase opacity-80">Day</span>
          <span className="text-[18px] font-semibold">{day.index}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="day-ink text-[12.5px] font-medium">{day.label}</p>
          <h3 className="truncate text-[17px] leading-tight font-semibold tracking-tight">{day.title}</h3>
          <p className="truncate text-[12px] text-muted-foreground">{dayNote(day)}</p>
        </div>
        {day.route_url && (
          <Button variant="ghost" size="xs" asChild className="day-ink shrink-0 font-normal">
            <a href={day.route_url} target="_blank" rel="noreferrer" title="Open this day in Google Maps">
              Route
              <ExternalLink />
            </a>
          </Button>
        )}
      </header>

      <div className="mt-3 space-y-3">
        {first && (outbound ? (
          <FlightLeg title="Getting there" flight={outbound} note={day.before} busy={busy} onChange={() => onPatch({ go_back_to: 'outbound' }, 'Change my outbound flight')} />
        ) : (
          <>
            {day.before && <p className="rounded-lg bg-slate-soft px-3 py-2 text-[13px] text-slate">{day.before}</p>}
            {!day.before && <AddFlights busy={busy} onAdd={() => onPatch({ go_back_to: 'outbound' }, 'Find flights for this trip')} />}
          </>
        ))}

        {day.stops.length > 0 ? (
          <ol className="day-line relative ml-[12.5px] border-l-2 border-dashed pl-0 [&>li]:-ml-[13.5px]">
            {day.stops.map((stop, index) => (
              <StopCard
                key={stop.id}
                stop={stop}
                next={day.stops[index + 1]}
                day={day}
                days={days}
                spare={spare}
                first={index === 0}
                last={index === day.stops.length - 1}
                onEdit={onEdit}
                busy={busy}
                hot={hotStop === stop.id}
                onHover={onHover}
              />
            ))}
          </ol>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-3 text-[13.5px] text-muted-foreground">
            {first ? 'You land late, so this evening is for settling in.' : last ? 'Your flight leaves early, so no stops today.' : 'Nothing planned yet.'}
          </p>
        )}

        {day.over_by_min > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-ochre-soft px-3 py-2 text-[13px] text-ochre">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            This day ends around {day.ends_at}, past {day.must_end_at}. You may want to drop a stop.
          </p>
        )}

        <PlacePicker title={`Add to day ${day.index}`} spare={spare} near={near} align="start" onPick={(place) => onEdit({ action: 'add', day: day.index, new_place_id: place.id })}>
          <Button variant="ghost" size="xs" disabled={busy} className="ml-9 font-normal text-muted-foreground">
            <Plus />
            Add a stop
          </Button>
        </PlacePicker>

        {last && (inbound ? (
          <FlightLeg title="Flying home" flight={inbound} note={day.after} busy={busy} onChange={() => onPatch({ go_back_to: 'return' }, 'Change my return flight')} />
        ) : (
          day.after && <p className="rounded-lg bg-slate-soft px-3 py-2 text-[13px] text-slate">{day.after}</p>
        ))}
      </div>
    </section>
  )
}
