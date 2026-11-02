import { useEffect, useRef } from 'react'

export function Status({ label }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="pulse-dot size-1.5 rounded-full bg-primary" />
      {label || 'Thinking'}
    </p>
  )
}

export default function Transcript({ messages, card, running, status, error }) {
  const end = useRef(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, running, status])

  // The open question is shown on its card, so it should not also appear as a message.
  const rows = messages
    .map((message, index) => {
      const isLast = index === messages.length - 1
      if (isLast && message.role === 'assistant' && card?.kind === 'question' && !running) {
        return { ...message, text: message.text.replace(card.question, '').trim() }
      }
      return message
    })
    .filter((message) => message.text)

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
      {rows.map((message, index) => (
        <div key={index} className={`rise flex ${message.role === 'user' ? 'justify-end' : ''}`}>
          {message.role === 'user' ? (
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3 py-1.5">{message.text}</p>
          ) : (
            <p className="max-w-[95%]">{message.text}</p>
          )}
        </div>
      ))}
      {running && <Status label={status} />}
      {error && <p className="text-sm text-primary">{error}</p>}
      <div ref={end} />
    </div>
  )
}
