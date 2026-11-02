import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { CABIN_LABELS, shortDate, travellers } from '../lib/format'

function Chip({ children, onClick, title }) {
  return (
    <Button variant="ghost" size="xs" onClick={onClick} title={title} className="text-[13px] font-normal text-muted-foreground">
      {children}
    </Button>
  )
}

export default function TripBar({ brief, onEdit }) {
  if (!brief || (!brief.destination?.length && !brief.origin?.length)) return null
  const route = `${brief.origin_label || 'Anywhere'} to ${brief.destination_label || 'anywhere'}`
  const dates = brief.outbound_date
    ? brief.return_date
      ? `${shortDate(brief.outbound_date)} to ${shortDate(brief.return_date)}`
      : `${shortDate(brief.outbound_date)}${brief.one_way ? ', one way' : ''}`
    : null
  return (
    <>
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-5" />
      <nav aria-label="Trip details" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        <Chip title="Change the route" onClick={() => onEdit('Change the route to ')}>{route}</Chip>
        {dates && <Chip title="Change the dates" onClick={() => onEdit('Change the dates to ')}>{dates}</Chip>}
        <Chip title="Change travellers" onClick={() => onEdit('Make it ')}>{travellers(brief)}</Chip>
        <Chip title="Change cabin" onClick={() => onEdit('Change the cabin to ')}>{CABIN_LABELS[brief.cabin]}</Chip>
      </nav>
    </>
  )
}
