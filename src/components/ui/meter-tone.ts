// The meter's tones, and the one `auto` picks for a fraction. Kept out of meter.tsx so that
// file exports components only (Fast Refresh can then keep their state).

export type MeterTone = 'neutral' | 'auto' | 'success' | 'warning' | 'danger'

/** The tone `auto` resolves to for a fraction 0–1. */
export function meterToneFor(fraction: number): Exclude<MeterTone, 'auto' | 'neutral'> {
  if (fraction >= 0.85) return 'danger'
  if (fraction >= 0.6) return 'warning'
  return 'success'
}
