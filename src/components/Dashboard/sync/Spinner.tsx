import { cn } from '@/lib/utils'

/** The small ring spinner of the sync screens (Figma "spinner": a light track, a dark arc). */
export function Spinner({ size = 12, className }: { size?: 12 | 14; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        'inline-block shrink-0 animate-spin rounded-full border-[1.5px] border-solid border-[var(--dashboard-spinner-track)] border-t-[var(--dashboard-spinner-ink)] motion-reduce:animate-none',
        className,
      )}
    />
  )
}
