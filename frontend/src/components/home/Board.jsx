import { useEffect, useRef, useState } from 'react'
import { useSeen } from './useSeen'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const STEP_MS = 62

function calm() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// One split-flap cell. It runs through a few letters and lands on its own.
function Flap({ char, delay }) {
  const [state, setState] = useState({ now: ' ', before: ' ', tick: 0 })
  const shown = useRef(' ')

  useEffect(() => {
    if (shown.current === char) return undefined
    shown.current = char
    if (calm()) {
      setState({ now: char, before: char, tick: 0 })
      return undefined
    }
    let alive = true
    let timer
    let left = 3 + Math.floor(Math.random() * 5)
    const step = () => {
      if (!alive) return
      const next = left > 0 ? CHARS[Math.floor(Math.random() * CHARS.length)] : char
      setState((s) => ({ now: next, before: s.now, tick: s.tick + 1 }))
      if (left-- > 0) timer = setTimeout(step, STEP_MS)
    }
    timer = setTimeout(step, delay)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [char, delay])

  return (
    <span className="flap" aria-hidden="true">
      <span className="flap-top">{state.now}</span>
      <span className="flap-bottom">{state.before}</span>
      {state.tick > 0 && (
        <>
          <span key={`f${state.tick}`} className="flap-fall">{state.before}</span>
          <span key={`u${state.tick}`} className="flap-up">{state.now}</span>
        </>
      )}
    </span>
  )
}

function FlapWord({ text, start = 0 }) {
  return (
    <span className="flap-word">
      {[...text].map((char, index) => (
        <Flap key={index} char={char} delay={start + index * 34} />
      ))}
    </span>
  )
}

function pad(text, size) {
  return text.padEnd(size, ' ')
}

export default function Board({ trips, active, onPick, onTry }) {
  const [ref, seen] = useSeen()
  const blank = { to: '', date: '', days: '', fare: '' }
  const row = (cells, order) => {
    const c = seen ? cells : blank
    const at = order * 180
    return (
      <>
        <span className="board-col"><FlapWord text={pad(c.to, 8)} start={at} /></span>
        <span className="board-col board-date"><FlapWord text={pad(c.date, 6)} start={at + 120} /></span>
        <span className="board-col"><FlapWord text={pad(c.days, 1)} start={at + 220} /></span>
        <span className="board-col"><FlapWord text={pad(c.fare, 9)} start={at + 260} /></span>
      </>
    )
  }

  return (
    <div ref={ref} className="board" data-testid="departures">
      <p className="board-head">
        <span>To</span>
        <span className="board-date">Departs</span>
        <span>Days</span>
        <span>Fare for 2</span>
      </p>
      {trips.map((trip, index) => (
        <button
          key={trip.key}
          onClick={() => onPick(trip.key)}
          aria-pressed={active === trip.key}
          className="board-row"
          data-on={active === trip.key || undefined}
        >
          <span className="sr-only">
            See the {trip.title} plan. Departs {trip.board.date}. Fare {trip.fare} for 2.
          </span>
          {row(trip.board, index)}
        </button>
      ))}
      <button onClick={onTry} className="board-row board-try">
        <span className="sr-only">Try now, with your own trip</span>
        {row({ to: 'ANYWHERE', date: 'SOON', days: '?', fare: ' TRY NOW ' }, trips.length)}
      </button>
    </div>
  )
}

// The same board, used to say who does what.
export function WhoBoard({ rows }) {
  const [ref, seen] = useSeen(0.4)
  return (
    <div ref={ref} className="board board-who" role="list">
      {rows.map(([what, who, mine], index) => (
        <p key={what} role="listitem" className="board-row" data-on={mine || undefined}>
          <span className="sr-only">{what}: {who}</span>
          <span className="board-col"><FlapWord text={pad(seen ? what : '', 7)} start={index * 200} /></span>
          <span className="board-col"><FlapWord text={pad(seen ? who : '', 9)} start={index * 200 + 180} /></span>
        </p>
      ))}
    </div>
  )
}
