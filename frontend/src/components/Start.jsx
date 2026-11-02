import { ArrowRight } from 'lucide-react'
import Composer from './Composer'
import Logo from './Logo'
import { navigate } from '../lib/route'

const EXAMPLES = [
  'Kolkata to Tokyo around 20 December for 10 days',
  'Cheapest way to get to Bali from Delhi in January',
  'Plan 5 relaxed days in Kyoto next March, away from the crowds',
]

export default function Start({ onSend, error }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 pb-16">
      <div className="rise w-full max-w-xl">
        <button onClick={() => navigate('/')} className="mb-10 block" title="Travelust home">
          <Logo />
        </button>
        <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Where do you want to go?</h1>
        <p className="mt-2 mb-6 text-muted-foreground">
          Tell me the trip in your own words. I ask for what is missing, find live fares, plan your days, and you make each choice.
        </p>
        <Composer onSend={onSend} autoFocus placeholder="I want to fly to..." />
        {error && <p className="mt-3 text-sm text-primary">{error}</p>}
        <ul className="mt-4 space-y-0.5">
          {EXAMPLES.map((text) => (
            <li key={text}>
              <button
                onClick={() => onSend(text)}
                className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ArrowRight className="size-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                {text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
