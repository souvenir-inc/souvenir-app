'use client'

import { cn } from '@/lib/utils'
import { CardEmptyState, emptyAction, emptyDetail } from '../CardEmpty'
import type { BoardCard } from '../types'
import { cellStyle, SPAN } from './grid-geometry'

/**
 * A metric the warehouse no longer has: the card stays in its place and says so, with Remove card
 * for people who can edit (CR-22), instead of vanishing without a word.
 */
export function RemovedCard({ card, canEdit, onRemove }: { card: BoardCard; canEdit: boolean; onRemove: () => void }) {
  return (
    <li
      data-card-id={card.metricId}
      style={cellStyle(card)}
      className={cn('relative min-w-0 rounded-xl', SPAN[card.size], '@min-[60rem]:[grid-column:var(--gc)]! @min-[60rem]:[grid-row:var(--gr)]!')}
    >
      <article data-card-body="removed" aria-label="Removed metric" className="relative size-full overflow-clip rounded-xl bg-[var(--dashboard-card-bg)] shadow-[var(--dashboard-card-shadow)]">
        {/* Its name is gone with it; the id it was saved under says which card this was. */}
        <h3 className="absolute left-4 right-4 top-4 m-0 truncate text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-faint)]">{card.metricId.replace(/#\d+$/, '').replace(/_/g, ' ')}</h3>
        <CardEmptyState
          kind="removed"
          compact={card.size === 'sm'}
          detail={emptyDetail('removed', { apps: [] })}
          action={emptyAction('removed', { canEdit, onRemove })}
          className="absolute bottom-4 left-4 right-4"
        />
      </article>
    </li>
  )
}
