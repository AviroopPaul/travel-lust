import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'

function Progress({ done, total }) {
  return (
    <span className="flex items-center gap-1" role="img" aria-label={`Question ${done + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={`h-1 w-5 rounded-full ${index <= done ? 'bg-primary' : 'bg-muted'}`} />
      ))}
    </span>
  )
}

function firstFlightNote(days) {
  return days?.[0]?.before
}

export default function QuestionCard({ card, onPick }) {
  const [picked, setPicked] = useState([])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('textarea, input') || e.metaKey || e.ctrlKey) return
      const option = card.options[Number(e.key) - 1]
      if (!option) return
      if (card.multi) setPicked((now) => (now.includes(option.value) ? now.filter((v) => v !== option.value) : [...now, option.value]))
      else onPick(option)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, onPick])

  const toggle = (value) => setPicked((now) => (now.includes(value) ? now.filter((v) => v !== value) : [...now, value]))
  const confirm = () => {
    const chosen = card.options.filter((o) => picked.includes(o.value))
    onPick({
      label: chosen.map((o) => o.label).join(', ') || 'No preference',
      patch: { prefs: { [card.field]: chosen.map((o) => o.value) } },
    })
  }
  const days = card.setup_days

  return (
    <Card className="rise gap-2 overflow-hidden border-primary/25 p-0">
      {days && (
        <div className="flex items-center justify-between gap-3 bg-primary-soft px-3.5 py-2 text-[13px] text-primary">
          <span className="font-medium">Planning {days.length} {days.length === 1 ? 'day' : 'days'} in {card.city}</span>
          {card.progress && <Progress {...card.progress} />}
        </div>
      )}
      <div className={`space-y-2 px-3.5 pb-3 ${days ? '' : 'pt-3'}`}>
        <p className="font-medium">{card.question}</p>
        {firstFlightNote(days) && <p className="text-[12.5px] text-subtle">{firstFlightNote(days)}</p>}
        <ul className={card.multi ? 'grid grid-cols-2 gap-1.5' : 'space-y-0.5'}>
          {card.options.map((option, index) =>
            card.multi ? (
              <li key={option.label}>
                <button
                  onClick={() => toggle(option.value)}
                  aria-pressed={picked.includes(option.value)}
                  className={`flex h-full w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[13.5px] transition-colors ${
                    picked.includes(option.value) ? 'border-primary bg-primary-soft font-medium' : 'hover:bg-muted'
                  }`}
                >
                  <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm border ${picked.includes(option.value) ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                    {picked.includes(option.value) && <Check className="size-3" />}
                  </span>
                  {option.label}
                </button>
              </li>
            ) : (
              <li key={option.label}>
                <button
                  onClick={() => onPick(option)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <Kbd className="shrink-0">{index + 1}</Kbd>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{option.label}</span>
                    {option.description && <span className="block text-[12.5px] text-subtle">{option.description}</span>}
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
        {card.multi && (
          <div className="flex justify-end pt-1">
            <Button size="sm" onClick={confirm}>{picked.length ? 'Build my plan' : 'Skip and build my plan'}</Button>
          </div>
        )}
      </div>
    </Card>
  )
}
