'use client'

import { Tooltip } from '@/components/Tooltip'
import type { Segment } from '@/lib/warehouse/sync'
import styles from './SyncStatus.module.css'

/** Status copy with the app names one weight up, and "2 more apps" underlined with the rest on hover. */
export function Segments({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, i) => {
        if (segment.more) {
          return (
            <Tooltip key={i} content={segment.more.join(' & ')} side="bottom" align="start">
              <span className={styles.more} tabIndex={0}>{segment.text}</span>
            </Tooltip>
          )
        }
        const className = segment.app ? styles.app : segment.muted ? styles.muted : undefined
        return <span key={i} className={className}>{segment.text}</span>
      })}
    </>
  )
}
