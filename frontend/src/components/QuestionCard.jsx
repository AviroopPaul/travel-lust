import { useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Kbd } from '@/components/ui/kbd'

export default function QuestionCard({ card, onPick }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('textarea, input') || e.metaKey || e.ctrlKey) return
      const option = card.options[Number(e.key) - 1]
      if (option) onPick(option)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, onPick])

  return (
    <Card className="rise gap-2 p-3">
      <p className="font-medium">{card.question}</p>
      <ul className="space-y-0.5">
        {card.options.map((option, index) => (
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
        ))}
      </ul>
    </Card>
  )
}
