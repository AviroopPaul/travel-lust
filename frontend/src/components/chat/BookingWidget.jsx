import { CalendarDays, Check, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { clock, duration, money, shortDate, travellers } from '../../lib/format'
import { AirlineLogo } from './FlightRow'

function Leg({ title, flight, onChange, busy }) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
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

export default function BookingWidget({ card, busy, onPatch }) {
  const { brief, outbound, inbound, offers, currency } = card
  return (
    <div className="rise space-y-2" data-testid="booking-widget">
      <Card className="gap-0 overflow-hidden border-sage/30 p-0">
        <div className="flex items-center gap-2 bg-sage-soft px-3.5 py-2 text-[13px] font-medium text-sage">
          <Check className="size-4" />
          Your flights
        </div>
        <Leg title="Outbound" flight={outbound} busy={busy} onChange={() => onPatch({ go_back_to: 'outbound' }, 'Change my outbound flight')} />
        {inbound && (
          <>
            <Separator />
            <Leg title="Return" flight={inbound} busy={busy} onChange={() => onPatch({ go_back_to: 'return' }, 'Change my return flight')} />
          </>
        )}
        <Separator />
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
          <div>
            <p className="text-xs text-subtle">Fare found for {travellers(brief)}</p>
            <p className="text-[20px] leading-tight font-semibold tracking-tight">{money(offers[0]?.price ?? card.total, currency)}</p>
          </div>
          {!offers.length && (
            <Button asChild size="sm">
              <a href={card.google_link} target="_blank" rel="noreferrer">
                See sellers on Google Flights
                <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      </Card>

      {offers.length > 0 && (
        <Card className="gap-0 p-0">
          <p className="border-b px-3.5 py-2 text-[13px] font-medium">Sellers, cheapest first</p>
          <ul>
            {offers.map((offer, index) => (
              <li key={`${offer.seller}${index}`} className="flex items-center gap-3 border-b px-3.5 py-2 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {offer.seller}
                    {index === 0 && <Badge variant="secondary" className="rounded-md bg-primary-soft px-1.5 text-[11.5px] text-primary">Cheapest</Badge>}
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
      )}

      {!card.has_plan && (
        <Card className="gap-2 border-primary/25 p-3.5">
          <p className="font-medium">Want me to plan your days in {brief.destination_label || 'there'}?</p>
          <p className="text-[13px] text-muted-foreground">A few quick questions, then I build a day-by-day plan around these flights.</p>
          <Button size="sm" disabled={busy} className="mt-1 w-fit" onClick={() => onPatch({ plan_trip: true }, 'Plan my days')}>
            <CalendarDays />
            Plan my days
          </Button>
        </Card>
      )}

      <p className="px-1 text-[12px] text-subtle">Fares come live from Google Flights and can change until you pay. Travelust does not sell tickets or take payment.</p>
    </div>
  )
}
