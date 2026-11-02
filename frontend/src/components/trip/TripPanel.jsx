import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarRange, Download, ExternalLink, MapPin, Plane, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { money, shortDate } from '../../lib/format'
import { dayColor, pdfUrl, SPOT_OPTIONS, STYLE_OPTIONS } from '../../lib/plan'
import DaySection from './DaySection'

const TripMap = lazy(() => import('./TripMap'))

// The map is a nice extra. If it fails, the plan itself must stay on screen.
class MapBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <p className="p-4 text-[13px] text-subtle">The map could not load. Your plan is safe.</p>
    return this.props.children
  }
}

function Stat({ icon, label, value }) {
  const Icon = icon
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase opacity-75">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="truncate text-[17px] leading-tight font-semibold">{value}</p>
    </div>
  )
}

function coverImages(days) {
  const stops = days.flatMap((day) => day.stops).filter((stop) => stop.image)
  stops.sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0))
  return stops.slice(0, 3).map((stop) => ({ id: stop.id, name: stop.name, src: stop.image.replace('width=200', 'width=640') }))
}

function Hero({ plan, onAddFlights, busy }) {
  const { days, city, prefs, booking, interest_labels: labels } = plan
  const stops = days.reduce((sum, day) => sum + day.stops.length, 0)
  const images = useMemo(() => coverImages(days), [days])
  const tags = [
    STYLE_OPTIONS.find(([key]) => key === prefs.style)?.[1],
    SPOT_OPTIONS.find(([key]) => key === prefs.spots)?.[1],
    ...(prefs.interests ?? []).map((key) => labels[key]),
  ].filter(Boolean)
  const price = booking ? money(booking.offers?.[0]?.price ?? booking.total, booking.currency) : null
  return (
    <div className="bg-primary text-primary-foreground @container/hero" data-testid="trip-hero">
      <div className="grid @2xl/hero:grid-cols-[minmax(0,1fr)_minmax(0,42%)]">
        <div className="min-w-0 p-5">
          <p className="text-[12.5px] font-medium opacity-80">{shortDate(days[0].date)} to {shortDate(days[days.length - 1].date)}</p>
          <h1 className="mt-0.5 text-[30px] leading-[1.1] font-semibold tracking-tight">{days.length} {days.length === 1 ? 'day' : 'days'} in {city}</h1>
          <ul className="mt-2.5 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <li key={tag} className="rounded-full border border-primary-foreground/30 px-2 py-0.5 text-[11.5px]">{tag}</li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-primary-foreground/25 pt-3">
            <Stat icon={CalendarRange} label="Days" value={days.length} />
            <Stat icon={MapPin} label="Stops" value={stops} />
            <Stat icon={Plane} label="Flights" value={price ?? 'Not added'} />
          </div>
          <div className="mt-3.5">
            {booking ? (
              <Button asChild size="sm" className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                <a href={booking.google_link} target="_blank" rel="noreferrer">
                  Book these flights
                  <ExternalLink />
                </a>
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={onAddFlights} className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                <Plane className="rotate-45" />
                Add flights
              </Button>
            )}
          </div>
        </div>
        {images.length > 0 && (
          // Absolute, so the photos fill the hero's height instead of setting it.
          <div className="relative hidden @2xl/hero:block">
            <div className={`absolute inset-0 grid gap-px ${images.length > 2 ? 'grid-cols-2 grid-rows-2' : images.length === 2 ? 'grid-cols-2' : ''}`}>
              {images.map((image, index) => (
                <img
                  key={image.id}
                  src={image.src}
                  alt={image.name}
                  onError={(e) => e.currentTarget.remove()}
                  className={`size-full min-h-0 object-cover ${index === 0 && images.length > 2 ? 'row-span-2' : ''}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DayNav({ days, active, onPick }) {
  return (
    <nav aria-label="Days" className="sticky top-11 z-20 border-b bg-background">
      <div className="flex gap-1.5 overflow-x-auto px-4 py-2">
        <button
          onClick={() => onPick(null)}
          aria-current={active == null ? 'true' : undefined}
          className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${active == null ? 'border-foreground bg-foreground text-background' : 'bg-card hover:border-subtle'}`}
        >
          Overview
        </button>
        {days.map((day) => {
          const on = active === day.index
          return (
            <button
              key={day.index}
              onClick={() => onPick(day.index)}
              aria-current={on ? 'true' : undefined}
              title={day.title}
              style={{ '--c': dayColor(day.index) }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[13px] font-medium transition-colors ${on ? 'day-solid border-transparent' : 'bg-card hover:border-(--c)'}`}
            >
              <span className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${on ? 'bg-card text-(--c)' : 'day-solid'}`}>{day.index}</span>
              {day.label.split(' ').slice(0, 2).join(' ')}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function Finish({ plan, threadId }) {
  const { booking, sources } = plan
  const web = sources.filter((source) => source !== 'Wikivoyage')
  return (
    <footer className="space-y-3 pb-10">
      <div className="rounded-xl border-2 border-primary/30 bg-primary-soft p-4">
        <p className="text-[16px] font-semibold tracking-tight">Happy with it?</p>
        <p className="mt-0.5 text-[13.5px] text-muted-foreground">
          {booking
            ? `Book your flights for ${money(booking.offers?.[0]?.price ?? booking.total, booking.currency)}, then take the whole trip with you as a PDF.`
            : 'Take the whole trip with you as a PDF, ready to print or share.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {booking && (
            <Button asChild size="sm">
              <a href={booking.google_link} target="_blank" rel="noreferrer">
                Book on Google Flights
                <ExternalLink />
              </a>
            </Button>
          )}
          <Button asChild size="sm" variant={booking ? 'outline' : 'default'}>
            <a href={pdfUrl(threadId)} download>
              <Download />
              Export PDF
            </a>
          </Button>
        </div>
      </div>
      <p className="text-xs text-subtle">
        Times and travel are estimates. Check opening hours before you go. Places from{' '}
        <a className="underline" href="https://en.wikivoyage.org" target="_blank" rel="noreferrer">Wikivoyage</a> (CC BY-SA)
        {web.length > 0 && <> and a Google Search that read {web.slice(0, 4).join(', ')}</>}. Photos from Wikimedia Commons.
      </p>
    </footer>
  )
}

export default function TripPanel({ plan, threadId, busy, onEdit, onPatch, onClose }) {
  const { days, spare, booking, city } = plan
  const scroller = useRef(null)
  const [active, setActive] = useState(null)
  const [hotStop, setHotStop] = useState(null)
  const manualScroll = useRef(0)

  useEffect(() => {
    const box = scroller.current
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (Date.now() < manualScroll.current) return
        const top = box.getBoundingClientRect().top + 170
        let current = null
        box.querySelectorAll('[data-day]').forEach((section) => {
          if (section.getBoundingClientRect().top <= top) current = Number(section.dataset.day)
        })
        setActive(current)
      })
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      box.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const goToDay = useCallback((index) => {
    // Smooth scrolling passes other days, so hold the highlight until it lands.
    manualScroll.current = Date.now() + 700
    setActive(index)
    if (index == null) scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    else document.getElementById(`day-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const goToStop = useCallback((id) => {
    setHotStop(id)
    document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [])

  const addFlights = () => onPatch({ go_back_to: 'outbound' }, 'Find flights for this trip')
  const located = days.some((day) => day.stops.some((stop) => stop.lat != null))

  return (
    <aside aria-label="Your trip plan" ref={scroller} className="panel-in @container fixed inset-0 z-40 overflow-y-auto bg-background lg:static lg:z-auto lg:min-w-0 lg:flex-1" data-testid="trip-panel">
      <div className="sticky top-0 z-30 flex h-11 items-center gap-1.5 border-b bg-card px-3">
        <Button variant="ghost" size="icon" title="Close the plan" aria-label="Close the plan" onClick={onClose} className="size-7">
          <X className="size-4" />
        </Button>
        <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{city} trip plan</p>
        {busy && <span className="pulse-dot size-1.5 rounded-full bg-primary" role="status" aria-label="Saving" />}
        <Button variant="outline" size="icon" asChild title="Open the PDF to print" aria-label="Open the PDF to print" className="size-7.5">
          <a href={pdfUrl(threadId, true)} target="_blank" rel="noreferrer">
            <Printer className="size-3.5" />
          </a>
        </Button>
        <Button size="sm" asChild className="h-7.5">
          <a href={pdfUrl(threadId)} download data-testid="export-pdf">
            <Download />
            Export PDF
          </a>
        </Button>
      </div>

      <Hero plan={plan} busy={busy} onAddFlights={addFlights} />
      <DayNav days={days} active={active} onPick={goToDay} />

      <div className="grid @3xl:grid-cols-[minmax(0,1fr)_minmax(280px,42%)]">
        {located && (
          <div className="sticky top-[92px] z-10 h-44 border-b bg-muted @3xl:order-last @3xl:h-[calc(100vh-52px-92px)] @3xl:border-b-0 @3xl:border-l">
            <MapBoundary>
              <Suspense fallback={null}>
                <TripMap days={days} activeDay={active} hotStop={hotStop} onPickStop={goToStop} onPickDay={goToDay} />
              </Suspense>
            </MapBoundary>
          </div>
        )}
        <div className="min-w-0 space-y-7 p-4">
          {days.map((day, index) => (
            <DaySection
              key={day.index}
              day={day}
              days={days}
              spare={spare}
              outbound={booking?.outbound}
              inbound={booking?.inbound}
              first={index === 0}
              last={index === days.length - 1}
              onEdit={onEdit}
              onPatch={onPatch}
              busy={busy}
              hotStop={hotStop}
              onHover={setHotStop}
            />
          ))}
          <Finish plan={plan} threadId={threadId} />
        </div>
      </div>
    </aside>
  )
}
