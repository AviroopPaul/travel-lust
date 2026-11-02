import { Plane } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clock, duration, shortDate } from '../../lib/format'
import { AirlineLogo } from '../chat/FlightRow'

function stopsText(flight) {
  if (!flight.stops) return 'Nonstop'
  return `${flight.stops} stop${flight.stops > 1 ? 's' : ''} via ${flight.layovers.map((l) => l.airport).join(', ')}`
}

// A flight drawn as a step in the story, on the day it happens.
export default function FlightLeg({ title, flight, note, onChange, busy }) {
  const from = flight.segments[0].from_code
  const to = flight.segments[flight.segments.length - 1].to_code
  return (
    <div className="rounded-xl border border-slate/30 bg-slate-soft p-3.5" data-testid="flight-leg">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate uppercase">
          <Plane className="size-3.5 rotate-45" />
          {title}, {shortDate(flight.depart_at)}
        </p>
        <Button variant="link" size="xs" disabled={busy} onClick={onChange} className="h-auto p-0 font-normal text-slate">Change</Button>
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div>
          <p className="text-[22px] leading-none font-semibold tracking-tight">{from}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{clock(flight.depart_at)}</p>
        </div>
        <div className="text-center">
          <p className="text-[12px] text-subtle">{duration(flight.duration_min)}</p>
          <div className="my-1 flex items-center gap-1 text-slate">
            <span className="size-1.5 rounded-full bg-slate" />
            <span className="h-px flex-1 border-t border-dashed border-slate" />
            <Plane className="size-3.5 rotate-45" />
          </div>
          <p className="truncate text-[12px] text-subtle" title={stopsText(flight)}>{stopsText(flight)}</p>
        </div>
        <div className="text-right">
          <p className="text-[22px] leading-none font-semibold tracking-tight">{to}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {clock(flight.arrive_at)}
            {flight.arrive_day_offset > 0 && <sup className="ml-0.5 text-[10.5px] text-primary">+{flight.arrive_day_offset}</sup>}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2 border-t border-slate/20 pt-2.5">
        <span className="[&>*]:size-6 [&>*]:rounded-md">
          <AirlineLogo code={flight.airline_codes[0]} name={flight.airlines[0]} />
        </span>
        <p className="truncate text-[12.5px] text-muted-foreground">{flight.airlines.join(', ')}</p>
      </div>
      {note && <p className="mt-2 text-[12.5px] text-slate">{note}</p>}
    </div>
  )
}
