import { useEffect, useMemo, useState } from 'react'
import { Check, Plane } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EMPTY_FILTERS, visibleFlights, activeCount } from '../../lib/filters'
import { clock, duration, money, shortDate } from '../../lib/format'
import FilterBar from './FilterBar'
import FlightRow from './FlightRow'
import PriceMeter from './PriceMeter'

const FIRST_SHOWN = 5

function DateStrip({ dates, current, currency, onPick, busy }) {
  const lowest = Math.min(...dates.map((d) => d.price))
  return (
    <ul className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Lowest fare by departure date">
      {dates.map((d) => (
        <li key={d.date} className="shrink-0">
          <button
            onClick={() => onPick(d.date)}
            disabled={busy || d.date === current}
            aria-current={d.date === current}
            className={cn(
              'rounded-lg border px-2.5 py-1 text-left transition-colors',
              d.date === current ? 'border-primary bg-primary-soft' : 'bg-card hover:bg-muted',
            )}
          >
            <span className="block text-xs text-muted-foreground">{shortDate(d.date)}</span>
            <span className={cn('block text-[13px]', d.price === lowest ? 'font-semibold' : 'font-medium')}>
              {money(d.price, currency)}
              {d.price === lowest && <span className="ml-1 text-[11px] font-normal text-sage">lowest</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ChosenOutbound({ flight, onChange, busy }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <Badge variant="secondary" className="shrink-0 rounded-md bg-sage-soft px-1.5 text-[11.5px] text-sage">
        <Check /> Outbound chosen
      </Badge>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {clock(flight.depart_at)} to {clock(flight.arrive_at)}, {duration(flight.duration_min)}
      </span>
      <Button variant="link" size="xs" onClick={onChange} disabled={busy} className="font-normal">Change</Button>
    </div>
  )
}

export default function FlightsWidget({ card, filters, setFilters, busy, onSelect, onPatch, onServerFilters }) {
  const { brief, leg } = card
  const flights = useMemo(() => visibleFlights(card.itineraries, filters), [card.itineraries, filters])
  const [showAll, setShowAll] = useState(false)
  const isReturn = leg === 'return'
  const priceLabel = brief.one_way ? 'one way' : 'round trip total'
  const shown = showAll ? flights : flights.slice(0, FIRST_SHOWN)

  const pick = (flight) => {
    const code = flight.segments[0]
    onSelect(flight, `${flight.airlines[0]} ${code.airline_code} ${code.flight_number}, ${money(flight.price, flight.currency)}`)
  }

  useEffect(() => {
    const onKey = (e) => {
      const inField = e.target.closest?.('textarea, input, [data-slot="popover-content"]')
      if (busy || inField || e.metaKey || e.ctrlKey || e.altKey) return
      const flight = flights[Number(e.key) - 1]
      if (flight) pick(flight)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, busy])

  const route = isReturn ? `${brief.destination_label} to ${brief.origin_label}` : `${brief.origin_label} to ${brief.destination_label}`
  const date = isReturn ? brief.return_date : brief.outbound_date
  const hasExtras = isReturn ? card.selected_outbound : card.insights?.lowest || card.date_prices.length > 1 || card.itineraries.length > 0

  return (
    <div className="rise space-y-2" data-testid="flights-widget">
      <Card className="gap-0 overflow-hidden border-slate/25 p-0">
        <div className="flex items-center gap-2.5 bg-slate-soft px-3.5 py-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate text-card">
            <Plane className="size-3.5 rotate-45" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate">
              Flight {isReturn ? 2 : 1} of {brief.one_way ? 1 : 2}: {isReturn ? 'return' : 'outbound'}
            </p>
            <p className="truncate font-semibold">{route}, {shortDate(date)}</p>
          </div>
        </div>
        {hasExtras && (
          <div className="space-y-2.5 px-3.5 py-2.5">
            {isReturn && card.selected_outbound && (
              <ChosenOutbound flight={card.selected_outbound} busy={busy} onChange={() => onPatch({ go_back_to: 'outbound' }, 'Change my outbound flight')} />
            )}
            {!isReturn && <PriceMeter insights={card.insights} currency={brief.currency} />}
            {!isReturn && card.date_prices.length > 1 && (
              <DateStrip
                dates={card.date_prices}
                current={brief.outbound_date}
                currency={brief.currency}
                busy={busy}
                onPick={(day) => onPatch({ brief: { outbound_date: day } }, `Leave on ${shortDate(day)}`)}
              />
            )}
            {!isReturn && card.date_prices.length <= 1 && card.itineraries.length > 0 && (
              <Button variant="outline" size="xs" disabled={busy} className="font-normal text-muted-foreground" onClick={() => onPatch({ brief: { flex_days: 3 } }, 'Check nearby dates')}>
                Check 3 days either side
              </Button>
            )}
          </div>
        )}
      </Card>

      {card.itineraries.length > 0 && (
        <FilterBar
          flights={card.itineraries}
          filters={filters}
          setFilters={setFilters}
          shownCount={flights.length}
          currency={brief.currency}
          busy={busy}
          onServerFilters={onServerFilters}
        />
      )}

      {flights.length > 0 ? (
        <>
          <ul className="space-y-2">
            {shown.map((flight, index) => (
              <FlightRow key={flight.id} flight={flight} number={index + 1} priceLabel={priceLabel} onSelect={pick} disabled={busy} />
            ))}
          </ul>
          {flights.length > FIRST_SHOWN && (
            <Button variant="outline" size="sm" className="w-full font-normal text-muted-foreground" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${flights.length} flights`}
            </Button>
          )}
        </>
      ) : card.itineraries.length > 0 ? (
        <Card className="gap-1 p-4">
          <p className="font-medium">No flights match these filters</p>
          <p className="text-[13.5px] text-muted-foreground">Google shows a limited list for each search. A new search with your filters can find others.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => onServerFilters(filters)}>Search with these filters</Button>
            {activeCount(filters) > 0 && (
              <Button variant="outline" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort, allow_self_transfer: filters.allow_self_transfer })}>
                Clear filters
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card className="gap-2 p-4">
          <p className="font-medium">{card.summary}</p>
          <Button variant="link" size="xs" asChild className="w-fit p-0 text-[13.5px] font-normal">
            <a href={card.google_link} target="_blank" rel="noreferrer">Check this search on Google Flights</a>
          </Button>
        </Card>
      )}
    </div>
  )
}
