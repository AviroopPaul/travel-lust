import { useId, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { activeCount, EMPTY_FILTERS } from '../../lib/filters'
import { duration, hourLabel, money } from '../../lib/format'

function FilterPopover({ label, active, children }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-7.5 rounded-full px-3 text-[13px] font-normal', active ? 'border-primary bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary dark:bg-primary-soft dark:hover:bg-primary-soft' : 'text-muted-foreground')}
        >
          {label}
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-24px)] p-3.5">
        {children}
      </PopoverContent>
    </Popover>
  )
}

function Check({ checked, onChange, children, aside }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2 py-1">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      <Label htmlFor={id} className="min-w-0 flex-1 truncate text-[13.5px] font-normal">{children}</Label>
      {aside && <span className="shrink-0 text-[12.5px] text-subtle">{aside}</span>}
    </div>
  )
}

function FilterSlider({ label, value, min, max, step = 1, format, onChange, anyLabel }) {
  return (
    <div className="py-1.5">
      <div className="mb-2 flex justify-between text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value == null ? anyLabel : format(value)}</span>
      </div>
      <Slider
        thumbLabel={label}
        min={min}
        max={max}
        step={step}
        value={[value ?? max]}
        onValueChange={([next]) => onChange(next >= max ? null : next)}
      />
    </div>
  )
}

const WINDOWS = [
  ['Early', 5, 9],
  ['Morning', 9, 12],
  ['Afternoon', 12, 18],
  ['Evening', 18, 22],
]

function TimeFilter({ title, afterKey, beforeKey, filters, set }) {
  const after = filters[afterKey]
  const before = filters[beforeKey]
  return (
    <div className="py-1">
      <p className="mb-1.5 text-[13px] font-medium">{title}</p>
      <div className="mb-1 flex flex-wrap gap-1">
        {WINDOWS.map(([name, start, end]) => {
          const on = after === start && before === end
          return (
            <Button
              key={name}
              variant="outline"
              size="xs"
              aria-pressed={on}
              onClick={() => set(on ? { [afterKey]: null, [beforeKey]: null } : { [afterKey]: start, [beforeKey]: end })}
              className={cn('text-[12.5px] font-normal', on ? 'border-primary bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary' : 'text-muted-foreground')}
            >
              {name}
            </Button>
          )
        })}
      </div>
      <FilterSlider label="After" value={after ?? null} min={0} max={23} format={hourLabel} anyLabel="Any time" onChange={(v) => set({ [afterKey]: v })} />
      <FilterSlider label="Before" value={before ?? null} min={1} max={24} format={hourLabel} anyLabel="Any time" onChange={(v) => set({ [beforeKey]: v })} />
    </div>
  )
}

const SORTS = [
  ['best', 'Best'],
  ['cheapest', 'Cheapest'],
  ['fastest', 'Fastest'],
  ['earliest', 'Earliest'],
  ['lowest_co2', 'Lowest CO2'],
]

const STOPS = [
  ['any', null, 'Any number of stops'],
  ['0', 0, 'Nonstop only'],
  ['1', 1, 'One stop or fewer'],
  ['2', 2, 'Two stops or fewer'],
]

export default function FilterBar({ flights, filters, setFilters, shownCount, currency, onServerFilters, busy }) {
  const set = (change) => setFilters({ ...filters, ...change })
  const stopsId = useId()

  const facts = useMemo(() => {
    const airlines = new Map()
    const layovers = new Map()
    for (const f of flights) {
      for (const name of f.airlines) airlines.set(name, Math.min(airlines.get(name) ?? Infinity, f.price))
      for (const l of f.layovers) layovers.set(l.airport, l.city || l.name)
    }
    const prices = flights.map((f) => f.price)
    const durations = flights.map((f) => f.duration_min)
    const stopPrice = (n) => {
      const within = flights.filter((f) => f.stops <= n).map((f) => f.price)
      return within.length ? Math.min(...within) : null
    }
    return {
      airlines: [...airlines].sort((a, b) => a[1] - b[1]),
      layovers: [...layovers].sort((a, b) => a[0].localeCompare(b[0])),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      stopPrice,
    }
  }, [flights])

  const priceStep = Math.max(1, Math.round((facts.maxPrice - facts.minPrice) / 50))
  const stopsLabel = filters.max_stops == null ? 'Stops' : filters.max_stops === 0 ? 'Nonstop' : `Up to ${filters.max_stops} stop${filters.max_stops > 1 ? 's' : ''}`
  const airlineFiltered = filters.airlines_include.length > 0 || filters.airlines_exclude.length > 0
  const timeFiltered = [filters.depart_after_hour, filters.depart_before_hour, filters.arrive_after_hour, filters.arrive_before_hour].some((v) => v != null) || filters.no_red_eye
  const layoverFiltered = filters.max_layover_min != null || filters.avoid_layover_airports.length > 0 || filters.no_overnight_layover

  const airlineOn = (name) => {
    if (filters.airlines_include.length) return filters.airlines_include.some((a) => a.toLowerCase() === name.toLowerCase())
    return !filters.airlines_exclude.some((a) => a.toLowerCase() === name.toLowerCase())
  }
  const toggleAirline = (name, on) => {
    const current = facts.airlines.map(([n]) => n).filter(airlineOn)
    const next = on ? [...current, name] : current.filter((n) => n !== name)
    const excluded = facts.airlines.map(([n]) => n).filter((n) => !next.includes(n))
    set({ airlines_include: [], airlines_exclude: excluded })
  }

  return (
    <div className="sticky top-0 z-10 -mx-1 bg-background px-1 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterPopover label={stopsLabel} active={filters.max_stops != null}>
          <RadioGroup
            className="gap-0"
            value={filters.max_stops == null ? 'any' : String(filters.max_stops)}
            onValueChange={(value) => set({ max_stops: STOPS.find(([id]) => id === value)[1] })}
          >
            {STOPS.map(([id, value, label]) => {
              const price = value == null ? facts.minPrice : facts.stopPrice(value)
              return (
                <div key={id} className={cn('flex items-center gap-2 py-1', price == null && 'opacity-45')}>
                  <RadioGroupItem id={`${stopsId}-${id}`} value={id} disabled={price == null} />
                  <Label htmlFor={`${stopsId}-${id}`} className="flex-1 text-[13.5px] font-normal">{label}</Label>
                  <span className="text-[12.5px] text-subtle">{price == null ? 'None' : `from ${money(price, currency)}`}</span>
                </div>
              )
            })}
          </RadioGroup>
        </FilterPopover>

        <FilterPopover label={filters.max_price == null ? 'Price' : `Under ${money(filters.max_price, currency)}`} active={filters.max_price != null}>
          <FilterSlider
            label="Maximum price"
            value={filters.max_price}
            min={facts.minPrice}
            max={facts.maxPrice}
            step={priceStep}
            format={(v) => money(v, currency)}
            anyLabel="Any price"
            onChange={(v) => set({ max_price: v })}
          />
        </FilterPopover>

        <FilterPopover label="Times" active={timeFiltered}>
          <TimeFilter title="Departure" afterKey="depart_after_hour" beforeKey="depart_before_hour" filters={filters} set={set} />
          <Separator className="my-2" />
          <TimeFilter title="Arrival" afterKey="arrive_after_hour" beforeKey="arrive_before_hour" filters={filters} set={set} />
          <Separator className="my-2" />
          <Check checked={filters.no_red_eye} onChange={(v) => set({ no_red_eye: v })}>No red-eye departures</Check>
        </FilterPopover>

        <FilterPopover label="Airlines" active={airlineFiltered}>
          <div className="mb-1 flex gap-1">
            <Button variant="link" size="xs" className="h-auto p-0 pr-2 font-normal" onClick={() => set({ airlines_include: [], airlines_exclude: [] })}>Select all</Button>
            <Button variant="link" size="xs" className="h-auto p-0 font-normal" onClick={() => set({ airlines_include: [], airlines_exclude: facts.airlines.map(([n]) => n) })}>Clear all</Button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {facts.airlines.map(([name, price]) => (
              <Check key={name} checked={airlineOn(name)} onChange={(on) => toggleAirline(name, on)} aside={money(price, currency)}>{name}</Check>
            ))}
          </div>
        </FilterPopover>

        <FilterPopover label={filters.max_duration_min == null ? 'Duration' : `Under ${duration(filters.max_duration_min)}`} active={filters.max_duration_min != null}>
          <FilterSlider
            label="Maximum duration"
            value={filters.max_duration_min}
            min={facts.minDuration}
            max={facts.maxDuration}
            step={15}
            format={duration}
            anyLabel="Any length"
            onChange={(v) => set({ max_duration_min: v })}
          />
        </FilterPopover>

        <FilterPopover label="Layovers" active={layoverFiltered}>
          <FilterSlider
            label="Longest layover"
            value={filters.max_layover_min}
            min={60}
            max={1440}
            step={30}
            format={duration}
            anyLabel="Any length"
            onChange={(v) => set({ max_layover_min: v })}
          />
          <Check checked={filters.no_overnight_layover} onChange={(v) => set({ no_overnight_layover: v })}>No overnight layovers</Check>
          {facts.layovers.length > 0 && (
            <>
              <Separator className="my-2" />
              <p className="mb-0.5 text-[13px] font-medium">Connect through</p>
              <div className="max-h-44 overflow-y-auto">
                {facts.layovers.map(([code, city]) => (
                  <Check
                    key={code}
                    checked={!filters.avoid_layover_airports.includes(code)}
                    onChange={(on) =>
                      set({
                        avoid_layover_airports: on
                          ? filters.avoid_layover_airports.filter((c) => c !== code)
                          : [...filters.avoid_layover_airports, code],
                      })
                    }
                    aside={code}
                  >
                    {city}
                  </Check>
                ))}
              </div>
            </>
          )}
        </FilterPopover>

        <FilterPopover label="Self-transfer" active={filters.allow_self_transfer}>
          <Check
            checked={filters.allow_self_transfer}
            onChange={(v) => {
              const next = { ...filters, allow_self_transfer: v }
              setFilters(next)
              onServerFilters(next)
            }}
          >
            Include self-transfer fares
          </Check>
          <p className="mt-1 text-[12.5px] text-subtle">
            These can be cheaper. You collect and recheck bags yourself, and no airline protects you if you miss a connection. Hidden by default.
          </p>
        </FilterPopover>

        {activeCount(filters) > 0 && (
          <Button
            variant="link"
            size="xs"
            disabled={busy}
            className="font-normal"
            onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort, allow_self_transfer: filters.allow_self_transfer })}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[12.5px] text-subtle">{shownCount} of {flights.length} flights</p>
        <Tabs value={filters.sort} onValueChange={(sort) => set({ sort })} className="max-w-full overflow-x-auto">
          <TabsList className="h-7 p-0.5">
            {SORTS.map(([id, label]) => (
              <TabsTrigger key={id} value={id} className="px-2 text-[12.5px]">{label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  )
}
