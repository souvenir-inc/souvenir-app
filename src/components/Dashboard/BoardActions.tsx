'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import { Ellipsis, LayoutGrid, Pencil, Plus, Share } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { IconButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { MoreMenuContent, type BoardMenuHandlers } from './tabs/BoardMenus'
import type { Board } from './tabs/board-state'

// The board's actions, bottom right (Figma 6D, rules docs-v2/dashboard/02-board-screen-rules.md):
//   SpeedDial  the dark + (BS-4). Opens Add cards, New board, Edit board, Share, More above it
//              (BS-6 – BS-8); More opens the board's menu above the × (BS-9, BS-10).
//   EditBar    in edit mode the dial becomes a bar in the same corner: Add cards, New board,
//              Done (BS-17, BS-20, BS-21).

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const DIAL = 'bg-gradient-to-b from-[var(--dashboard-tab-active-from)] to-[var(--dashboard-tab-active-to)] text-[var(--dashboard-tab-active-text)]'

type Mode = 'closed' | 'dial' | 'more'

interface SpeedDialProps extends BoardMenuHandlers {
  board: Board
  tabs: Board[]
  hidden: Board[]
  deletedCount: number
  onlyOne: boolean
  /** Starts open on a new or nearly empty board (BS-5). Remount per board to re-apply. */
  startOpen: boolean
  onAddCards: () => void
  onNewBoard: () => void
  onEditBoard: () => void
  onShare: () => void
  onOpen: (id: string) => void
  onShow: (id: string) => void
  onStartOver: (id: string) => void
  onNotReady: (what: string) => void
}

export function SpeedDial({ board, startOpen, onAddCards, onNewBoard, onEditBoard, onShare, ...more }: SpeedDialProps) {
  const [mode, setMode] = useState<Mode>(startOpen ? 'dial' : 'closed')
  const rootRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const openAtPress = useRef(false)
  const reduceMotion = useReducedMotion()
  const canEdit = board.access !== 'view'

  // What this person can do decides what the dial offers (BS-8). Listed top to bottom.
  const actions = [
    ...(canEdit ? [{ key: 'add', label: 'Add cards', icon: Plus, run: onAddCards }] : []),
    { key: 'new', label: 'New board', icon: LayoutGrid, run: onNewBoard },
    ...(canEdit ? [{ key: 'edit', label: 'Edit board', icon: Pencil, run: onEditBoard }] : []),
    { key: 'share', label: 'Share', icon: Share, run: onShare },
    { key: 'more', label: 'More', icon: Ellipsis, run: () => setMode('more') },
  ]

  // Esc or a click outside closes the dial (BS-7). The More menu handles its own.
  useEffect(() => {
    if (mode !== 'dial') return
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setMode('closed') }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setMode('closed'); fabRef.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [mode])

  const open = mode !== 'closed'
  return (
    <div ref={rootRef} data-dashboard-fab className="absolute bottom-5 right-5 z-30 flex flex-col items-end">
      <IconButton
        ref={fabRef}
        aria-label={open ? 'Close board actions' : 'Board actions'}
        aria-expanded={mode === 'dial'}
        iconSize={16}
        icon={<Plus strokeWidth={1.5} absoluteStrokeWidth className={cn('transition-transform duration-base', open && 'rotate-45')} />}
        // The × always closes. With More open, pressing it first dismisses the menu (an outside
        // click), so what counts is whether anything was open when the press began.
        onPointerDown={() => { openAtPress.current = mode !== 'closed' }}
        onClick={(e) => {
          // Enter / Space (detail 0) has no press: use the state as it is.
          const wasOpen = e.detail === 0 ? mode !== 'closed' : openAtPress.current
          openAtPress.current = false
          setMode(wasOpen ? 'closed' : 'dial')
        }}
        className={cn('size-11 rounded-full border-0 [box-shadow:var(--dashboard-raised-shadow)]', DIAL)}
      />

      {/* The actions rise above the + (BS-6): 36px round buttons, 44px apart, labels beside them. */}
      <AnimatePresence>
        {mode === 'dial' && (
          <m.ul
            key="dial"
            aria-label="Board actions"
            className="absolute bottom-[56px] right-1 m-0 flex list-none flex-col items-end gap-2 p-0"
            initial="closed" animate="open" exit="closed"
            variants={{ open: { transition: { staggerChildren: 0.03, staggerDirection: -1 } }, closed: { transition: { staggerChildren: 0.02 } } }}
          >
            {actions.map((a) => (
              <m.li
                key={a.key}
                variants={reduceMotion ? {} : { open: { opacity: 1, y: 0 }, closed: { opacity: 0, y: 8 } }}
                transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
              >
                {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: one hit area for the label pill and the round button of a speed-dial action (Figma 93:18592 / 93:18596) */}
                <button
                  type="button"
                  onClick={() => { if (a.key !== 'more') setMode('closed'); a.run() }}
                  className={cn('group/dial flex cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent p-0', FOCUS)}
                >
                  <span className="flex h-7 items-center whitespace-nowrap rounded-lg bg-[var(--dashboard-card-bg)] px-2.5 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)] shadow-[var(--dashboard-raised-shadow)] transition-colors duration-fast group-hover/dial:bg-[var(--neutral-100)]">
                    {a.label}
                  </span>
                  <span className="flex size-9 items-center justify-center rounded-full bg-[var(--dashboard-card-bg)] text-[var(--neutral-700)] shadow-[var(--dashboard-raised-shadow)] transition-colors duration-fast group-hover/dial:bg-[var(--neutral-100)]">
                    <a.icon aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />
                  </span>
                </button>
              </m.li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>

      {/* More: the board's menu above the × (BS-9). Anchored to a box over the +. */}
      <div aria-hidden={mode !== 'more'} className="pointer-events-none absolute bottom-0 right-0 size-11">
        <Dropdown.Float
          open={mode === 'more'}
          onOpenChange={(o) => { if (!o) setMode('closed') }}
          placement="top-end"
          autoFlipVertical
          trigger={<span className="block size-11" />}
        >
          <MoreMenuContent board={board} {...more} onNewBoard={onNewBoard} close={() => setMode('closed')} />
        </Dropdown.Float>
      </div>
    </div>
  )
}

// ── Edit bar (BS-17) ──────────────────────────────────────────────────────────

interface EditBarProps {
  /** Opens the card picker; edit mode stays on underneath (06 AC-2). */
  onAddCards: () => void
  onNewBoard: () => void
  onDone: () => void
}

export function EditBar({ onAddCards, onNewBoard, onDone }: EditBarProps) {
  const segment = cn('flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-transparent pl-3 pr-3.5 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)] transition-colors duration-fast hover:bg-[var(--neutral-100)]', FOCUS)
  return (
    <div
      data-dashboard-fab
      data-dashboard-editbar
      role="toolbar"
      aria-label="Editing the board"
      className="absolute bottom-5 right-5 z-30 flex items-center gap-0.5 rounded-full bg-[var(--dashboard-card-bg)] p-1 shadow-[var(--dashboard-popover-shadow)]"
    >
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a segment of the floating edit bar (Figma 75:21287) */}
      <button type="button" className={segment} onClick={onAddCards}>
        <Plus aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />Add cards
      </button>
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a segment of the floating edit bar (Figma 75:21287) */}
      <button type="button" className={segment} onClick={onNewBoard}>
        <Plus aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />New board
      </button>
      <span aria-hidden className="mx-0.5 h-4 w-px bg-[var(--neutral-200)]" />
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the dark Done segment of the floating edit bar (Figma 75:21299) */}
      <button
        type="button"
        onClick={onDone}
        className={cn('flex h-9 cursor-pointer items-center rounded-full border-0 px-[18px] text-[13px] font-medium leading-5', DIAL, FOCUS)}
      >
        Done
      </button>
    </div>
  )
}
