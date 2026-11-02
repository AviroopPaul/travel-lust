import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import { loadThread, RateLimited, sendTurn } from './lib/api'
import { detectCurrency } from './lib/format'
import { EMPTY_FILTERS } from './lib/filters'
import { navigate, takePrompt, THREAD_KEY } from './lib/route'
import { Button } from '@/components/ui/button'
import Logo from './components/Logo'
import Start from './components/Start'
import Composer from './components/Composer'
import TripBar from './components/TripBar'
import Chat from './components/chat/Chat'
import QuestionCard from './components/chat/QuestionCard'
import FlightsWidget from './components/chat/FlightsWidget'
import BookingWidget from './components/chat/BookingWidget'
import PlanTweaks from './components/chat/PlanTweaks'
import TripPanel from './components/trip/TripPanel'

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

function isWide() {
  return window.matchMedia('(min-width: 1024px)').matches
}

export default function App() {
  const [threadId, setThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [card, setCard] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [running, setRunning] = useState(false)
  const [quietTurn, setQuietTurn] = useState(false)
  const [trail, setTrail] = useState([])
  const [error, setError] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [restoring, setRestoring] = useState(() => Boolean(readThread()))
  const composerRef = useRef(null)
  const threadRef = useRef(null)

  const showCard = useCallback((next) => {
    setCard(next)
    if (next?.filters) setFilters({ ...EMPTY_FILTERS, ...next.filters })
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
        if (thread.card?.kind === 'itinerary' || thread.card?.plan) setPanelOpen(isWide())
      })
      .catch(() => writeThread(null))
      .finally(() => setRestoring(false))
  }, [showCard])

  const turn = useCallback(
    async (body, userText) => {
      setRunning(true)
      setQuietTurn(body.type === 'edit')
      setError(null)
      setTrail([])
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
              setTrail((now) => (now.includes(data.label) ? now : [...now, data.label]))
            } else if (event === 'card' && data.kind) {
              if (!data.quiet) setMessages((m) => [...m, { role: 'assistant', text: assistantText(data) }])
              showCard(data)
              // The panel opens once there is a finished plan, and not before.
              if (data.kind === 'itinerary' && !data.quiet) setPanelOpen(true)
            } else if (event === 'error') {
              setError(data.message)
            }
          },
        )
      } catch (err) {
        setError(err instanceof RateLimited ? err.message : 'I could not reach the server. Check your connection and try again.')
      } finally {
        setRunning(false)
        setQuietTurn(false)
        setTrail([])
      }
    },
    [filters, showCard],
  )

  const sendText = (text) => turn({ type: 'text', text }, text)

  // An example on the home page arrives here as a waiting prompt.
  useEffect(() => {
    const prompt = takePrompt()
    if (prompt) turn({ type: 'text', text: prompt }, prompt)
    // Runs once on arrival. The prompt is gone after the first read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const tapOption = (option) => turn({ type: 'patch', patch: option.patch, label: option.label }, option.label)
  const patch = (value, label) => turn({ type: 'patch', patch: value, label }, label)
  const selectFlight = (flight, label) => turn({ type: 'select', itinerary_id: flight.id, label }, label)
  const applyServerFilters = (next) => turn({ type: 'patch', patch: { search_with_filters: true }, filters: next })
  const editPlan = (op) => turn({ type: 'edit', op })

  // On a phone the panel covers the chat, so anything answered in the chat has to close it.
  const patchFromPanel = (value, label) => {
    if (!isWide()) setPanelOpen(false)
    patch(value, label)
  }

  const newTrip = () => {
    writeThread(null)
    threadRef.current = null
    setThreadId(null)
    setMessages([])
    setCard(null)
    setFilters(EMPTY_FILTERS)
    setError(null)
    setPanelOpen(false)
  }

  const prefill = (text) => {
    if (!isWide()) setPanelOpen(false)
    composerRef.current?.prefill(text)
  }

  if (restoring) return <div className="h-full bg-background" />
  if (!threadId && !running) return <Start onSend={sendText} error={error} />

  const plan = card?.kind === 'itinerary' ? card : card?.plan ?? null
  const chatBusy = running && !quietTurn
  const placeholder =
    card?.kind === 'question' ? 'Or type your own answer' : plan ? 'Try "swap the temple on day 2 for a hike"' : 'Try "no red-eyes"'

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-13 shrink-0 items-center gap-2.5 border-b bg-card px-4">
        <button onClick={() => navigate('/')} className="shrink-0" title="Travelust home">
          <Logo className="[&>svg]:size-6" />
        </button>
        <TripBar brief={card?.brief} onEdit={prefill} />
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {plan && !panelOpen && (
            <Button size="sm" className="h-7.5" onClick={() => setPanelOpen(true)}>
              <PanelRightOpen />
              Open plan
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={newTrip} className="h-7.5 font-normal text-muted-foreground">
            New trip
          </Button>
        </span>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <section
          className={`flex min-h-0 w-full flex-col transition-[width] duration-300 ease-out ${panelOpen && plan ? 'lg:w-[36%] lg:min-w-[390px] lg:shrink-0 lg:border-r' : ''}`}
        >
          <Chat
            messages={messages}
            card={card}
            plan={plan}
            panelOpen={panelOpen && Boolean(plan)}
            onTogglePanel={() => setPanelOpen(!panelOpen)}
            chatBusy={chatBusy}
            trail={trail}
            error={error}
          >
            {card?.kind === 'question' && <QuestionCard key={card.field} card={card} onPick={tapOption} />}
            {card?.kind === 'flights' && (
              <FlightsWidget
                key={`${card.leg}-${card.brief.outbound_date}`}
                card={card}
                filters={filters}
                setFilters={setFilters}
                busy={running}
                onSelect={selectFlight}
                onPatch={patch}
                onServerFilters={applyServerFilters}
              />
            )}
            {card?.kind === 'booking' && <BookingWidget card={card} busy={running} onPatch={patch} />}
            {card?.kind === 'itinerary' && (
              <>
                {card.offer && <QuestionCard key="flights-offer" card={{ ...card.offer, field: 'flights-offer' }} onPick={tapOption} />}
                <PlanTweaks plan={card} onPatch={patch} />
              </>
            )}
          </Chat>
          <div className="shrink-0 p-3 pt-1">
            <div className="mx-auto w-full max-w-3xl">
              <Composer ref={composerRef} onSend={sendText} disabled={running} placeholder={placeholder} />
            </div>
          </div>
        </section>

        {plan && panelOpen && (
          <TripPanel plan={plan} threadId={threadId} busy={running} onEdit={editPlan} onPatch={patchFromPanel} onClose={() => setPanelOpen(false)} />
        )}
      </div>
    </div>
  )
}
