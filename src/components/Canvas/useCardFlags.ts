'use client'

import { useMetricFlags } from '@/components/Scorecard'
import type { CardFlagKit } from './BoardCardView'

/**
 * The Scorecard chat's flags for the "Needs attention" row: target health first (red or amber when off), the industry
 * benchmark otherwise (this workspace's own band if set), nothing without a value. A thin wrapper over their
 * `useMetricFlags`, so the row and their pages can't drift apart.
 */
export function useCardFlags(): CardFlagKit {
  const { flagFor } = useMetricFlags()
  return {
    flagFor: (metric, unit, value, window, dataUntil = null) => flagFor(metric, unit, value, window, { dataUntil }),
  }
}
