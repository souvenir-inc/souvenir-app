'use client'

import { Users } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import styles from './Canvas.module.css'

/**
 * The "Shared" mark right after a board's name, on a board someone shared with you (D95; Figma `Tag / Shared`
 * 470:61198). Hovering it names the owner. Muted in the Hidden list. It never shrinks, so a long name is cut first.
 */
export function SharedTag({ owner, muted = false }: { owner: string; muted?: boolean }) {
  return (
    <Tooltip content={`Shared by ${owner}`}>
      <span className={styles.sharedTag} data-muted={muted || undefined} tabIndex={0} aria-label={`Shared by ${owner}`}>
        <Users size={12} strokeWidth={1.75} aria-hidden />
        Shared
      </span>
    </Tooltip>
  )
}
