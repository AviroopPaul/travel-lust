import { money } from '../../lib/format'

const WORDS = { low: 'Prices are low', typical: 'Prices are typical', high: 'Prices are high' }

// A bullet meter: the band is the usual range for this route, the mark is today's lowest fare.
export default function PriceMeter({ insights, currency }) {
  if (!insights?.lowest || !insights.typical_low || !insights.typical_high) return null
  const { lowest, typical_low: low, typical_high: high, level } = insights
  const start = Math.min(lowest, low) * 0.9
  const end = Math.max(lowest, high) * 1.1
  const at = (value) => `${((value - start) / (end - start)) * 100}%`
  const label = `Lowest fare today ${money(lowest, currency)}. Usual range ${money(low, currency)} to ${money(high, currency)}.`
  return (
    <div className="min-w-0" title={label}>
      <p className="text-[13px]">
        <span className="font-medium">{WORDS[level]}</span>
        <span className="text-subtle"> for these dates</span>
      </p>
      <div className="relative mt-2 h-1.5 rounded-full bg-muted" role="img" aria-label={label}>
        <div className="absolute inset-y-0 rounded-full bg-subtle/45" style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }} />
        <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary" style={{ left: at(lowest) }} />
      </div>
      <p className="mt-1.5 text-xs text-subtle">
        Usually {money(low, currency)} to {money(high, currency)}
      </p>
    </div>
  )
}
