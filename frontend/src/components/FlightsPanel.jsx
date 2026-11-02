import { useEffect, useMemo } from 'react'
import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EMPTY_FILTERS, visibleFlights, activeCount } from '../lib/filters'
import { clock, duration, money, shortDate } from '../lib/format'
import FilterBar from './FilterBar'
import FlightRow from './FlightRow'
import PriceMeter from './PriceMeter'
import { Status } from './Transcript'

function DateStrip({ dates, current, currency, onPick, busy }) {
  const lowest = Math.min(...dates.map((d) => d.price))
  return (
    <ul className="mt-4 flex gap-1.5 overflow-x-auto pb-1" aria-label="Lowest fare by departure date">
      {dates.map((d) => (
        <li key={d.date} className="shrink-0">
          <button
            onClick={() => onPick(d.date)}
            disabled={busy || d.date === current}
            aria-current={d.date === current}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-left shadow-xs transition-colors',
              d.date === current ? 'border-primary bg-primary-soft' : 'bg-card hover:bg-muted',
            )}
          >
            <span className="block text-xs text-muted-foreground">{shortDate(d.date)}</span>
            <span className={cn('block text-[13.5px]', d.price === lowest ? 'font-semibold' : 'font-medium')}>
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
    <Card className="mt-4 flex-row items-center gap-3 px-3 py-2 text-[13.5px]">
      <Badge variant="secondary" className="rounded-md bg-sage-soft px-1.5 text-[11.5px] text-sage">
        <Check /> Outbound chosen
      </Badge>
      <span className="min-w-0 flex-1 truncate">
        {clock(flight.depart_at)} to {clock(flight.arrive_at)}, {flight.airlines.join(', ')}, {duration(flight.duration_min)}
      </span>
      <Button variant="link" size="xs" onClick={onChange} disabled={busy} className="font-normal">Change</Button>
    </Card>
  )
}

export default function FlightsPanel({ card, filters, setFilters, busy, status, onSelect, onPatch, onServerFilters }) {
  const { brief, leg } = card
  const flights = useMemo(() => visibleFlights(card.itineraries, filters), [card.itineraries, filters])
  const isReturn = leg === 'return'
  const priceLabel = brief.one_way ? 'one way' : 'round trip total'

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

  const route = isReturn
    ? `${brief.destination_label} to ${brief.origin_label}`
    : `${brief.origin_label} to ${brief.destination_label}`
  const date = isReturn ? brief.return_date : brief.outbound_date

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="px-4 pt-5 pb-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-subtle">
              Step {isReturn ? 2 : 1} of {brief.one_way ? 2 : 3}: {isReturn ? 'return flight' : 'outbound flight'}
            </p>
            <h2 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">{route}</h2>
            <p className="mt-0.5 text-muted-foreground">{shortDate(date)}</p>
          </div>
          {!isReturn && <PriceMeter insights={card.insights} currency={brief.currency} />}
        </div>

        {isReturn && card.selected_outbound && (
          <ChosenOutbound flight={card.selected_outbound} busy={busy} onChange={() => onPatch({ go_back_to: 'outbound' }, 'Change my outbound flight')} />
        )}

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
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="mt-3 font-normal text-muted-foreground"
            onClick={() => onPatch({ brief: { flex_days: 3 } }, 'Check nearby dates')}
          >
            Check 3 days either side
          </Button>
        )}
      </div>

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

      <div className="px-4 pt-3 sm:px-6">
        {busy && <div className="mb-3"><Status label={status} /></div>}

        {flights.length > 0 ? (
          <ul className={cn('space-y-2.5', busy && 'opacity-50')}>
            {flights.map((flight, index) => (
              <FlightRow key={flight.id} flight={flight} number={index + 1} priceLabel={priceLabel} onSelect={pick} disabled={busy} />
            ))}
          </ul>
        ) : card.itineraries.length > 0 ? (
          <Card className="gap-1 p-5">
            <p className="font-medium">No flights match these filters</p>
            <p className="text-[13.5px] text-muted-foreground">Google shows a limited list for each search. A new search with your filters can find others.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => onServerFilters(filters)}>Search with these filters</Button>
              {activeCount(filters) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort, allow_self_transfer: filters.allow_self_transfer })}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card className="gap-2 p-5">
            <p className="font-medium">{card.summary}</p>
            <Button variant="link" size="xs" asChild className="w-fit p-0 text-[13.5px] font-normal">
              <a href={card.google_link} target="_blank" rel="noreferrer">Check this search on Google Flights</a>
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
