import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BadgeIndianRupee, CalendarDays, Clock3, Map, Plane, Search, SlidersHorizontal } from 'lucide-react'
import '@fontsource-variable/geist-mono'
import '@fontsource/kalam/400.css'
import { hasSavedTrip, navigate, startTrip } from '../../lib/route'
import Logo from '../Logo'
import Board, { WhoBoard } from './Board'
import { TRIPS } from './trips'
import { useSeen } from './useSeen'
import './home.css'

function preloadApp() {
  import('../../App')
}

function TryNow({ className = '', children = 'Try now', arrow = true }) {
  return (
    <a
      href="/plan"
      onPointerEnter={preloadApp}
      onClick={(e) => {
        e.preventDefault()
        navigate('/plan')
      }}
      className={`try ${className}`}
    >
      {children}
      {arrow && <ArrowRight strokeWidth={3} />}
    </a>
  )
}

function Shot({ name, alt, width, height, light = false, eager = false, className = '' }) {
  return (
    <picture className="contents">
      {!light && <source srcSet={`/landing/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />}
      <img
        src={light ? `/landing/${name}.webp` : `/landing/${name}-light.webp`}
        alt={alt}
        width={width}
        height={height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={className}
      />
    </picture>
  )
}

// A short note in pen, with an arrow that draws itself in.
function Note({ children, className = '', arrow = 'down', flip = false }) {
  const paths = {
    down: 'M6 6c22 3 44 14 50 42m-13-9 13 10 8-14',
    side: 'M4 26c18-16 38-18 58-6m-12-11 13 11-15 8',
  }
  return (
    <span className={`note ${className}`}>
      <span>{children}</span>
      <svg viewBox="0 0 72 56" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
        <path pathLength="1" d={paths[arrow]} />
      </svg>
    </span>
  )
}

function FlightArc() {
  const path = 'M238 318C560 402 930 372 1212 58'
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return (
    <svg className="arc" viewBox="0 0 1280 400" aria-hidden="true">
      <path d={path} className="arc-line" />
      <mask id="arc-reveal" maskUnits="userSpaceOnUse">
        <path d={path} pathLength="1" className="arc-mask" />
      </mask>
      <path d={path} className="arc-ink" mask="url(#arc-reveal)" />
      <circle cx="238" cy="318" r="6" className="arc-start" />
      <circle cx="1212" cy="58" r="15" className="arc-end" />
      <g>
        {still ? (
          <g transform="translate(1212 58) rotate(-48)">
            <PlaneMark />
          </g>
        ) : (
          <g>
            <animateMotion dur="3s" begin="0.35s" fill="freeze" rotate="auto" path={path} calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".5 0 .25 1" />
            <PlaneMark />
          </g>
        )}
      </g>
    </svg>
  )
}

function PlaneMark() {
  return (
    <g transform="rotate(90) translate(-16 -16)">
      <path
        className="arc-plane"
        d="M16 4.5c1.1 0 1.9 1.5 1.9 3.2v4.9l8.6 5v2.5l-8.6-2.5v5l2.5 1.9v1.9L16 25.3l-4.4 1.1v-1.9l2.5-1.9v-5l-8.6 2.5v-2.5l8.6-5V7.7c0-1.7.8-3.2 1.9-3.2z"
      />
    </g>
  )
}

function Hero() {
  const [active, setActive] = useState(TRIPS[0].key)
  const [held, setHeld] = useState(false)

  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = setInterval(() => setActive((now) => (now === TRIPS[0].key ? TRIPS[1].key : TRIPS[0].key)), 7000)
    return () => clearInterval(timer)
  }, [held])

  const trip = TRIPS.find((t) => t.key === active)

  return (
    <section className="relative">
      <div className="wrap pt-10 sm:pt-14">
        <div className="relative">
          <h1 className="display">
            Find the flight.
            <br />
            Plan the days.
            <br />
            <span className="text-primary">Go.</span>
          </h1>
          <FlightArc />
        </div>

        <div className="mt-8 grid items-end gap-x-14 gap-y-10 lg:mt-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div>
            <p className="max-w-[34rem] text-lg leading-snug text-muted-foreground sm:text-[21px]">
              Tell Travelust the trip in your own words. It finds live fares and plans your days, with maps. You make each choice, then print it and go.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <TryNow className="try-lg" />
              <span className="text-[15px] text-muted-foreground">No account needed.</span>
            </div>
          </div>
          <div className="relative">
            <Note arrow="side" className="note-board">Two real trips. Pick one.</Note>
            <Board
              trips={TRIPS}
              active={active}
              onPick={(key) => {
                setHeld(true)
                setActive(key)
              }}
              onTry={() => navigate('/plan')}
            />
          </div>
        </div>
      </div>

      <div className="wrap relative z-10 mt-12 -mb-[min(23vw,300px)] lg:mt-14">
        <figure className="frame">
          <figcaption className="frame-bar">
            <span className="frame-url">Travelust</span>
            <span className="truncate">Real screenshot: {trip.title}</span>
          </figcaption>
          <div className="relative aspect-[1440/900] overflow-hidden bg-card">
            {TRIPS.map((t) => (
              <Shot
                key={t.key}
                name={`${t.key}-plan`}
                alt={`The Travelust plan for ${t.title}, with the chat on the left and the plan and map on the right.`}
                width={2400}
                height={1500}
                eager
                className={`absolute inset-0 size-full object-cover transition-opacity duration-700 ${t.key === active ? 'opacity-100' : 'opacity-0'}`}
              />
            ))}
          </div>
        </figure>
      </div>
    </section>
  )
}

function Fact({ icon, children }) {
  const Icon = icon
  return (
    <li className="flex gap-2.5 text-[15.5px] leading-snug text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0 text-subtle" />
      <span>{children}</span>
    </li>
  )
}

function HardParts() {
  return (
    <section id="hard-parts" className="band-clay pt-[calc(min(23vw,300px)+72px)] pb-24 sm:pb-32">
      <div className="wrap">
        <h2 className="big reveal">
          A trip has
          <br />
          two hard parts.
        </h2>
        <p className="reveal mt-5 max-w-xl text-xl leading-snug opacity-90">We do those two, and we do them properly.</p>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <article className="part reveal" style={{ '--c': 'var(--day-2)' }}>
            <div className="p-6 sm:p-8">
              <p className="part-mark">
                <Plane className="size-4 rotate-45" />
                Hard part one
              </p>
              <h3 className="part-title">Flights</h3>
              <ul className="mt-5 space-y-2.5">
                <Fact icon={Search}>Live fares from Google Flights.</Fact>
                <Fact icon={BadgeIndianRupee}>It tells you if today's price is low or high.</Fact>
                <Fact icon={SlidersHorizontal}>Filter by stops, times, airlines and more.</Fact>
              </ul>
            </div>
            <div className="part-shot">
              <Shot name="flights" alt="Flights from Bengaluru to Dubai with prices, filters and a price meter." width={1472} height={1240} />
            </div>
          </article>

          <article className="part reveal" style={{ '--c': 'var(--day-1)' }}>
            <div className="p-6 sm:p-8">
              <p className="part-mark">
                <CalendarDays className="size-4" />
                Hard part two
              </p>
              <h3 className="part-title">Your days</h3>
              <ul className="mt-5 space-y-2.5">
                <Fact icon={Search}>Places from Google, Wikivoyage and Wikipedia.</Fact>
                <Fact icon={Clock3}>Built around your flight times and your pace.</Fact>
                <Fact icon={Map}>Routes, meals, opening hours and a map for each day.</Fact>
              </ul>
            </div>
            <div className="part-shot part-shot-map">
              <Shot name="kyoto-day" alt="A day in Arashiyama, Kyoto, with timed stops and a map." width={1700} height={1563} />
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function Stop({ number, title, children, shot, note }) {
  return (
    <li className="stop reveal" style={{ '--c': `var(--day-${number})` }}>
      <span className="stop-pin">{number}</span>
      <div className="stop-text">
        <h3 className="text-[32px] leading-[1.06] font-semibold tracking-[-0.03em] sm:text-[42px]">{title}</h3>
        <p className="mt-3 max-w-md text-[17px] leading-snug text-muted-foreground">{children}</p>
        {note}
      </div>
      <div className="min-w-0">{shot}</div>
    </li>
  )
}

function HowItGoes() {
  const line = useRef(null)

  // The route fills in as the page scrolls past it.
  useEffect(() => {
    const node = line.current
    if (!node) return undefined
    let frame = 0
    const update = () => {
      frame = 0
      const box = node.getBoundingClientRect()
      const done = (window.innerHeight * 0.62 - box.top) / box.height
      node.style.setProperty('--p', `${Math.max(0, Math.min(1, done)) * 100}%`)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <section id="how" className="py-24 sm:py-32">
      <div className="wrap">
        <h2 className="big reveal">
          One chat.
          <br />
          One clear plan.
        </h2>

        <ol ref={line} className="route mt-16 sm:mt-20">
          <Stop
            number={1}
            title="Say it your way."
            shot={
              <div className="shot-card">
                <Shot name="question" alt="Travelust asks what you want more of, with food and nature selected." width={1720} height={800} />
              </div>
            }
          >
            Type the trip as you would tell a friend. It asks about your pace, the places you want and what you enjoy.
          </Stop>
          <Stop
            number={2}
            title="Pick your flights."
            note={<Note className="mt-5" arrow="side">A live fare from Google Flights</Note>}
            shot={
              <div className="shot-card">
                <Shot name="flight-row" alt="A Bengaluru to Dubai Emirates flight for ₹79,942, marked best overall and fastest." width={1472} height={224} />
              </div>
            }
          >
            Do it before the plan or after it. You book with the seller you choose. We never take payment.
          </Stop>
          <Stop
            number={3}
            title="Read it as one story."
            shot={
              <div className="shot-card">
                <Shot name="dubai-story" alt="The Dubai plan with fare, day tabs, flight details and a map." width={1700} height={1563} />
              </div>
            }
          >
            Flights, days and maps sit in one panel. Each day has its own colour, on the screen and on the map.
          </Stop>
          <Stop
            number={4}
            title="Change anything."
            note={<Note className="mt-5" arrow="side">Closest places come first</Note>}
            shot={
              <div className="shot-card">
                <Shot name="dubai-swap" alt="Swapping Jumeirah Beach, with nearby places listed by distance." width={1700} height={1563} />
              </div>
            }
          >
            Swap a stop, move it to another day, or just ask in the chat. The times and the map update.
          </Stop>
          <Stop
            number={5}
            title="Print it. Share it."
            shot={
              <div className="fan">
                <Shot light name="dubai-pdf-1" alt="Page 1 of the Dubai PDF, with flights and a map of the whole trip." width={1075} height={1521} />
                <Shot light name="kyoto-pdf-2" alt="Page 2 of the Kyoto PDF, with day maps and numbered stops." width={1075} height={1521} />
                <Shot light name="dubai-pdf-2" alt="Page 2 of the Dubai PDF, with day maps and numbered stops." width={1075} height={1521} />
              </div>
            }
          >
            Export a PDF with your flights, your maps and every stop. Send it to whoever is coming with you.
          </Stop>
        </ol>
      </div>
    </section>
  )
}

function TripCard({ trip, tint }) {
  return (
    <article className="trip reveal" style={{ '--t': `var(--${tint}-soft)`, '--i': `var(--${tint})` }} data-testid={`trip-${trip.key}`}>
      <div className="min-w-0 p-6 sm:p-10">
        <h3 className="trip-region">{trip.region}</h3>
        <p className="mt-3 text-[22px] leading-tight font-semibold tracking-tight">{trip.title}</p>
        <p className="mt-1 text-[15px] text-muted-foreground">{trip.route}</p>
        <p className="text-[15px] text-muted-foreground">{trip.taste}</p>

        <dl className="trip-stats">
          <div>
            <dt>Days</dt>
            <dd>{trip.days.length}</dd>
          </div>
          <div>
            <dt>Stops</dt>
            <dd>{trip.stops}</dd>
          </div>
          <div>
            <dt>Fare for 2</dt>
            <dd>{trip.fare}</dd>
          </div>
        </dl>

        <ol className="mt-5 space-y-px">
          {trip.days.map(([name, what], index) => (
            <li key={name} className="trip-day" style={{ '--c': `var(--day-${(index % 6) + 1})` }}>
              <span className="trip-num">{index + 1}</span>
              <span className="font-medium">{name}</span>
              <span className="truncate text-muted-foreground max-sm:hidden">{what}</span>
            </li>
          ))}
        </ol>

        <button onClick={() => startTrip(trip.prompt)} className="trip-go">
          Plan a trip like this
          <ArrowRight className="size-4" />
        </button>
      </div>
      <div className="trip-art">
        <div className="trip-pdf">
          <Shot light name={`${trip.key}-pdf-1`} alt={`Page 1 of the ${trip.title} PDF.`} width={1075} height={1521} />
        </div>
        <div className="trip-phone">
          <Shot name={`${trip.key}-phone`} alt={`The ${trip.title} plan on a phone.`} width={900} height={1948} />
        </div>
      </div>
    </article>
  )
}

function Trips() {
  return (
    <section id="trips" className="border-t bg-card py-24 sm:py-32">
      <div className="wrap">
        <h2 className="big reveal">
          Two real trips.
          <br />
          <span className="text-subtle">No mock-ups.</span>
        </h2>
        <p className="reveal mt-5 max-w-xl text-lg leading-snug text-muted-foreground">
          We made both in the app on 2 November 2026. The screens, the PDFs and the fares are what it gave us that day.
        </p>
        <div className="mt-12 space-y-5">
          <TripCard trip={TRIPS[0]} tint="ochre" />
          <TripCard trip={TRIPS[1]} tint="sage" />
        </div>
      </div>
    </section>
  )
}

function Hotels() {
  return (
    <section id="hotels" className="band-ink py-24 sm:py-32">
      <div className="wrap grid items-center gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <div>
          <h2 className="big reveal">
            Hotels?
            <br />
            <span className="band-accent">Your call.</span>
          </h2>
          <div className="reveal mt-7 max-w-xl space-y-4 text-xl leading-snug">
            <p>Where you sleep is personal. Your budget, your area and your taste decide it. So we do not suggest any hotels.</p>
            <p className="opacity-70">Many other services already do hotels. We put our work into the two hard parts: your days and your flights.</p>
          </div>
        </div>
        <div className="reveal">
          <WhoBoard
            rows={[
              ['FLIGHTS', 'WE FIND', false],
              ['DAYS', 'WE PLAN', false],
              ['HOTELS', 'YOUR CALL', true],
            ]}
          />
        </div>
      </div>
    </section>
  )
}

function Finale() {
  return (
    <section className="overflow-hidden py-24 sm:py-32">
      <div className="wrap">
        <p className="reveal text-2xl font-medium tracking-tight sm:text-3xl">Where do you want to go?</p>
        <TryNow className="try-giant reveal" />
        <p className="reveal mt-4 text-lg text-muted-foreground">Tell it the trip. No account needed.</p>
      </div>
    </section>
  )
}

const SECTIONS = [
  ['#hard-parts', 'Two hard parts'],
  ['#how', 'How it goes'],
  ['#trips', 'Real trips'],
  ['#hotels', 'Hotels'],
]

function Footer() {
  const [ref, seen] = useSeen(0.1)
  return (
    <footer className="foot">
      <div className="wrap flex flex-wrap items-center justify-between gap-x-10 gap-y-3 pt-12 pb-8 sm:pt-16">
        <p className="text-xl font-medium tracking-tight">Find the flight. Plan the days. Go.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1 text-sm sm:gap-x-5 sm:text-[15px]">
          {SECTIONS.map(([href, label]) => (
            <a key={href} href={href} className="foot-link">{label}</a>
          ))}
        </nav>
      </div>
      <p ref={ref} className={`foot-word ${seen ? 'is-seen' : ''}`} aria-label="Travelust">
        {[...'travelust'].map((letter, index) => (
          <span key={index} aria-hidden="true" style={{ transitionDelay: `${index * 35}ms` }}>{letter}</span>
        ))}
      </p>
    </footer>
  )
}

export default function Home() {
  const root = useRef(null)
  const [saved] = useState(hasSavedTrip)

  useEffect(() => {
    document.documentElement.classList.add('home')
    return () => document.documentElement.classList.remove('home')
  }, [])

  useEffect(() => {
    const nodes = root.current.querySelectorAll('.reveal')
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('in'))
      return undefined
    }
    const watcher = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in')
            watcher.unobserve(entry.target)
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    nodes.forEach((node) => watcher.observe(node))
    return () => watcher.disconnect()
  }, [])

  return (
    <div ref={root} className="home-page">
      <header className="home-nav">
        <div className="glass">
          <a href="/" aria-label="Travelust home" className="shrink-0">
            <Logo className="text-[16px]" />
          </a>
          <nav aria-label="Sections" className="glass-links">
            {SECTIONS.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-3">
            {saved && (
              <a
                href="/plan"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/plan')
                }}
                className="glass-continue"
              >
                Continue your trip
              </a>
            )}
            <TryNow className="try-sm" />
          </span>
        </div>
      </header>
      <main>
        <Hero />
        <HardParts />
        <HowItGoes />
        <Trips />
        <Hotels />
        <Finale />
      </main>
      <Footer />
    </div>
  )
}
