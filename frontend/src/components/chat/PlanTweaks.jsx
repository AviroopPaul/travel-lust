import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SPOT_OPTIONS, STYLE_OPTIONS } from '../../lib/plan'

function Choice({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="font-normal">
          {label}
          <ChevronDown className="size-3 text-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-1">
        {options.map(([key, name, text]) => (
          <button
            key={key}
            onClick={() => {
              setOpen(false)
              if (key !== value) onChange(key, name)
            }}
            className={`block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted ${key === value ? 'bg-muted' : ''}`}
          >
            <span className="block text-[13.5px] font-medium">{name}</span>
            <span className="block text-xs text-subtle">{text}</span>
          </button>
        ))}
        <p className="border-t px-2 pt-1.5 pb-1 text-xs text-subtle">Changing this rebuilds your plan.</p>
      </PopoverContent>
    </Popover>
  )
}

function Interests({ labels, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(value)
  const onOpenChange = (next) => {
    if (next) setPicked(value)
    setOpen(next)
  }
  const shown = value.length ? value.map((key) => labels[key]?.split(' ')[0]).join(', ') : 'Any interests'
  const toggle = (key) => setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]))
  const changed = picked.length !== value.length || picked.some((key) => !value.includes(key))
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="xs" className="max-w-52 font-normal">
          <span className="truncate">{shown}</span>
          <ChevronDown className="size-3 text-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-2 p-3">
        {Object.entries(labels).map(([key, name]) => (
          <div key={key} className="flex items-center gap-2 py-0.5">
            <Checkbox id={`interest-${key}`} checked={picked.includes(key)} onCheckedChange={() => toggle(key)} />
            <Label htmlFor={`interest-${key}`} className="font-normal">{name}</Label>
          </div>
        ))}
        <Button
          size="sm"
          disabled={!changed}
          className="mt-2 w-full"
          onClick={() => {
            setOpen(false)
            onChange(picked)
          }}
        >
          Rebuild my plan
        </Button>
      </PopoverContent>
    </Popover>
  )
}

export default function PlanTweaks({ plan, onPatch }) {
  const { prefs, interest_labels: labels } = plan
  const set = (change, label) => onPatch({ plan_trip: true, prefs: change }, label)
  return (
    <Card className="rise gap-2 p-3.5">
      <p className="text-[13.5px] font-medium">Want it to feel different?</p>
      <div className="flex flex-wrap gap-1.5">
        <Choice
          label={STYLE_OPTIONS.find(([key]) => key === prefs.style)?.[1] ?? 'Pace'}
          options={STYLE_OPTIONS}
          value={prefs.style}
          onChange={(style, name) => set({ style }, `Change the pace to ${name.toLowerCase()}`)}
        />
        <Choice
          label={SPOT_OPTIONS.find(([key]) => key === prefs.spots)?.[1] ?? 'Places'}
          options={SPOT_OPTIONS}
          value={prefs.spots}
          onChange={(spots, name) => set({ spots }, `Show me ${name.toLowerCase()}`)}
        />
        <Interests
          labels={labels}
          value={prefs.interests ?? []}
          onChange={(interests) => set({ interests }, interests.length ? `Focus on ${interests.map((k) => labels[k].toLowerCase()).join(', ')}` : 'No particular interests')}
        />
      </div>
      <p className="text-[12.5px] text-subtle">Or tell me, like &quot;swap the temple on day 2 for a hike&quot;.</p>
    </Card>
  )
}
