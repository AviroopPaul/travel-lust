import { useCallback, useEffect, useRef, useState } from 'react'
import { loadThread, sendTurn } from './lib/api'
import { detectCurrency } from './lib/format'
import { EMPTY_FILTERS } from './lib/filters'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Logo from './components/Logo'
import Landing from './components/Landing'
import Transcript from './components/Transcript'
import QuestionCard from './components/QuestionCard'
import Composer from './components/Composer'
import TripBar from './components/TripBar'
import FlightsPanel from './components/FlightsPanel'
import BookingPanel from './components/BookingPanel'

const THREAD_KEY = 'travel-lust-thread'

function readThread() {
  try {
    return localStorage.getItem(THREAD_KEY)
  } catch {
    return null
  }
}

function writeThread(id) {
  try {
    if (id) localStorage.setItem(THREAD_KEY, id)
    else localStorage.removeItem(THREAD_KEY)
  } catch {
    // Private windows can block storage. The trip just will not survive a reload.
  }
}

function assistantText(card) {
  if (card.kind === 'question') return [card.reply, card.question].filter(Boolean).join(' ')
  return [card.reply, card.summary].filter(Boolean).join(' ')
}

export default function App() {
  const [threadId, setThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [card, setCard] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [view, setView] = useState('chat')
  const [restoring, setRestoring] = useState(() => Boolean(readThread()))
  const composerRef = useRef(null)
  const threadRef = useRef(null)

  const showCard = useCallback((next) => {
    setCard(next)
    if (next?.filters) setFilters({ ...EMPTY_FILTERS, ...next.filters })
    if (next?.kind === 'flights' || next?.kind === 'booking') setView('board')
    else setView('chat')
  }, [])

  useEffect(() => {
    const saved = readThread()
    if (!saved) return
    loadThread(saved)
      .then((thread) => {
        if (!thread) {
          writeThread(null)
          return
        }
        threadRef.current = saved
        setThreadId(saved)
        setMessages(thread.transcript)
        showCard(thread.card)
      })
      .catch(() => writeThread(null))
      .finally(() => setRestoring(false))
  }, [showCard])

  const turn = useCallback(
    async (body, userText) => {
      setRunning(true)
      setError(null)
      setStatus(null)
      if (userText) setMessages((m) => [...m, { role: 'user', text: userText }])
      try {
        await sendTurn(
          { ...body, thread_id: threadRef.current, currency: detectCurrency(), filters: body.filters ?? (threadRef.current ? filters : undefined) },
          (event, data) => {
            if (event === 'thread') {
              threadRef.current = data.thread_id
              setThreadId(data.thread_id)
              writeThread(data.thread_id)
            } else if (event === 'status') {
              setStatus(data.label)
            } else if (event === 'card' && data.kind) {
              setMessages((m) => [...m, { role: 'assistant', text: assistantText(data) }])
              showCard(data)
            } else if (event === 'error') {
              setError(data.message)
            }
          },
        )
      } catch {
        setError('I could not reach the server. Check your connection and try again.')
      } finally {
        setRunning(false)
        setStatus(null)
      }
    },
    [filters, showCard],
  )

  const sendText = (text) => turn({ type: 'text', text }, text)
  const tapOption = (option) => turn({ type: 'patch', patch: option.patch, label: option.label }, option.label)
  const patch = (value, label) => turn({ type: 'patch', patch: value, label }, label)
  const selectFlight = (flight, label) => turn({ type: 'select', itinerary_id: flight.id, label }, label)
  const applyServerFilters = (next) => turn({ type: 'patch', patch: { search_with_filters: true }, filters: next })

  const newTrip = () => {
    writeThread(null)
    threadRef.current = null
    setThreadId(null)
    setMessages([])
    setCard(null)
    setFilters(EMPTY_FILTERS)
    setError(null)
    setView('chat')
  }

  const prefill = (text) => {
    setView('chat')
    composerRef.current?.prefill(text)
  }

  if (restoring) return <div className="h-full bg-background" />
  if (!threadId && !running) return <Landing onSend={sendText} error={error} />

  const hasBoard = card?.kind === 'flights' || card?.kind === 'booking'
  const placeholder = card?.kind === 'question' ? 'Or type your own answer' : 'Try "no red-eyes"'

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b bg-card px-4">
        <button onClick={newTrip} className="shrink-0" title="Start a new trip">
          <Logo className="[&>svg]:size-6" />
        </button>
        <TripBar brief={card?.brief} onEdit={prefill} />
        <Button variant="outline" size="sm" onClick={newTrip} className="ml-auto h-7.5 font-normal text-muted-foreground">
          New trip
        </Button>
      </header>

      {hasBoard && (
        <div className="shrink-0 border-b bg-card p-1.5 lg:hidden">
          <Tabs value={view} onValueChange={setView}>
            <TabsList className="h-8 w-full">
              <TabsTrigger value="board">{card.kind === 'booking' ? 'Booking' : 'Flights'}</TabsTrigger>
              <TabsTrigger value="chat">Chat</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <section
          className={`min-h-0 flex-col lg:flex lg:border-r ${hasBoard ? 'lg:w-[380px] lg:shrink-0' : 'mx-auto w-full max-w-2xl'} ${
            view === 'chat' || !hasBoard ? 'flex w-full' : 'hidden'
          }`}
        >
          <Transcript messages={messages} card={card} running={running} status={status} error={error} />
          <div className="shrink-0 space-y-2 p-3">
            {card?.kind === 'question' && !running && <QuestionCard card={card} onPick={tapOption} />}
            <Composer ref={composerRef} onSend={sendText} disabled={running} placeholder={placeholder} />
          </div>
        </section>

        {hasBoard && (
          <main className={`min-w-0 flex-1 flex-col lg:flex ${view === 'board' ? 'flex' : 'hidden'}`}>
            <div className="min-h-0 flex-1 overflow-y-auto">
            {card.kind === 'flights' ? (
              <FlightsPanel
                card={card}
                filters={filters}
                setFilters={setFilters}
                busy={running}
                status={status}
                onSelect={selectFlight}
                onPatch={patch}
                onServerFilters={applyServerFilters}
              />
            ) : (
              <BookingPanel card={card} busy={running} status={status} onPatch={patch} />
            )}
            </div>
            <div className="shrink-0 border-t p-2.5 lg:hidden">
              <Composer onSend={sendText} disabled={running} placeholder={placeholder} />
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
