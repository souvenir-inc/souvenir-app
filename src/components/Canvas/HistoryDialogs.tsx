'use client'

import { Button } from '@/components/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BoardVersion } from './versions'
import styles from './Canvas.module.css'

/** "16 Nov, 14:05": day first, like the rest of the dashboard. */
function when(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

function cardsText(count: number): string {
  return count === 1 ? '1 card' : `${count} cards`
}

/**
 * A board's earlier versions, newest first, with who saved each and when. Restoring one saves it as the newest
 * version, so the one it replaces stays in the list.
 */
export function VersionsDialog({ boardName, versions, you, onRestore, onClose }: {
  boardName: string
  versions: BoardVersion[]
  /** The person looking, so their own versions read "You". */
  you: string
  onRestore: (at: string) => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="md" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'min(86vh, 640px)' }}>
        <DialogHeader>
          <DialogTitle>Versions of “{boardName}”</DialogTitle>
          <DialogDescription>Restoring a version keeps the current one in this list.</DialogDescription>
        </DialogHeader>
        <DialogBody style={{ paddingBottom: 16 }}>
          {versions.length === 0 ? (
            <p className={styles.noMatch}>No changes yet.</p>
          ) : (
            <ol className={styles.historyList}>
              {versions.map((version, i) => (
                <li key={version.at} className={styles.historyRow}>
                  <span className={styles.historyWhen}>{when(version.at)}</span>
                  <span className={styles.historyWhat}>
                    {version.by && version.by !== you ? version.by : 'You'} · {version.board.name} · {cardsText(version.board.cards.length)}
                  </span>
                  {i === 0
                    ? <span className={styles.historyNow}>Current</span>
                    : <Button variant="secondary" size="sm" onClick={() => { onRestore(version.at); onClose() }}>Restore</Button>}
                </li>
              ))}
            </ol>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
