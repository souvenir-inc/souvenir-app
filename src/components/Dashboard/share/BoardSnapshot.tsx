'use client'

import { forwardRef } from 'react'
import { dims } from '../grid-layout'
import { MetricCard, type CardView } from '../MetricCard'
import { useDashboardData } from '../live/dashboard-data'
import type { BoardCard } from '../types'

// The board as a picture (09 SH-25, SH-34): every card as it looks, on the board's background, a strip
// with the stamp under them. No header, tabs, banners, speed dial or edit handles. Used for the image
// download (drawn off screen, then into a PNG) and, scaled down, for the Slack preview.

export const SNAPSHOT_WIDTH = 1200
/** A design column at that width: (1200 − 32 padding − 48 gaps) / 4. */
const COLUMN = 280

interface BoardSnapshotProps {
  cards: BoardCard[]
  /** How each card reads; cards locked here show the lock (a restricted metric, SH-26, SH-34). */
  cardView: (metricId: string) => CardView | undefined
  stamp: string
  /** Columns wide: 4 for a board; a card's own width for a card image (10 CS-9, S-9b). */
  columns?: number
  className?: string
  style?: React.CSSProperties
}

export const BoardSnapshot = forwardRef<HTMLDivElement, BoardSnapshotProps>(function BoardSnapshot({ cards, cardView, stamp, columns = 4, className, style }, ref) {
  const { metrics } = useDashboardData()
  const rows = cards.reduce((h, c) => Math.max(h, c.y + dims(c.size).h), 1)
  return (
    <div
      ref={ref}
      data-board-snapshot
      className={className}
      style={{ width: columns * COLUMN + (columns - 1) * 16 + 32, padding: 'var(--space-4)', background: 'var(--dashboard-panel-bg)', boxSizing: 'border-box', ...style }}
    >
      <ul className="m-0 grid list-none gap-4 p-0" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, 156px)` }}>
        {cards.map((c, i) => {
          const metric = metrics.get(c.metricId)
          if (!metric) return null
          const { w, h } = dims(c.size)
          return (
            <li key={c.metricId} className="min-w-0" style={{ gridColumn: `${c.x + 1} / span ${w}`, gridRow: `${c.y + 1} / span ${h}` }}>
              <MetricCard metric={metric} size={c.size} view={cardView(c.metricId)} index={i} className="h-full" />
            </li>
          )
        })}
      </ul>
      <p data-stamp className="m-0 mt-3 text-[length:var(--font-size-caption)] leading-4 text-[var(--dashboard-label)]">{stamp}</p>
    </div>
  )
})
