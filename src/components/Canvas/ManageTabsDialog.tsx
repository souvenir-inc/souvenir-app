'use client'

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Eye, EyeOff, GripVertical, Info, Link, LogOut, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { BoardMenu, BoardMenuItem, BoardMenuSeparator } from './BoardMenu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { Board } from './board'
import { RenameField } from './BoardTabs'
import { daysLeft } from './doc'
import { SharedTag } from './SharedTag'
import type { DeletedBoard } from './store'
import { gapAt, isNoopGap, moveToGap } from './tabs'
import styles from './Canvas.module.css'

export type ManageView = 'tabs' | 'hidden' | 'deleted'

export interface ManageTabsProps {
  tabs: Board[]
  hidden: Board[]
  deleted: DeletedBoard[]
  now: string
  /** How many tabs fit in the row, so a line can mark where it ends. */
  rowLimit: number
  initialView?: ManageView
  /** False with one board left: it can't be deleted or left. */
  canDelete: boolean
  /** Save: your tabs in order (anything left out is hidden) and any renames. */
  onSave: (changes: { tabs: string[]; names: Record<string, string> }) => void
  onDuplicate: (id: string) => void
  onCopyLink: (id: string) => void
  /** These three apply at once, each with its own Undo (D93); Cancel doesn't reverse them. */
  onDelete: (id: string) => void
  onLeave: (id: string) => void
  onRestore: (id: string) => void
  onNewBoard: () => void
  onClose: () => void
}

const VIEW_LABEL: Record<ManageView, string> = { tabs: 'Your tabs', hidden: 'Hidden', deleted: 'Recently deleted' }

/** Edge of the list where a dragged row scrolls it. */
const AUTOSCROLL_PX = 28

/**
 * Manage tabs (D91–D95; Figma `415:64464`): every board you have, in a dialog of one size. Your tabs (in the row's
 * order, with a line where the row ends), Hidden and Recently deleted. Moving, renaming, hiding and showing wait for
 * Save, and Cancel throws them away; deleting, leaving and restoring apply straight away with Undo on their toast.
 */
export function ManageTabsDialog({
  tabs, hidden, deleted, now, rowLimit, initialView = 'tabs', canDelete, onSave, onDuplicate, onCopyLink, onDelete,
  onLeave, onRestore, onNewBoard, onClose,
}: ManageTabsProps) {
  const [view, setView] = useState<ManageView>(initialView)
  const byId = new Map([...tabs, ...hidden].map(b => [b.id, b]))

  // ── What waits for Save ──
  const tabIds = tabs.map(b => b.id)
  const hiddenIds = hidden.map(b => b.id)
  const [order, setOrder] = useState<string[]>(tabIds)
  const [hiddenOrder, setHiddenOrder] = useState<string[]>(hiddenIds)
  const [names, setNames] = useState<Record<string, string>>({})
  // Boards that come or go while the dialog is open (a delete, a restore, a copy, a new board) join or leave the
  // staged lists without dropping what's staged: new tabs land after the tab before them, new hidden boards at the end.
  const signature = `${tabIds.join('|')}#${hiddenIds.join('|')}`
  const [seen, setSeen] = useState(signature)
  if (signature !== seen) {
    setSeen(signature)
    const all = new Set([...tabIds, ...hiddenIds])
    const known = new Set([...order, ...hiddenOrder])
    const nextOrder = order.filter(id => all.has(id))
    const nextHidden = hiddenOrder.filter(id => all.has(id))
    tabIds.forEach((id, i) => {
      if (known.has(id)) return
      const after = i > 0 ? nextOrder.indexOf(tabIds[i - 1]) : -1
      nextOrder.splice(after === -1 ? (i === 0 ? 0 : nextOrder.length) : after + 1, 0, id)
    })
    hiddenIds.forEach(id => { if (!known.has(id)) nextHidden.push(id) })
    setOrder(nextOrder)
    setHiddenOrder(nextHidden)
  }

  const nameOf = (id: string) => names[id] ?? byId.get(id)?.name ?? ''
  const hide = (id: string) => {
    if (order.length <= 1) return
    setOrder(order.filter(t => t !== id))
    setHiddenOrder([...hiddenOrder, id])
  }
  const show = (id: string) => {
    setHiddenOrder(hiddenOrder.filter(t => t !== id))
    setOrder([...order, id])
  }
  const save = () => {
    const renamed = Object.fromEntries(Object.entries(names).filter(([id, name]) => byId.get(id)?.name !== name))
    onSave({ tabs: order, names: renamed })
    onClose()
  }

  // ── Rows: renaming, menus, confirms ──
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'leave'; id: string } | null>(null)

  // ── The list: fades at whichever end has more, and dragging rows ──
  const listRef = useRef<HTMLDivElement>(null)
  const [fades, setFades] = useState({ top: false, bottom: false })
  const measureFades = () => {
    const list = listRef.current
    if (!list) return
    const next = { top: list.scrollTop > 1, bottom: list.scrollTop + list.clientHeight < list.scrollHeight - 1 }
    setFades(prev => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
  }
  useLayoutEffect(measureFades, [view, order.length, hiddenOrder.length, deleted.length])

  const [drag, setDrag] = useState<{ id: string; x: number; y: number; gap: number | null; line: number | null } | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; started: boolean; gap: number | null } | null>(null)
  const live = useRef(order)
  useLayoutEffect(() => { live.current = order })

  const gapFor = (id: string, y: number): number | null => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-manage-id]') ?? [])]
    const gap = gapAt(rows.map(r => { const b = r.getBoundingClientRect(); return { start: b.top, end: b.bottom } }), y)
    return isNoopGap(live.current, id, gap) ? null : gap
  }

  /** The drop line's place in the list: above the row after the gap, or under the last row. */
  function lineAt(gap: number | null): number | null {
    if (gap === null || !listRef.current) return null
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('[data-manage-id]')]
    const row = rows[Math.min(gap, rows.length - 1)]
    if (!row) return null
    return gap < rows.length ? row.offsetTop - 1 : row.offsetTop + row.offsetHeight - 1
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      const state = dragRef.current
      const list = listRef.current
      if (!state || !list) return
      const box = list.getBoundingClientRect()
      if (event.clientY < box.top + AUTOSCROLL_PX) list.scrollTop -= 8
      else if (event.clientY > box.bottom - AUTOSCROLL_PX) list.scrollTop += 8
      state.gap = gapFor(state.id, event.clientY)
      setDrag({ id: state.id, x: event.clientX, y: event.clientY, gap: state.gap, line: lineAt(state.gap) })
    }
    const finish = (commit: boolean) => {
      const state = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!commit || !state || state.gap === null) return
      const next = moveToGap(live.current, state.id, state.gap)
      if (next !== live.current) setOrder([...next])
    }
    const onUp = () => finish(true)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      finish(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [drag !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const onRowPointerDown = (id: string) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || renamingId === id) return
    if ((event.target as HTMLElement).closest('button:not([data-grip]), input, [role="menuitem"]')) return
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, started: false, gap: null }
    const onMove = (move: PointerEvent) => {
      const state = dragRef.current
      if (!state || state.started) return
      if (Math.hypot(move.clientX - state.startX, move.clientY - state.startY) < 4) return
      state.started = true
      setMenuId(null)
      setDrag({ id, x: move.clientX, y: move.clientY, gap: null, line: null })
      cleanup()
    }
    const onUp = () => { if (dragRef.current && !dragRef.current.started) dragRef.current = null; cleanup() }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const moveBy = (id: string, step: -1 | 1) => {
    const from = order.indexOf(id)
    const to = from + step
    if (from === -1 || to < 0 || to >= order.length) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, id)
    setOrder(next)
  }

  const dropTop = drag?.line ?? null

  const counts: Record<ManageView, number> = { tabs: order.length, hidden: hiddenOrder.length, deleted: deleted.length }

  const rowMenu = (id: string) => {
    const board = byId.get(id)
    if (!board) return null
    const act = (action: () => void) => () => { setMenuId(null); action() }
    return (
      <Dropdown.Float
        open={menuId === id}
        onOpenChange={open => setMenuId(open ? id : null)}
        placement="bottom-end"
        offset={4}
        trigger={
          <button type="button" className={styles.manageIcon} aria-label={`More for ${nameOf(id)}`}>
            <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
          </button>
        }
      >
        <BoardMenu width={board.sharedBy ? 200 : 176}>
          {!board.sharedBy && <BoardMenuItem icon={Pencil} label="Rename" onSelect={act(() => setRenamingId(id))} />}
          <BoardMenuItem icon={Copy} label="Duplicate" onSelect={act(() => onDuplicate(id))} />
          <BoardMenuItem icon={Link} label="Copy link" onSelect={act(() => onCopyLink(id))} />
          <BoardMenuSeparator />
          <BoardMenuItem icon={EyeOff} label="Hide tab" disabled={order.length <= 1} onSelect={act(() => hide(id))} />
          {board.sharedBy ? (
            <BoardMenuItem icon={LogOut} label="Leave board" danger disabled={!canDelete} onSelect={act(() => setConfirm({ kind: 'leave', id }))} />
          ) : (
            <BoardMenuItem icon={Trash2} label="Delete board" danger disabled={!canDelete} onSelect={act(() => setConfirm({ kind: 'delete', id }))} />
          )}
          {board.sharedBy && <p className={styles.menuFoot}>Shared by <strong>{board.sharedBy}</strong></p>}
        </BoardMenu>
      </Dropdown.Float>
    )
  }

  const confirmBoard = confirm ? byId.get(confirm.id) : undefined

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent hideClose aria-describedby={undefined} className={styles.manage}
        style={{ width: 480, height: 560, maxHeight: 'calc(100dvh - 64px)', borderRadius: 20 }}
        onEscapeKeyDown={event => { if (renamingId || drag) event.preventDefault() }}>
        <div className={styles.manageHead}>
          <DialogTitle className={styles.manageTitle}>Manage tabs</DialogTitle>
          <button type="button" className={styles.manageClose} aria-label="Close" onClick={onClose}>
            <X size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />
          </button>
        </div>
        <div className={styles.manageViews} role="tablist" aria-label="Boards">
          {(['tabs', 'hidden', 'deleted'] as const).map(id => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={styles.manageView}
              onClick={() => { setView(id); setMenuId(null); setRenamingId(null) }}>
              {VIEW_LABEL[id]}
              <span className={styles.manageCount}>{counts[id]}</span>
            </button>
          ))}
        </div>

        <div className={styles.manageBody} data-fade-top={fades.top || undefined} data-fade-bottom={fades.bottom || undefined}>
          <div ref={listRef} className={styles.manageList} onScroll={measureFades} role="tabpanel" aria-label={VIEW_LABEL[view]}>
            {view !== 'tabs' && (
              <p className={styles.manageHelper}>
                <Info size={14} strokeWidth={1.25} absoluteStrokeWidth aria-hidden />
                {view === 'hidden' ? 'Hidden boards don’t show in your tab row.' : 'Boards you deleted stay here for 30 days.'}
              </p>
            )}

            {view === 'tabs' && order.map((id, i) => {
              const board = byId.get(id)
              if (!board) return null
              return (
                <div key={id} className={styles.manageRowWrap}>
                  <div
                    className={styles.manageRow}
                    data-manage-id={id}
                    data-dragging={drag?.id === id || undefined}
                    data-open={menuId === id || undefined}
                    onPointerDown={onRowPointerDown(id)}
                    onContextMenu={event => { event.preventDefault(); setMenuId(id) }}
                  >
                    <button type="button" data-grip className={styles.manageGrip} aria-label={`Move ${nameOf(id)}. Use the up and down arrows.`}
                      onKeyDown={event => {
                        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                        event.preventDefault()
                        moveBy(id, event.key === 'ArrowUp' ? -1 : 1)
                      }}>
                      <GripVertical size={16} strokeWidth={1.75} aria-hidden />
                    </button>
                    {renamingId === id ? (
                      <RenameField
                        name={nameOf(id)}
                        className={styles.manageInput}
                        onDone={name => {
                          const clean = name?.trim().replace(/\s+/g, ' ')
                          if (clean) setNames({ ...names, [id]: clean })
                          setRenamingId(null)
                        }}
                      />
                    ) : (
                      <span className={styles.manageName}>
                        <span className={styles.manageNameText}>{nameOf(id)}</span>
                        {board.sharedBy && <SharedTag owner={board.sharedBy} />}
                      </span>
                    )}
                    <span className={styles.manageActions}>
                      <Tooltip content="Hide tab" disabled={order.length <= 1}>
                        <button type="button" className={styles.manageIcon} data-eye aria-label={`Hide ${nameOf(id)}`}
                          disabled={order.length <= 1} onClick={() => hide(id)}>
                          <Eye size={16} strokeWidth={1.75} aria-hidden />
                        </button>
                      </Tooltip>
                      {rowMenu(id)}
                    </span>
                  </div>
                  {i === rowLimit - 1 && order.length > rowLimit && <hr className={styles.manageRowEnd} aria-hidden />}
                </div>
              )
            })}

            {view === 'hidden' && hiddenOrder.map(id => {
              const board = byId.get(id)
              if (!board) return null
              return (
                <div key={id} className={styles.manageRow} data-muted>
                  <span className={styles.manageName}>
                    <span className={styles.manageNameText}>{nameOf(id)}</span>
                    {board.sharedBy && <SharedTag owner={board.sharedBy} muted />}
                  </span>
                  <span className={styles.manageActions}>
                    <Tooltip content="Show tab">
                      <button type="button" className={styles.manageIcon} data-eye aria-label={`Show ${nameOf(id)}`} onClick={() => show(id)}>
                        <EyeOff size={16} strokeWidth={1.75} aria-hidden />
                      </button>
                    </Tooltip>
                  </span>
                </div>
              )
            })}

            {view === 'deleted' && deleted.map(entry => {
              const left = daysLeft(entry.deletedAt, now)
              return (
                <div key={entry.board.id} className={styles.manageRow} data-deleted>
                  <span className={styles.manageName}>
                    <span className={styles.manageNameText}>{entry.board.name}</span>
                    <span className={styles.manageMeta}>{left === 1 ? '1 day left' : `${left} days left`}</span>
                  </span>
                  <button type="button" className={styles.manageRestore} onClick={() => onRestore(entry.board.id)}>
                    <RotateCcw size={12} strokeWidth={2} aria-hidden />
                    Restore
                  </button>
                </div>
              )
            })}

            {view === 'hidden' && hiddenOrder.length === 0 && <p className={styles.manageEmpty}>No hidden boards.</p>}
            {view === 'deleted' && deleted.length === 0 && <p className={styles.manageEmpty}>No deleted boards.</p>}
            {dropTop !== null && <span className={styles.manageDropLine} style={{ top: dropTop }} aria-hidden />}
          </div>
        </div>

        <div className={styles.manageFoot}>
          {view !== 'deleted' && (
            <button type="button" className={styles.manageButton} data-kind="new" onClick={onNewBoard}>
              <Plus size={16} strokeWidth={1.75} aria-hidden />
              New board
            </button>
          )}
          <span className={styles.manageFootEnd}>
            <button type="button" className={styles.manageButton} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.manageButton} data-kind="save" onClick={save}>Save</button>
          </span>
        </div>

        {drag && typeof document !== 'undefined' && createPortal(
          <span className={styles.dragChip} style={{ left: drag.x + 12, top: drag.y + 14 }} aria-hidden>{nameOf(drag.id)}</span>,
          document.body,
        )}
      </DialogContent>

      {confirm && confirmBoard && (confirm.kind === 'delete' ? (
        <ConfirmModal
          title={`Delete ${confirmBoard.name}?`}
          description={deleteText(confirmBoard)}
          confirmLabel="Delete board"
          onConfirm={async () => { onDelete(confirm.id) }}
          onClose={() => setConfirm(null)}
        />
      ) : (
        <ConfirmModal
          title={`Leave ${confirmBoard.name}?`}
          description={leaveText(confirmBoard)}
          confirmLabel="Leave board"
          onConfirm={async () => { onLeave(confirm.id) }}
          onClose={() => setConfirm(null)}
        />
      ))}
    </Dialog>
  )
}

/** The Leave board confirm's text (D90). */
export function leaveText(board: Board): string {
  const owner = board.sharedBy ?? 'The owner'
  return `${board.name} leaves your tabs and All boards, and you lose access. ${owner} and everyone else keep the board. To get ${board.name} back, ask ${owner} to share again.`
}

/** The Delete board confirm's text (D88). */
export function deleteText(board: Board): string {
  return `This removes the board’s cards and layout for everyone with access. Your data and connected apps aren’t affected. ${board.name} can be restored from Recently deleted for 30 days.`
}
