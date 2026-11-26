import { SPRING } from "@/styles/tokens/motion"

// ── KDS Spring Presets ─────────────────────────────────────────────────────────
// Framer Motion spring configs shared across all KDS components (values: SPRING in styles/tokens/motion.ts).
// fast     → snappy UI feedback: icon swaps, tooltips, popovers
// moderate → layout animations, chip expand, panel open
// slow     → page-level transitions, large area reveals

export const springs = {
  fast: {
    type:      'spring' as const,
    ...SPRING.snappy,
  },
  moderate: {
    type:      'spring' as const,
    ...SPRING.moderate,
  },
  slow: {
    type:      'spring' as const,
    ...SPRING.slow,
  },
} as const
