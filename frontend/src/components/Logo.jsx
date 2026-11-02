import { cn } from '@/lib/utils'

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path
        transform="rotate(45 16 16)"
        fill="var(--primary-foreground)"
        d="M16 4.5c1.1 0 1.9 1.5 1.9 3.2v4.9l8.6 5v2.5l-8.6-2.5v5l2.5 1.9v1.9L16 25.3l-4.4 1.1v-1.9l2.5-1.9v-5l-8.6 2.5v-2.5l8.6-5V7.7c0-1.7.8-3.2 1.9-3.2z"
      />
    </svg>
  )
}

export default function Logo({ className }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight whitespace-nowrap', className)}>
      <LogoMark />
      Travelust
    </span>
  )
}
