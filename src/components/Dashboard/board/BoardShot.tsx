'use client'

import { useEffect, useEffectEvent, useRef } from 'react'
import { StillCards, type CardView } from '../MetricCard'
import { BoardSnapshot } from '../share/BoardSnapshot'
import { nodeToPng } from '../share/export'
import type { BoardCard } from '../types'

interface BoardShotProps {
  cards: BoardCard[]
  cardView: (metricId: string) => CardView | undefined
  stamp: string
  onDone: (blob: Blob | null) => void
}

/**
 * The board drawn off screen for its image (SH-33, SH-34). Its numbers are drawn still (StillCards:
 * no fade-in to wait for), so it becomes a PNG on the frame after it lays out, once the fonts are in.
 * Unmounting cancels the frame and drops a late result. Remount (a new `key`) to try again.
 */
export function BoardShot({ cards, cardView, stamp, onDone }: BoardShotProps) {
  const ref = useRef<HTMLDivElement>(null)
  const done = useEffectEvent(onDone)
  useEffect(() => {
    let live = true
    const frame = requestAnimationFrame(() => {
      const node = ref.current
      const job = node ? document.fonts.ready.then(() => nodeToPng(node)) : Promise.reject(new Error('no image'))
      job.then((blob) => { if (live) done(blob) }, () => { if (live) done(null) })
    })
    return () => { live = false; cancelAnimationFrame(frame) }
  }, [])
  return (
    <div aria-hidden style={{ position: 'fixed', left: 0, top: 0, transform: 'translateX(-200vw)', pointerEvents: 'none' }}>
      <StillCards value>
        <BoardSnapshot ref={ref} cards={cards} cardView={cardView} stamp={stamp} />
      </StillCards>
    </div>
  )
}
