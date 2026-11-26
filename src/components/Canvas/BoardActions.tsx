'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { LayoutGrid, Link, Loader2, MoreHorizontal, Pencil, Plus, Redo2, Share, Undo2, X, type LucideIcon } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import styles from './Canvas.module.css'

export interface BoardActionsProps {
  /** Edit mode: the bar (Undo, Redo, Add metrics, New board, Cancel, Save) instead of the +. */
  editing: boolean
  /** A board shared with you to view: the + holds New board, Copy link and More, nothing that changes the board. */
  viewOnly?: boolean
  onAddMetrics: () => void
  onNewBoard: () => void
  onEdit: () => void
  onShare: () => void
  onCopyLink: () => void
  /** The board menu, opened by More: `BoardMenu` rows. */
  menu: (close: () => void) => ReactNode
  /** Edit mode's arrows: the last change on this page, back or forward. */
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Leaves edit mode and puts the board back as it was before it (Esc does the same). */
  onCancel: () => void
  /** Leaves edit mode, keeping the changes. */
  onSave: () => void
  /** A save is on its way: Save shows a spinner and waits. */
  saving?: boolean
  /**
   * Someone else has this board in edit mode (one editor at a time, Dev 19 Nov): Edit board and Add metrics are greyed,
   * Edit board says who ("Sam is editing").
   */
  editingBy?: string | null
  /** Phones don't get edit mode (Dev, 19 Nov): no Edit board under 640 px. */
  canEdit?: boolean
}

/** ⌘ on a Mac, Ctrl elsewhere, for the shortcut in Undo's and Redo's tooltips. */
function shortcut(keys: 'undo' | 'redo'): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
  if (keys === 'undo') return mac ? '⌘Z' : 'Ctrl+Z'
  return mac ? '⇧⌘Z' : 'Ctrl+Y'
}

type State = 'closed' | 'dial' | 'menu'
type ActionKey = 'add' | 'new' | 'edit' | 'share' | 'copy' | 'more'

interface DialAction {
  key: ActionKey
  label: string
  Icon: LucideIcon
  /** The icon's line in lucide's units, as the frames draw it at 16: 2.25 (1.5 px), the grid lighter at 1.75. */
  stroke: number
}

const ADD: DialAction = { key: 'add', label: 'Add metrics', Icon: Plus, stroke: 2.25 }
const NEW: DialAction = { key: 'new', label: 'New board', Icon: LayoutGrid, stroke: 1.75 }
const EDIT: DialAction = { key: 'edit', label: 'Edit board', Icon: Pencil, stroke: 2.25 }
const SHARE: DialAction = { key: 'share', label: 'Share', Icon: Share, stroke: 2.25 }
const COPY: DialAction = { key: 'copy', label: 'Copy link', Icon: Link, stroke: 2 }
const MORE: DialAction = { key: 'more', label: 'More', Icon: MoreHorizontal, stroke: 2.25 }

/**
 * The actions the + holds, top to bottom. Yours: Add metrics, New board, Edit board, Share, More. A board shared with
 * you to view: New board, Copy link, More (Dev, 20 Nov: no Share for a viewer, Copy link up front).
 */
export function dialActions(viewOnly: boolean): readonly DialAction[] {
  return viewOnly ? [NEW, COPY, MORE] : [ADD, NEW, EDIT, SHARE, MORE]
}

/**
 * The board's actions (6D, D43), in the panel's bottom-right corner. At rest one dark + that names itself on hover;
 * a click turns it into × and lifts the actions above it, each named. Choosing one starts it and closes the rest;
 * ×, Esc, a click outside or scrolling the board close them too. More opens the board menu above the ×. The + never
 * opens by itself (Dev, 19 Nov).
 *
 * In edit mode the + gives way to a bar at the bottom centre: Undo, Redo, Add metrics, New board, Cancel, Save. Save
 * keeps the changes; Cancel (or Esc) puts the board back as it was (Dev, 20 Nov: Save applies, Cancel discards).
 */
export function BoardActions({
  editing, viewOnly = false, onAddMetrics, onNewBoard, onEdit, onShare, onCopyLink, menu,
  onUndo, onRedo, canUndo, canRedo, onCancel, onSave, saving = false, editingBy = null, canEdit = true,
}: BoardActionsProps) {
  const [state, setState] = useState<State>('closed')
  const rootRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const barRef = useRef<HTMLDivElement>(null)
  /** The bar's centre on screen: the middle of the panel the board sits in (not the window, which has a sidebar). */
  const [barCentre, setBarCentre] = useState<number | null>(null)
  /** When the menu last closed: a click on × that closes it shouldn't open the actions again. */
  const [menuClosedAt, setMenuClosedAt] = useState(0)
  /** Set when the actions open, so focus moves into them. */
  const focusFirst = useRef(false)
  const actions = dialActions(viewOnly).filter(action => canEdit || action.key !== 'edit')
  const closeMenu = useCallback(() => {
    setMenuClosedAt(Date.now())
    setState('closed')
  }, [])

  // A click anywhere else, or the board scrolling, closes the actions.
  useEffect(() => {
    if (state !== 'dial') return
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setState('closed')
    }
    const onScroll = () => setState('closed')
    document.addEventListener('pointerdown', onDown)
    // Capture, so a scroll inside the page's scrolling panel (not the window) is heard too.
    document.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('scroll', onScroll, true)
    }
  }, [state])

  useEffect(() => {
    if (state === 'dial' && focusFirst.current) {
      focusFirst.current = false
      itemRefs.current[0]?.focus()
    }
  }, [state])

  // The edit bar sits at the bottom centre of the panel; it follows the panel as sidebars open and close.
  useLayoutEffect(() => {
    if (!editing) return
    const host = barRef.current?.closest('main')
    if (!host) return
    const place = () => {
      const box = host.getBoundingClientRect()
      setBarCentre(box.left + box.width / 2)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(host)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [editing])

  // Esc in edit mode is Cancel, as in a dialog: not while typing (a tab's new name) or while a dialog or menu is open.
  useEffect(() => {
    if (!editing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onCancel])

  if (editing) {
    return (
      <div
        ref={barRef}
        className={styles.editBar}
        role="toolbar"
        aria-label="Edit board"
        data-board-actions="edit"
        style={barCentre === null ? undefined : { left: barCentre }}
      >
        <Tooltip content={`Undo (${shortcut('undo')})`} side="top">
          <button type="button" className={styles.editBarIcon} aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
        <Tooltip content={`Redo (${shortcut('redo')})`} side="top">
          <button type="button" className={styles.editBarIcon} aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </Tooltip>
        <span className={styles.editBarSeparator} aria-hidden />
        <button type="button" className={styles.editBarItem} onClick={onAddMetrics}>
          <Plus size={16} strokeWidth={2.25} aria-hidden />
          Add metrics
        </button>
        <button type="button" className={styles.editBarItem} onClick={onNewBoard}>
          <Plus size={16} strokeWidth={2.25} aria-hidden />
          New board
        </button>
        <span className={styles.editBarSeparator} aria-hidden />
        <button type="button" className={`${styles.editBarItem} ${styles.editBarCancel}`} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className={styles.editBarDone} onClick={onSave} disabled={saving} data-saving={saving || undefined}
          aria-busy={saving || undefined}>
          {saving && <Loader2 size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />}
          Save
        </button>
      </div>
    )
  }

  const close = (refocus: boolean) => {
    setState('closed')
    if (refocus) mainRef.current?.focus()
  }

  const run = (key: ActionKey) => {
    if (key === 'more') { setState('menu'); return }
    setState('closed')
    if (key === 'add') onAddMetrics()
    else if (key === 'new') onNewBoard()
    else if (key === 'edit') onEdit()
    else if (key === 'copy') onCopyLink()
    else onShare()
  }

  const main = (
    <button
      ref={mainRef}
      type="button"
      className={styles.dialMain}
      aria-label={state === 'closed' ? 'Board actions' : 'Close board actions'}
      aria-expanded={state !== 'closed'}
      aria-controls={state === 'dial' ? 'board-actions' : undefined}
      onClick={() => {
        if (Date.now() - menuClosedAt < 300) return
        if (state === 'closed') { focusFirst.current = true; setState('dial') } else close(false)
      }}
    >
      {state === 'closed'
        ? <Plus size={16} strokeWidth={2.25} aria-hidden />
        : <X size={14} strokeWidth={1.5} absoluteStrokeWidth aria-hidden />}
    </button>
  )

  return (
    <div
      ref={rootRef}
      className={styles.dial}
      data-state={state}
      data-board-actions="dial"
      onKeyDown={event => {
        if (event.key === 'Escape' && state === 'dial') { event.preventDefault(); close(true); return }
        if (state !== 'dial' || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        // ↑ ↓ move through the actions (drawn bottom-up from the +, listed top-down).
        const buttons = itemRefs.current.slice(0, actions.length).filter((b): b is HTMLButtonElement => b !== null)
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (at === -1) return
        event.preventDefault()
        buttons[(at + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
      }}
    >
      {state === 'dial' && (
        <ul className={styles.dialList} id="board-actions" aria-label="Board actions">
          {actions.map(({ key, label, Icon, stroke }, i) => {
            // While someone else edits this board, nothing here changes it (Figma "One editor · Edit board while Sam edits").
            const locked = editingBy !== null && (key === 'edit' || key === 'add')
            return (
            <li key={key} className={styles.dialRow} style={{ animationDelay: `${(actions.length - 1 - i) * 25}ms` }}>
              <button
                ref={el => { itemRefs.current[i] = el }}
                type="button"
                className={styles.dialItem}
                disabled={locked}
                data-locked={locked || undefined}
                onClick={() => run(key)}
              >
                <span className={styles.dialLabel}>{locked && key === 'edit' ? `${editingBy} is editing` : label}</span>
                <span className={styles.dialCircle}><Icon size={16} strokeWidth={stroke} aria-hidden /></span>
              </button>
            </li>
            )
          })}
        </ul>
      )}
      {/* At rest the + names itself on hover ("Board actions"); open, the labels say it all. */}
      <Tooltip content="Board actions" side="left" disabled={state !== 'closed'}>{main}</Tooltip>
      {/* The board menu opens above the ×, its right edge on the button's (D43). */}
      <span className={styles.dialMenuAnchor} aria-hidden={state !== 'menu'}>
        <Dropdown.Float
          open={state === 'menu'}
          onOpenChange={open => { if (!open) closeMenu() }}
          placement="top-end"
          offset={8}
          trigger={<span className={styles.dialMenuPoint} />}
        >
          {menu(closeMenu)}
        </Dropdown.Float>
      </span>
    </div>
  )
}
