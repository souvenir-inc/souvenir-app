// Motion tokens for framer-motion, which needs numbers: it can't animate a CSS variable.
// Seconds. DURATION mirrors --duration-* in scales.css (same names, same values); LONG is for loops,
// ambient motion and long waits; STAGGER is the per-item offset in staggered lists and charts; SPRING
// presets are named by how they feel. Snapped onto this scale on 2026-11-26 from ~40 hand-picked
// durations, ~40 springs and ~10 stagger offsets, keeping each animation's feel: durations within ~11%,
// spring speed within ~12% and the same kind of bounce (docs/design-system-primitives-plan.md).

/** UI transitions, delays and staggers. */
export const DURATION = {
  tick: 0.03,
  instant: 0.08,
  snap: 0.1,
  fast: 0.12,
  quick: 0.15,
  base: 0.2,
  moderate: 0.25,
  slow: 0.32,
  gentle: 0.4,
  long: 0.5,
  longer: 0.7,
} as const

/** Loops, ambient motion and long waits. md (1.4s) matches the CSS skeleton shimmer. */
export const LONG = {
  xs: 1,
  sm: 1.2,
  md: 1.4,
  lg: 1.6,
  xl: 3.2,
  '2xl': 5,
  '3xl': 10,
} as const

/** Per-item offset for staggered lists and charts: delay = index × STAGGER.x. */
export const STAGGER = {
  xs: 0.025,
  sm: 0.045,
  md: 0.06,
  lg: 0.08,
  xl: 0.1,
  '2xl': 0.15,
} as const

/**
 * Springs by feel: speed ω = √(stiffness / mass), bounce from damping ratio ζ = damping / 2√(stiffness · mass).
 * Below ζ ≈ 0.75 the overshoot is visible (bouncy, wobbly, lively, pop, springy); above it, it settles.
 * snappy / moderate / slow are the KDS presets in src/lib/springs.ts (fast / moderate / slow).
 */
export const SPRING = {
  gentle: { stiffness: 140, damping: 18 },
  slow: { stiffness: 200, damping: 25 },
  bouncy: { stiffness: 240, damping: 16 },
  wobbly: { stiffness: 220, damping: 11, mass: 0.9 },
  glide: { stiffness: 260, damping: 32, mass: 0.9 },
  moderate: { stiffness: 300, damping: 28 },
  springy: { stiffness: 400, damping: 25 },
  brisk: { stiffness: 380, damping: 28 },
  lively: { stiffness: 500, damping: 22 },
  pop: { stiffness: 500, damping: 14 },
  snappy: { stiffness: 500, damping: 30 },
  settle: { stiffness: 400, damping: 32, mass: 0.8 },
  crisp: { stiffness: 520, damping: 32, mass: 0.7 },
  whip: { stiffness: 700, damping: 40, mass: 0.5 },
} as const

/** Blur radii in px (for animated filter: blur()). */
export const BLUR = {
  '2xs': 2,
  3: 3,
  xs: 4,
  6: 6,
  sm: 8,
  10: 10,
  lg: 16,
  18: 18,
} as const
