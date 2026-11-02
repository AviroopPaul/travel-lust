import { useState } from 'react'
import { ChevronDown, Plane } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'
import { cn } from '@/lib/utils'
import { clock, duration, money, shortDate } from '../lib/format'

const TAGS = {
  best: ['Best overall', 'bg-sage-soft text-sage'],
  cheapest: ['Cheapest', 'bg-primary-soft text-primary'],
  fastest: ['Fastest', 'bg-slate-soft text-slate'],
}

function Tag({ className, children }) {
  return <Badge variant="secondary" className={cn('rounded-md px-1.5 text-[11.5px]', className)}>{children}</Badge>
}

export function AirlineLogo({ code, name }) {
  const [failed, setFailed] = useState(false)
  if (failed || !code) {
    return <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-medium text-muted-foreground">{code || name?.[0]}</span>
  }
  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt=""
      width="36"
      height="36"
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-9 shrink-0 rounded-lg border bg-white object-contain p-1"
    />
  )
}

function RouteLine({ flight }) {
  const from = flight.segments[0].from_code
  const to = flight.segments[flight.segments.length - 1].to_code
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs text-subtle">
      <span>{from}</span>
      <span className="relative flex h-px min-w-10 flex-1 items-center justify-evenly bg-subtle/50">
        {flight.layovers.map((l) => (
          <span key={l.airport} title={`${l.airport}, ${duration(l.duration_min)}`} className="size-1.5 rounded-full border border-subtle bg-card" />
        ))}
      </span>
      <Plane className="size-3 rotate-45" aria-hidden="true" />
      <span>{to}</span>
    </div>
  )
}

function stopsText(flight) {
  if (!flight.stops) return 'Nonstop'
  const places = flight.layovers.map((l) => `${l.airport} ${duration(l.duration_min)}`).join(', ')
  return `${flight.stops} stop${flight.stops > 1 ? 's' : ''}: ${places}`
}

function Details({ flight }) {
  return (
    <div className="border-t bg-background/40 px-4 py-3 text-[13px]">
      <ol className="space-y-3">
        {flight.segments.map((seg, i) => (
          <li key={`${seg.airline_code}${seg.flight_number}${i}`}>
            <div className="flex flex-wrap justify-between gap-x-4">
              <p className="font-medium">
                {clock(seg.depart_at)} {seg.from_code} to {clock(seg.arrive_at)} {seg.to_code}
              </p>
              <p className="text-subtle">{shortDate(seg.depart_at)}, {duration(seg.duration_min)}</p>
            </div>
            <p className="text-muted-foreground">
              {seg.airline} {seg.airline_code} {seg.flight_number}
              {seg.aircraft ? `, ${seg.aircraft}` : ''}
              {seg.legroom ? `, ${seg.legroom} legroom` : ''}
            </p>
            {flight.layovers[i] && (
              <p className={cn('mt-2 rounded-md px-2 py-1 text-[12.5px]', flight.layovers[i].overnight ? 'bg-ochre-soft text-ochre' : 'bg-muted text-muted-foreground')}>
                {duration(flight.layovers[i].duration_min)} in {flight.layovers[i].city || flight.layovers[i].name} ({flight.layovers[i].airport})
                {flight.layovers[i].overnight ? ', overnight' : ''}
              </p>
            )}
          </li>
        ))}
      </ol>
      {flight.co2_kg != null && (
        <p className="mt-3 text-subtle">
          {flight.co2_kg} kg CO2
          {flight.typical_co2_kg ? `, typical for this route is ${flight.typical_co2_kg} kg` : ''}
        </p>
      )}
    </div>
  )
}

export default function FlightRow({ flight, number, priceLabel, onSelect, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <Card className="rise gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 pt-3.5 pb-2.5 sm:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1fr)_auto]">
          <AirlineLogo code={flight.airline_codes[0]} name={flight.airlines[0]} />

          <div className="min-w-0">
            <p className="text-base font-medium">
              {clock(flight.depart_at)} to {clock(flight.arrive_at)}
              {flight.arrive_day_offset > 0 && <sup className="ml-0.5 text-[11px] font-normal text-primary">+{flight.arrive_day_offset}</sup>}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">{flight.airlines.join(', ')}</p>
          </div>

          <div className="col-span-3 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
            <div className="flex items-baseline gap-2">
              <p className="text-[13px] font-medium">{duration(flight.duration_min)}</p>
              <div className="min-w-0 flex-1"><RouteLine flight={flight} /></div>
            </div>
            <p className="truncate text-[12.5px] text-subtle" title={stopsText(flight)}>{stopsText(flight)}</p>
          </div>

          <div className="col-start-3 row-start-1 text-right sm:col-start-4">
            <p className="text-[17px] font-semibold">{money(flight.price, flight.currency)}</p>
            <p className="text-[11.5px] text-subtle">{priceLabel}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
          {flight.tags.map((tag) => (
            <Tag key={tag} className={TAGS[tag][1]}>{TAGS[tag][0]}</Tag>
          ))}
          {flight.overnight_layover && <Tag className="bg-ochre-soft text-ochre">Overnight layover</Tag>}
          {flight.red_eye && <Tag className="font-normal text-muted-foreground">Red-eye</Tag>}
          {flight.note && <span className="text-xs text-subtle">{flight.note}</span>}
          <span className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open} className="font-normal text-muted-foreground">
              {open ? 'Hide details' : 'Details'}
              <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
            </Button>
            <Button size="sm" onClick={() => onSelect(flight)} disabled={disabled}>
              {number <= 9 && <Kbd className="hidden bg-primary-foreground/20 text-primary-foreground sm:inline-flex">{number}</Kbd>}
              Select
            </Button>
          </span>
        </div>

        {open && <Details flight={flight} />}
      </Card>
    </li>
  )
}
