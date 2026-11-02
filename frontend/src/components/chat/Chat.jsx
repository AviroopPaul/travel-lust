import { useEffect, useRef } from 'react'
import { Check, MapPinned, PanelRightOpen } from 'lucide-react'
import { LogoMark } from '../Logo'

// What the agent has done so far this turn, so a long wait shows real progress.
export function Activity({ trail }) {
  const steps = trail.length ? trail : ['Thinking']
  return (
    <ul className="space-y-1 pl-8 text-sm" role="status">
      {steps.map((label, index) => {
        const current = index === steps.length - 1
        return (
          <li key={label} className={`flex items-center gap-2 ${current ? 'text-foreground' : 'text-subtle'}`}>
            {current ? <span className="pulse-dot mx-[3.5px] size-1.5 shrink-0 rounded-full bg-primary" /> : <Check className="size-3.5 shrink-0 text-sage" />}
            {label}
          </li>
        )
      })}
    </ul>
  )
}

// The finished plan, shown in the chat the way Claude shows an artifact.
function PlanChip({ plan, open, onToggle }) {
  const stops = plan.days.reduce((sum, day) => sum + day.stops.length, 0)
  return (
    <button
      onClick={onToggle}
      data-testid="plan-chip"
      className={`rise flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors hover:border-primary ${open ? 'border-primary bg-primary-soft' : 'bg-card'}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <MapPinned className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{plan.days.length} days in {plan.city}</span>
        <span className="block truncate text-[12.5px] text-subtle">
          {stops} stops{plan.booking ? ', flights included' : ''}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 pr-1 text-[13px] text-primary">
        {open ? 'Viewing' : (<><PanelRightOpen className="size-4" /> Open</>)}
      </span>
    </button>
  )
}

export default function Chat({ messages, card, plan, panelOpen, onTogglePanel, chatBusy, trail, error, children }) {
  const scroller = useRef(null)
  const lastAssistant = useRef(null)
  const end = useRef(null)

  // Tall cards such as the flight list should open from their top, not their bottom.
  const tall = card?.kind === 'flights' || card?.kind === 'booking'
  useEffect(() => {
    if (tall && !chatBusy) lastAssistant.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    else end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, chatBusy, trail.length, tall, card?.leg])

  // The panel squeezes the chat as it opens, which pushes the newest card out of view.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!tall) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 360)
    return () => clearTimeout(timer)
  }, [panelOpen, tall])

  const rows = messages
    .map((message, index) => {
      const isLast = index === messages.length - 1
      if (isLast && message.role === 'assistant' && card?.kind === 'question' && !chatBusy) {
        return { ...message, text: message.text.replace(card.question, '').trim() }
      }
      return message
    })
    .filter((message) => message.text)
  const lastAssistantIndex = rows.findLastIndex((message) => message.role === 'assistant')

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
      <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-4">
        {rows.map((message, index) => (
          <div key={index} ref={index === lastAssistantIndex ? lastAssistant : null} className={`rise flex scroll-mt-3 gap-2.5 ${message.role === 'user' ? 'justify-end' : ''}`}>
            {message.role === 'user' ? (
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-soft px-3 py-1.5">{message.text}</p>
            ) : (
              <>
                <LogoMark className="mt-0.5 size-5.5" />
                <p className="min-w-0 flex-1">{message.text}</p>
              </>
            )}
          </div>
        ))}
        {plan && <PlanChip plan={plan} open={panelOpen} onToggle={onTogglePanel} />}
        {chatBusy && <Activity trail={trail} />}
        {error && <p className="pl-8 text-sm text-primary">{error}</p>}
        {!chatBusy && children}
        <div ref={end} />
      </div>
    </div>
  )
}
