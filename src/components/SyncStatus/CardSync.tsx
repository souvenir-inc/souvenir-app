'use client'

import type { ReactNode } from 'react'
import { Tooltip } from '@/components/Tooltip'
import { useCardSync } from './SyncStatusProvider'
import styles from './SyncStatus.module.css'

/**
 * A card's sync dot, right after its metric label (D49, D50): red or amber when an app the card reads failed
 * or is behind, blended cards included. Hover: "Sync failed • Data from 9:42 am". Nothing when all is well.
 */
export function SyncDot({ categories }: { categories: readonly string[] }) {
  const card = useCardSync(categories)
  if (!card.dot || !card.hover) return null
  return (
    <Tooltip content={card.hover} side="bottom" align="start">
      {/* role="img" gives the focusable dot a name screen readers read (aria-label on a plain span is ignored). */}
      <span className={styles.cardDot} data-state={card.dot} tabIndex={0} role="img" aria-label={card.hover} />
    </Tooltip>
  )
}

/** A card's number, shimmering while an app it reads syncs. Only card numbers shimmer; everything else spins. */
export function SyncShimmer({ categories, children }: { categories: readonly string[]; children: ReactNode }) {
  const card = useCardSync(categories)
  return <span className={card.syncing ? styles.shimmer : undefined}>{children}</span>
}
