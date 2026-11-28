'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui'
import type { Board } from './board-state'

// Confirms for Delete board (TAB-41) and Leave board (TAB-54). Copy as drawn in the Figma.
// They open over Manage tabs too; Cancel, Esc and × keep the board.

export type PendingConfirm = { kind: 'delete' | 'leave'; board: Board } | null

interface ConfirmDialogsProps {
  pending: PendingConfirm
  onCancel: () => void
  onConfirm: (kind: 'delete' | 'leave', id: string) => void
}

export function ConfirmDialogs({ pending, onCancel, onConfirm }: ConfirmDialogsProps) {
  const b = pending?.board
  const owner = b?.sharedBy?.name ?? 'The owner'
  const copy = pending?.kind === 'leave'
    ? {
        title: `Leave ${b?.label}?`,
        body: `${b?.label} leaves your tabs and All boards, and you lose access. ${owner} and everyone else keep the board. To get ${b?.label} back, ask ${owner} to share again.`,
        action: 'Leave board',
      }
    : {
        title: `Delete ${b?.label}?`,
        body: 'This removes the board’s cards and layout for everyone with access. Your data and connected apps aren’t affected. This board can be restored from ‘Recently deleted’ for 30 days.',
        action: 'Delete board',
      }
  return (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter style={{ paddingTop: 'var(--space-5)' }}>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={() => pending && onConfirm(pending.kind, pending.board.id)}>{copy.action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
