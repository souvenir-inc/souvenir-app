'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui'
import { Select } from '@/components/ui/select'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Board } from './tabs/board-state'

// The workspace's default board for new members (Figma 7.2, 20:10587; 11 DT-8 – DT-9): admins only,
// from More. New members start on it; nobody's own tabs change.

interface DefaultBoardDialogProps {
  open: boolean
  /** The boards you can see: your tabs, then hidden ones. */
  boards: Board[]
  current: string
  onClose: () => void
  onSave: (boardId: string) => void
}

export function DefaultBoardDialog({ open, ...rest }: DefaultBoardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {open && <Pick {...rest} />}
    </Dialog>
  )
}

function Pick({ boards, current, onSave }: Omit<DefaultBoardDialogProps, 'open'>) {
  const [pick, setPick] = useState(boards.some((b) => b.id === current) ? current : boards[0]?.id)
  return (
    <DialogContent
      hideClose
      data-default-board
      style={{ width: 'min(420px, calc(100vw - 32px))', maxWidth: 'none', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', background: 'var(--dashboard-card-bg)' }}
    >
      <div className="relative flex flex-col gap-1 pr-8">
        <DialogTitle className="text-[length:var(--font-size-body-md)] font-semibold leading-6 text-[var(--dashboard-figure)]">Default board for new members</DialogTitle>
        <p className="m-0 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">New members start on this board. It never changes anyone’s own tabs.</p>
        <DialogClose asChild>
          <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute -right-1.5 -top-1 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
        </DialogClose>
      </div>
      <Select
        aria-label="Default board"
        variant="outline"
        size="md"
        menuSize="lg"
        className="mt-4 w-full justify-between"
        options={boards.map((b) => ({ value: b.id, label: b.label }))}
        value={pick}
        onValueChange={setPick}
      />
      <div className="mt-5 flex justify-end">
        <Button size="sm" data-default-save disabled={!pick} onClick={() => { if (pick) onSave(pick) }}>Save</Button>
      </div>
    </DialogContent>
  )
}
