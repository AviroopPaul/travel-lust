import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { clock, duration, money, shortDate, travellers } from '../lib/format'
import { AirlineLogo } from './FlightRow'
import { Status } from './Transcript'

function Leg({ title, flight, onChange, busy }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <AirlineLogo code={flight.airline_codes[0]} name={flight.airlines[0]} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-subtle">{title}, {shortDate(flight.depart_at)}</p>
        <p className="font-medium">
          {clock(flight.depart_at)} to {clock(flight.arrive_at)}
          {flight.arrive_day_offset > 0 && <sup className="ml-0.5 text-[11px] font-normal text-primary">+{flight.arrive_day_offset}</sup>}
        </p>
        <p className="truncate text-[13px] text-muted-foreground">
          {flight.airlines.join(', ')}, {duration(flight.duration_min)}, {flight.stops ? `${flight.stops} stop${flight.stops > 1 ? 's' : ''}` : 'nonstop'}
        </p>
      </div>
      <Button variant="link" size="xs" onClick={onChange} disabled={busy} className="font-normal">Change</Button>
    </div>
  )
}

// Google's seller links are POST requests, so each one has to be a small form.
function OfferLink({ offer, primary }) {
  const fields = [...new URLSearchParams(offer.post_data || '')]
  const variant = primary ? 'default' : 'outline'
  if (!offer.url) {
    return offer.phone ? (
      <Button variant={variant} size="sm" asChild>
        <a href={`tel:${offer.phone}`}>Call {offer.phone}</a>
      </Button>
    ) : null
  }
  return (
    <form action={offer.url} method="post" target="_blank">
      {fields.map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Button type="submit" variant={variant} size="sm">Book</Button>
    </form>
  )
}

export default function BookingPanel({ card, busy, status, onPatch }) {
  const { brief, outbound, inbound, offers, currency } = card
  return (
    <div className="mx-auto max-w-2xl px-4 pt-5 pb-16 sm:px-6">
      <p className="text-[12.5px] font-medium text-subtle">Step {brief.one_way ? 2 : 3} of {brief.one_way ? 2 : 3}: book</p>
      <h2 className="mt-0.5 text-[22px] leading-tight font-semibold tracking-tight">Your flights</h2>

      {busy && <div className="mt-3"><Status label={status} /></div>}

      <Card className="rise mt-4 gap-0 py-0">
        <Leg title="Outbound" flight={outbound} busy={busy} onChange={() => onPatch({ go_back_to: 'outbound' }, 'Change my outbound flight')} />
        {inbound && (
          <>
            <Separator />
            <Leg title="Return" flight={inbound} busy={busy} onChange={() => onPatch({ go_back_to: 'return' }, 'Change my return flight')} />
          </>
        )}
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-xs text-subtle">Fare found for {travellers(brief)}</p>
            <p className="text-[22px] font-semibold tracking-tight">{money(offers[0]?.price ?? card.total, currency)}</p>
          </div>
          {!offers.length && (
            <Button asChild>
              <a href={card.google_link} target="_blank" rel="noreferrer">
                See sellers on Google Flights
                <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      </Card>

      {offers.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 font-medium">Sellers, cheapest first</h3>
          <Card className="gap-0 py-0">
            <ul>
              {offers.map((offer, index) => (
                <li key={`${offer.seller}${index}`} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {offer.seller}
                      {index === 0 && <Badge variant="secondary" className="rounded-md bg-primary-soft px-1.5 text-[11.5px] text-primary">Cheapest</Badge>}
                      {offer.is_airline && <span className="text-xs font-normal text-subtle">Airline</span>}
                    </p>
                    {offer.baggage.length > 0 && <p className="truncate text-[12.5px] text-subtle">{offer.baggage.join(', ')}</p>}
                    {offer.separate_tickets && <p className="text-[12.5px] text-ochre">Sold as separate tickets</p>}
                  </div>
                  <p className="font-semibold">{money(offer.price, currency)}</p>
                  <OfferLink offer={offer} primary={index === 0} />
                </li>
              ))}
            </ul>
          </Card>
          <Button variant="link" asChild className="mt-1 px-0 font-normal">
            <a href={card.google_link} target="_blank" rel="noreferrer">
              Compare on Google Flights
              <ExternalLink />
            </a>
          </Button>
        </section>
      )}

      <p className="mt-4 text-[12.5px] text-subtle">
        Fares come live from Google Flights and can change until you pay. Travel Lust does not sell tickets or take payment.
      </p>
      <Button variant="link" size="sm" onClick={() => onPatch({ start_over: true }, 'Start over')} disabled={busy} className="mt-2 px-0 font-normal text-muted-foreground">
        Plan a different trip
      </Button>
    </div>
  )
}
