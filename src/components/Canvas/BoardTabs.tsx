'use client'

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, Copy, EyeOff, Link, LogOut, Pencil, SlidersHorizontal, Trash2,
} from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { BoardMenu, BoardMenuItem, BoardMenuSeparator } from './BoardMenu'
import type { Board } from './board'
import { gapAt, gapInOrder, isNoopGap, moveToGap, NARROW_TAB_LIMIT, NARROW_WIDTH, TAB_LIMIT, visibleTabs } from './tabs'
import { BOARD_NAME_MAX } from './useBoards'
import styles from './Canvas.module.css'

export interface BoardTabsProps {
  /** Your tabs, in your order. The first is your home board. */
  tabs: Board[]
  activeId: string | null
  /** A board to open straight into renaming (one just added, or "Rename" from a menu). */
  renamingId: string | null
  onRenamingChange: (id: string | null) => void
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onReorder: (ids: string[]) => void
  onDuplicate: (id: string) => void
  onCopyLink: (id: string) => void
  onHide: (id: string) => void
  onDelete: (id: string) => void
  onLeave: (id: string) => void
  onManage: () => void
  /** False with one board left: it can't be deleted. */
  canDelete: boolean
}

/** Tabs on show: six, or four in a narrow window (D77). */
function useTabLimit(): number {
  const narrow = useSyncExternalStore(
    notify => {
      const query = window.matchMedia(`(max-width: ${NARROW_WIDTH}px)`)
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia(`(max-width: ${NARROW_WIDTH}px)`).matches,
    () => false,
  )
  return narrow ? NARROW_TAB_LIMIT : TAB_LIMIT
}

type DropTarget = { zone: 'row' | 'more'; gap: number }
/** A drag in progress: the tab, the pointer, where it would land, and the drop line's place in the row (if there). */
interface Drag { id: string; x: number; y: number; target: DropTarget | null; line: number | null }

/** How far the pointer moves before a press on a tab becomes a drag. */
const DRAG_START_PX = 4
/** Holding a dragged tab over "N more" this long opens the list (D86). */
const SPRING_OPEN_MS = 500

/**
 * Your tabs (D77–D86), on the header's left: a grey capsule with the open board in a dark segment that slides between
 * tabs (New board lives on the board's + since the speed dial, D43). Up to six show
 * (four in a narrow window), then "N more" lists the rest; the open board is always on show. Click to switch,
 * double-click the open tab to rename, right-click for the board's menu. Drag a tab and a blue line marks where it
 * will land while the other tabs stay put; holding it over "N more" opens the list so it can be dropped there.
 * From the keyboard, ← → move between tabs and Alt + ← → moves one.
 */
export function BoardTabs({
  tabs, activeId, renamingId, onRenamingChange, onSelect, onRename, onReorder, onDuplicate, onCopyLink, onHide,
  onDelete, onLeave, onManage, canDelete,
}: BoardTabsProps) {
  const limit = useTabLimit()
  const order = tabs.map(b => b.id)
  const byId = new Map(tabs.map(b => [b.id, b]))
  const { shown, more } = visibleTabs(order, activeId, limit)

  const trackRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [menu, setMenu] = useState<{ id: string; left: number; top: number } | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  /** The tab under the pointer whose name is cut short: its full name shows on hover. */
  const [cutId, setCutId] = useState<string | null>(null)
  const rovingId = focusId && shown.includes(focusId) ? focusId : activeId && shown.includes(activeId) ? activeId : shown[0]

  // ── The sliding highlight under the open tab ──
  const [highlight, setHighlight] = useState<{ left: number; width: number; animate: boolean } | null>(null)
  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const place = (animate: boolean) => {
      const tab = activeId && activeId !== renamingId
        ? track.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeId)}"]`)
        : null
      setHighlight(prev => {
        if (!tab) return null
        const next = { left: tab.offsetLeft, width: tab.offsetWidth, animate: animate && prev !== null }
        return prev && prev.left === next.left && prev.width === next.width ? prev : next
      })
    }
    place(true)
    const observer = new ResizeObserver(() => place(false))
    observer.observe(track)
    return () => observer.disconnect()
  }, [activeId, renamingId, shown.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dragging ──
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; started: boolean; target: DropTarget | null } | null>(null)
  const springRef = useRef<number | null>(null)
  const openedByDragRef = useRef(false)
  const suppressClickRef = useRef(false)
  const live = useRef({ order, shown, more, moreOpen, onReorder })
  useLayoutEffect(() => { live.current = { order, shown, more, moreOpen, onReorder } })

  const clearSpring = () => {
    if (springRef.current !== null) window.clearTimeout(springRef.current)
    springRef.current = null
  }

  /** Where a dragged tab would land with the pointer at (x, y): a gap in the row or in the open "N more" list. */
  const targetAt = (id: string, x: number, y: number): DropTarget | null => {
    const { order, shown, more, moreOpen } = live.current
    if (moreOpen) {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-more-id]')]
      const list = rows[0]?.parentElement?.getBoundingClientRect()
      if (rows.length > 0 && list && x >= list.left - 8 && x <= list.right + 8 && y >= list.top - 8 && y <= list.bottom + 8) {
        const gap = gapAt(rows.map(r => { const b = r.getBoundingClientRect(); return { start: b.top, end: b.bottom } }), y)
        return isNoopGap(order, id, gapInOrder(order, more, gap)) ? null : { zone: 'more', gap }
      }
    }
    const track = trackRef.current?.getBoundingClientRect()
    if (!track || y < track.top - 32 || y > track.bottom + 32) return null
    const edges = shown.map(tabId => {
      const el = trackRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(tabId)}"]`)
      const b = el?.getBoundingClientRect()
      return { start: b?.left ?? 0, end: b?.right ?? 0 }
    })
    const gap = gapAt(edges, x)
    return isNoopGap(order, id, gapInOrder(order, shown, gap)) ? null : { zone: 'row', gap }
  }

  /** The drop line in the row: at the left edge of the tab after the gap, or the right edge of the last one. */
  function lineAt(target: DropTarget | null): number | null {
    if (target?.zone !== 'row' || !trackRef.current) return null
    const { shown } = live.current
    const el = (id: string) => trackRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)
    const tab = target.gap < shown.length ? el(shown[target.gap]) : el(shown[shown.length - 1])
    if (!tab) return null
    return target.gap < shown.length ? tab.offsetLeft - 2 : tab.offsetLeft + tab.offsetWidth
  }

  const endDrag = (commit: boolean) => {
    const state = dragRef.current
    dragRef.current = null
    clearSpring()
    setDrag(null)
    if (openedByDragRef.current) { openedByDragRef.current = false; setMoreOpen(false) }
    if (!state?.started) return
    suppressClickRef.current = true
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
    if (!commit || !state.target) return
    const { order, shown, more, onReorder } = live.current
    const part = state.target.zone === 'row' ? shown : more
    const next = moveToGap(order, state.id, gapInOrder(order, part, state.target.gap))
    if (next !== order) onReorder([...next])
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      const state = dragRef.current
      if (!state) return
      const target = targetAt(state.id, event.clientX, event.clientY)
      state.target = target
      setDrag({ id: state.id, x: event.clientX, y: event.clientY, target, line: lineAt(target) })
      // Spring-loaded "N more": hold over it to open the list.
      const trigger = moreRef.current?.getBoundingClientRect()
      const overMore = trigger && event.clientX >= trigger.left && event.clientX <= trigger.right
        && event.clientY >= trigger.top && event.clientY <= trigger.bottom
      if (overMore && !live.current.moreOpen && springRef.current === null) {
        springRef.current = window.setTimeout(() => {
          springRef.current = null
          openedByDragRef.current = true
          setMoreOpen(true)
        }, SPRING_OPEN_MS)
      } else if (!overMore) clearSpring()
    }
    const onUp = () => endDrag(true)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); endDrag(false) } }
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

  const onTabPointerDown = (id: string) => (event: ReactPointerEvent) => {
    if (event.button !== 0 || id === renamingId) return
    dragRef.current = { id, startX: event.clientX, startY: event.clientY, started: false, target: null }
    const onMove = (move: PointerEvent) => {
      const state = dragRef.current
      if (!state || state.started) return
      if (Math.hypot(move.clientX - state.startX, move.clientY - state.startY) < DRAG_START_PX) return
      state.started = true
      setMenu(null)
      setDrag({ id, x: move.clientX, y: move.clientY, target: null, line: null })
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

  const dropLeft = drag?.line ?? null
  const moreDrop = drag?.target?.zone === 'more' ? drag.target.gap : null

  // ── Moving a tab one place (Alt + ← →, or Move left / Move right) ──
  const moveBy = (id: string, step: -1 | 1) => {
    const from = order.indexOf(id)
    const to = from + step
    if (from === -1 || to < 0 || to >= order.length) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, id)
    onReorder(next)
  }

  const focusTab = (id: string) => {
    setFocusId(id)
    trackRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"] [data-tab-button]`)?.focus()
  }

  /** A tab's menu opens under the tab, its left edge on the tab's, 8 below (T-3c), from a right-click or the keyboard. */
  const openMenu = (id: string) => {
    const tab = trackRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(id)}"]`)
    if (!tab) return
    setMoreOpen(false)
    setMenu({ id, left: tab.offsetLeft, top: tab.offsetTop + tab.offsetHeight })
  }

  const menuBoard = menu ? byId.get(menu.id) : undefined
  const menuIndex = menu ? order.indexOf(menu.id) : -1
  const act = (action: () => void) => () => { setMenu(null); action() }

  return (
    <nav className={styles.boardTabs} aria-label="Boards">
      <div ref={trackRef} className={styles.tabTrack} data-dragging={drag ? true : undefined}>
        {highlight && (
          <span
            className={styles.tabHighlight}
            data-animate={highlight.animate || undefined}
            style={{ transform: `translateX(${highlight.left}px)`, width: highlight.width }}
            aria-hidden
          />
        )}
        {shown.map(id => {
          const board = byId.get(id)
          if (!board) return null
          const index = order.indexOf(id)
          return (
            <div key={id} className={styles.boardTabItem} data-tab-id={id} data-dragging={drag?.id === id || undefined}>
              {id === renamingId ? (
                <RenameField
                  name={board.name}
                  onDone={name => {
                    if (name !== null) onRename(id, name)
                    onRenamingChange(null)
                  }}
                />
              ) : (
                <Tooltip content={board.name} side="bottom" disabled={cutId !== id || drag !== null}>
                <button
                  type="button"
                  data-tab-button
                  className={styles.boardTab}
                  aria-current={id === activeId ? 'page' : undefined}
                  aria-label={index === 0 ? `${board.name}, home board` : undefined}
                  tabIndex={id === rovingId ? 0 : -1}
                  onPointerDown={onTabPointerDown(id)}
                  onPointerEnter={event => {
                    // The full name on hover, only when it's cut short.
                    const label = event.currentTarget.firstElementChild as HTMLElement | null
                    setCutId(label && label.scrollWidth > label.clientWidth ? id : null)
                  }}
                  onClick={() => { if (!suppressClickRef.current) onSelect(id) }}
                  onDoubleClick={() => { if (id === activeId && !board.sharedBy) onRenamingChange(id) }}
                  onContextMenu={event => { event.preventDefault(); openMenu(id) }}
                  onFocus={() => setFocusId(id)}
                  onKeyDown={event => {
                    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                      event.preventDefault()
                      openMenu(id)
                      return
                    }
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                    event.preventDefault()
                    const step = event.key === 'ArrowLeft' ? -1 : 1
                    if (event.altKey) { moveBy(id, step); return }
                    const next = shown[shown.indexOf(id) + step]
                    if (next) focusTab(next)
                    else if (step === 1 && more.length > 0) moreRef.current?.focus()
                  }}
                >
                  <span className={styles.boardTabName}>{board.name}</span>
                </button>
                </Tooltip>
              )}
            </div>
          )
        })}
        {more.length > 0 && (
          <Dropdown.Float
            open={moreOpen}
            onOpenChange={open => { setMoreOpen(open); if (!open) openedByDragRef.current = false }}
            placement="bottom-start"
            trigger={
              <button
                ref={moreRef}
                type="button"
                className={styles.boardTabMore}
                data-drop-target={drag && moreOpen ? true : undefined}
                tabIndex={-1}
                onKeyDown={event => {
                  if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab(shown[shown.length - 1]) }
                }}
              >
                {more.length} more
                <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
              </button>
            }
          >
            <BoardMenu>
              <div className={styles.moreList}>
                {more.map((id, i) => (
                  <BoardMenuItem
                    key={id}
                    data-more-id={id}
                    label={byId.get(id)?.name ?? ''}
                    data-drop={moreDrop === i ? 'before' : moreDrop === more.length && i === more.length - 1 ? 'after' : undefined}
                    onSelect={() => { setMoreOpen(false); onSelect(id) }}
                  />
                ))}
              </div>
              <BoardMenuSeparator />
              <BoardMenuItem icon={SlidersHorizontal} label="Manage tabs" onSelect={() => { setMoreOpen(false); onManage() }} />
            </BoardMenu>
          </Dropdown.Float>
        )}
        {dropLeft !== null && <span className={styles.dropLine} style={{ left: dropLeft }} aria-hidden />}
        {menu && menuBoard && (
          <span className={styles.menuAnchor} style={{ left: menu.left, top: menu.top }}>
            <Dropdown.Float
              open
              onOpenChange={open => { if (!open) setMenu(null) }}
              placement="bottom-start"
              offset={8}
              trigger={<span aria-hidden className={styles.menuAnchorPoint} />}
            >
              <BoardMenu width={menuBoard.sharedBy ? 272 : 240}>
                {!menuBoard.sharedBy && (
                  <BoardMenuItem icon={Pencil} label="Rename" onSelect={act(() => { onSelect(menuBoard.id); onRenamingChange(menuBoard.id) })} />
                )}
                <BoardMenuItem icon={Copy} label="Duplicate" onSelect={act(() => onDuplicate(menuBoard.id))} />
                <BoardMenuItem icon={Link} label="Copy link" onSelect={act(() => onCopyLink(menuBoard.id))} />
                <BoardMenuSeparator />
                <BoardMenuItem icon={ArrowLeft} label="Move left" end={<kbd className={styles.menuKey}>⌥←</kbd>}
                  disabled={menuIndex <= 0} onSelect={act(() => moveBy(menuBoard.id, -1))} />
                <BoardMenuItem icon={ArrowRight} label="Move right" end={<kbd className={styles.menuKey}>⌥→</kbd>}
                  disabled={menuIndex === -1 || menuIndex >= order.length - 1} onSelect={act(() => moveBy(menuBoard.id, 1))} />
                <BoardMenuItem icon={SlidersHorizontal} label="Manage tabs" onSelect={act(onManage)} />
                <BoardMenuSeparator />
                <BoardMenuItem icon={EyeOff} label="Hide tab" disabled={order.length <= 1} onSelect={act(() => onHide(menuBoard.id))} />
                {menuBoard.sharedBy ? (
                  <BoardMenuItem icon={LogOut} label="Leave board" danger disabled={!canDelete} onSelect={act(() => onLeave(menuBoard.id))} />
                ) : (
                  <BoardMenuItem icon={Trash2} label="Delete board" danger disabled={!canDelete} onSelect={act(() => onDelete(menuBoard.id))} />
                )}
                {menuBoard.sharedBy && <p className={styles.menuFoot}>Shared by <strong>{menuBoard.sharedBy}</strong></p>}
              </BoardMenu>
            </Dropdown.Float>
          </span>
        )}
      </div>
      {drag && byId.get(drag.id) && typeof document !== 'undefined' && createPortal(
        <span className={styles.dragChip} style={{ left: drag.x + 12, top: drag.y + 14 }} aria-hidden>
          {byId.get(drag.id)?.name}
        </span>,
        document.body,
      )}
    </nav>
  )
}

/**
 * The tab, as a text field. Enter or leaving it keeps the name. An empty name can't be kept (D89): Enter leaves the
 * field open with "Add a board name"; Escape or clicking away puts the old name back.
 */
export function RenameField({ name, onDone, className }: {
  name: string
  onDone: (name: string | null) => void
  className?: string
}) {
  const [text, setText] = useState(name)
  const [touched, setTouched] = useState(false)
  const empty = text.trim() === ''
  const invalid = empty && touched
  return (
    <span className={styles.renameWrap}>
      <input
        className={className ?? styles.boardTabInput}
        aria-label="Board name"
        aria-invalid={invalid || undefined}
        placeholder="Board name"
        value={text}
        maxLength={BOARD_NAME_MAX}
        size={Math.max(8, text.length + 1)}
        autoFocus
        onFocus={event => event.currentTarget.select()}
        onChange={event => { setText(event.target.value); setTouched(true) }}
        onBlur={() => onDone(empty ? null : text)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            if (empty) setTouched(true)
            else onDone(text)
          }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onDone(null) }
        }}
      />
      {invalid && (
        <span className={styles.renameError} role="alert">
          <AlertTriangle size={12} strokeWidth={2} aria-hidden />
          Add a board name
        </span>
      )}
    </span>
  )
}
