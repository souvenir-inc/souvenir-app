/**
 * Lucide's `rotate-cw-clock` (D40): a clockwise arrow around a clock, for "when it last synced, and sync again".
 * The installed lucide-react doesn't ship it, so it's drawn here from the same three paths (no package change).
 */
export function RotateCwClock({ size = 14, strokeWidth = 1.75, className }: { size?: number; strokeWidth?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 7v5l4 2" />
      <path d="M16 8h5V3" />
      <path d="M21 8l-2.26-2.26C16.93 4 14.52 3 12 3a9 9 0 1 0 9 9" />
    </svg>
  )
}
