'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { ChevronDown, SlidersHorizontal, Sparkles, TriangleAlert } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { canRename, layoutRow, MAX_NAME, type Board } from './board-state'
import { TabMenuContent, type BoardMenuHandlers } from './BoardMenus'
import type { RenameResult } from './use-dashboard'

// The board tab row (docs-v2/dashboard/01-tabs-rules.md §2 – §7, §10).
//   Layout     up to 6 tabs, fewer when there's less room; the rest behind "N more" (TAB-15 – TAB-18)
//   Keyboard   one tab stop, ← → move, Enter/Space open, ⌥← ⌥→ reorder (TAB-10 – TAB-13)
//   Mouse      click opens on release; double-click the open tab renames; right-click opens its menu
//   Drag       tabs stay put, the place dims, a copy follows, a blue line marks the drop (TAB-30 – TAB-35)

const SEGMENT = 'relative flex h-8 shrink-0 items-center rounded-full px-3.5 text-[14px] font-medium leading-5 tracking-[-0.07px] whitespace-nowrap'
const FOCUS_RING = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-0 focus-visible:outline-[var(--focus-ring)]'
const TAB_MAX = 220     // TAB-3
const DRAG_START = 4    // TAB-35
const LIST_DELAY = 500  // TAB-33
const PAD = 2           // capsule padding

type DropLine = { kind: 'row'; x: number } | { kind: 'list'; index: number }
interface DragView { id: string; label: string; x: number; y: number; to: number | null; line: DropLine | null }

interface TabRowProps extends BoardMenuHandlers {
  boards: Board[]
  openId: string
  renamingId: string | null
  onOpen: (id: string) => void
  onStartRename: (id: string) => void
  onEndRename: () => void
  onCommitRename: (id: string, raw: string) => RenameResult
  onMoveTo: (id: string, to: number) => void
  /** How many tabs are on show; Manage tabs draws its line after them (MT-3). */
  onLayout?: (visibleCount: number) => void
  panelId: string
}

export function TabRow(props: TabRowProps) {
  const { boards, openId, renamingId, onOpen, onStartRename, onEndRename, onCommitRename, onMoveTo, onLayout, panelId, ...menu } = props
  const pillId = useId()
  const reduceMotion = useReducedMotion()
  const order = boards.map((b) => b.id)
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]))

  // ── Measuring (TAB-3, TAB-16, TAB-40) ─────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(Infinity)
  const [natural, setNatural] = useState<Record<string, number>>({})
  const [countWidth, setCountWidth] = useState(90)
  // What's typed in the rename field, so the row can make room for it (TAB-22).
  const [renameDraft, setRenameDraft] = useState<{ id: string; text: string } | null>(null)
  const renameText = renamingId ? (renameDraft?.id === renamingId ? renameDraft.text : byId[renamingId]?.label ?? '') : ''
  const [renameWidth, setRenameWidth] = useState(0)
  const labelsKey = boards.map((b) => `${b.id}:${b.label}`).join('|')

  useLayoutEffect(() => {
    const el = measureRef.current?.firstElementChild as HTMLElement | null
    if (!el) return
    const read = () => {
      const next: Record<string, number> = {}
      el.querySelectorAll<HTMLElement>('[data-measure]').forEach((n) => { next[n.dataset.measure!] = Math.ceil(n.getBoundingClientRect().width) })
      setNatural((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
      const c = el.querySelector<HTMLElement>('[data-measure-count]')
      if (c) setCountWidth(Math.ceil(c.getBoundingClientRect().width))
      const r = el.querySelector<HTMLElement>('[data-measure-rename]')
      setRenameWidth(r ? Math.ceil(r.getBoundingClientRect().width) : 0)
    }
    read()
    // Fonts arrive after first paint; widths change with them.
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [labelsKey, renameText])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width - PAD * 2))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A tab being renamed is as wide as its field (the whole name, TAB-22) and stays on show with
  // the open board; the tabs after it fold into "N more" so the row never runs wider (TAB-4).
  const [focusId, setFocusId] = useState<string | null>(null)
  const widths = order.map((id) => (id === renamingId && renameWidth ? renameWidth : Math.min(natural[id] ?? 120, TAB_MAX)))
  // The focused tab also stays on show, so ⌥→ on the row's last tab keeps it (and its focus) in
  // the row instead of folding it into "N more" (TAB-13).
  const pinned = [openId, renamingId, focusId].filter((x): x is string => !!x && order.includes(x))
  const { visible, overflow } = layoutRow(order, pinned, widths, available, countWidth)
  const truncated = (id: string) => (natural[id] ?? 0) > TAB_MAX

  useEffect(() => { onLayout?.(visible.length) }, [visible.length, onLayout])

  // ── Keyboard: one tab stop, roving focus (TAB-10 – TAB-13) ────────────────
  const tabRefs = useRef(new Map<string, HTMLElement>())
  const countRef = useRef<HTMLButtonElement>(null)
  const stops = [...visible, ...(overflow.length ? ['__more'] : [])]
  const rovingId = focusId && stops.includes(focusId) ? focusId : openId
  const focusStop = (id: string) => (id === '__more' ? countRef.current : tabRefs.current.get(id))?.focus()

  const onStopKey = (e: React.KeyboardEvent, id: string) => {
    const i = stops.indexOf(id)
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && id !== '__more') {
      e.preventDefault()
      const from = order.indexOf(id)
      onMoveTo(id, from + (e.key === 'ArrowLeft' ? -1 : 1))
      return
    }
    const go = (j: number) => { e.preventDefault(); focusStop(stops[(j + stops.length) % stops.length]) }
    if (e.key === 'ArrowRight') go(i + 1)
    else if (e.key === 'ArrowLeft') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(stops.length - 1)
    else if (id !== '__more' && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); setMenuFor(id) }
  }

  // ── Menus ─────────────────────────────────────────────────────────────────
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  // ── Drag (TAB-30 – TAB-35) ────────────────────────────────────────────────
  const capsuleRef = useRef<HTMLDivElement>(null)
  const dragListRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragView | null>(null)
  const [dragListOpen, setDragListOpen] = useState(false)
  const suppressClick = useRef(false)
  const wasOpenAtPress = useRef(false)

  const dropTarget = (from: number, x: number, y: number, listOpen: boolean): Pick<DragView, 'to' | 'line'> => {
    const inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    let target: number
    let line: DropLine
    const list = dragListRef.current
    if (listOpen && list && inside(list.getBoundingClientRect()) && overflow.length) {
      const rows = [...list.querySelectorAll<HTMLElement>('[data-more-row]')]
      let r = rows.findIndex((row) => { const b = row.getBoundingClientRect(); return y < b.top + b.height / 2 })
      if (r < 0) r = rows.length
      target = r < overflow.length ? order.indexOf(overflow[r]) : order.indexOf(overflow[overflow.length - 1]) + 1
      line = { kind: 'list', index: r }
    } else {
      const cap = capsuleRef.current?.getBoundingClientRect()
      const rects = visible.map((id) => tabRefs.current.get(id)?.getBoundingClientRect())
      let g = rects.findIndex((b) => b && x < b.left + b.width / 2)
      if (g < 0) g = visible.length
      target = g < visible.length ? order.indexOf(visible[g]) : order.indexOf(visible[visible.length - 1]) + 1
      const edge = g < visible.length ? rects[g]!.left : rects[visible.length - 1]!.right
      line = { kind: 'row', x: edge - (cap?.left ?? 0) }
    }
    const to = target > from ? target - 1 : target
    return to === from ? { to: null, line: null } : { to, line } // no line when nothing would change (TAB-31)
  }

  const onTabPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || renamingId) return
    const start = { x: e.clientX, y: e.clientY }
    const from = order.indexOf(id)
    const label = byId[id]?.label ?? ''
    let active = false
    let listOpen = false
    let timer: number | undefined
    let latest: Pick<DragView, 'to' | 'line'> = { to: null, line: null }

    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_START) return
        active = true
        suppressClick.current = true
      }
      // Holding over "N more" for half a second opens the list (TAB-33).
      const count = countRef.current?.getBoundingClientRect()
      const overCount = !!count && ev.clientX >= count.left && ev.clientX <= count.right && ev.clientY >= count.top && ev.clientY <= count.bottom
      if (overCount && !listOpen && timer == null) {
        timer = window.setTimeout(() => { listOpen = true; timer = undefined; setDragListOpen(true) }, LIST_DELAY)
      } else if (!overCount && timer != null) {
        window.clearTimeout(timer); timer = undefined
      }
      latest = dropTarget(from, ev.clientX, ev.clientY, listOpen)
      setDrag({ id, label, x: ev.clientX, y: ev.clientY, ...latest })
    }
    const finish = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      if (timer != null) window.clearTimeout(timer)
      if (active && commit && latest.to != null) onMoveTo(id, latest.to)
      setDrag(null)
      setDragListOpen(false)
      // The click that follows a drag must not open the tab.
      window.setTimeout(() => { suppressClick.current = false }, 0)
    }
    const up = () => finish(true)
    const cancel = () => finish(false)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && active) { ev.preventDefault(); ev.stopPropagation(); finish(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} className="relative min-w-[min(100%,200px)] flex-1">
      {/* Off-screen copies of every name at natural width (TAB-3, TAB-40). Clipped to nothing, so
          the row of copies can never widen the page (no overflow-x). */}
      <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 size-0 overflow-hidden">
        <div className="flex w-max">
          {boards.map((b) => <span key={b.id} data-measure={b.id} className={SEGMENT}>{b.draft && <span className="mr-1.5 inline-block w-3.5" />}{b.label}</span>)}
          <span data-measure-count className={cn(SEGMENT, 'gap-1 pl-3.5 pr-3')}>{order.length} more<ChevronDown size={12} /></span>
          {/* The rename field: the typed name plus its border and caret room. */}
          {renamingId && <span data-measure-rename className={cn(SEGMENT, 'pr-4')}>{renameText || 'Board name'}</span>}
        </div>
      </div>

      <div
        ref={capsuleRef}
        role="tablist"
        aria-label="Boards"
        // Leaving the row forgets the roving stop, so Tab back in lands on the open board (TAB-10).
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusId(null) }}
        aria-orientation="horizontal"
        className="relative inline-flex max-w-full items-center rounded-full bg-[var(--dashboard-tabs-track)] p-0.5"
      >
        {visible.map((id) => {
          const b = byId[id]
          if (!b) return null
          const open = id === openId
          const renaming = id === renamingId
          const dragged = drag?.id === id
          return (
            <m.div
              key={id}
              layout={reduceMotion ? false : 'position'}
              transition={{ layout: { duration: 0.15, ease: [0.2, 0, 0, 1] } }}
              // Shrinkable, so a tight row cuts names short instead of running wider (TAB-4).
              className="relative min-w-0"
            >
              {renaming ? (
                <RenameField
                  initial={b.label}
                  onValueChange={(text) => setRenameDraft({ id, text })}
                  onCommit={(raw) => onCommitRename(id, raw)}
                  onDone={onEndRename}
                />
              ) : (
                <Tooltip content={b.label} side="bottom" disabled={!truncated(id) || !!drag}>
                  {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a tab segment (role=tab) in the dark-pill capsule; Button has no tab role or segment look */}
                  <button
                    ref={(el) => { if (el) tabRefs.current.set(id, el); else tabRefs.current.delete(id) }}
                    type="button"
                    role="tab"
                    id={`board-tab-${id}`}
                    aria-selected={open}
                    aria-controls={open ? panelId : undefined}
                    tabIndex={rovingId === id ? 0 : -1}
                    onFocus={() => setFocusId(id)}
                    // Only the press that starts a click counts (detail 1): the double-click's second press
                    // comes after the first click has opened the tab (TAB-20: double-click the open tab).
                    onMouseDown={(e) => { if (e.detail === 1) wasOpenAtPress.current = id === openId }}
                    onKeyDown={(e) => onStopKey(e, id)}
                    onPointerDown={(e) => onTabPointerDown(e, id)}
                    onClick={() => { if (!suppressClick.current) onOpen(id) }}
                    onDoubleClick={() => { if (open && wasOpenAtPress.current && canRename(b)) onStartRename(id) }}
                    onContextMenu={(e) => { e.preventDefault(); setMenuFor(id) }}
                    className={cn(
                      SEGMENT, FOCUS_RING, 'max-w-full cursor-pointer select-none border-0 bg-transparent transition-[background-color,color,opacity] duration-fast',
                      open
                        ? 'text-[var(--dashboard-tab-active-text)]'
                        : 'text-[var(--dashboard-label)] hover:bg-[var(--dashboard-tab-hover)] hover:text-[var(--dashboard-figure)] active:bg-[var(--dashboard-tab-pressed)]',
                      dragged && 'opacity-40',
                    )}
                  >
                    {open && (
                      <m.span
                        layoutId={pillId}
                        aria-hidden
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
                        className="absolute inset-0 rounded-full bg-gradient-to-b from-[var(--dashboard-tab-active-from)] to-[var(--dashboard-tab-active-to)]"
                      />
                    )}
                    {/* A draft not saved yet carries a sparkle (08 NB-21). */}
                    {b.draft && <Sparkles aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="relative mr-1.5 shrink-0" />}
                    <span className="relative block min-w-0 max-w-[192px] truncate">{b.label}</span>
                  </button>
                </Tooltip>
              )}
              {menuFor === id && (
                <div className="absolute bottom-0 left-0">
                  <Dropdown.Float autoFlipVertical
                    open
                    onOpenChange={(o) => { if (!o) setMenuFor(null) }}
                    placement="bottom-start"
                    trigger={<span className="block size-0" />}
                  >
                    <TabMenuContent
                      board={b} variant="tab" index={order.indexOf(id)} count={order.length}
                      close={() => setMenuFor(null)} {...menu}
                    />
                  </Dropdown.Float>
                </div>
              )}
            </m.div>
          )
        })}

        {overflow.length > 0 && (
          <MoreCount
            ref={countRef}
            boards={overflow.map((id) => byId[id]).filter(Boolean)}
            open={moreOpen}
            onOpenChange={setMoreOpen}
            tabIndex={rovingId === '__more' ? 0 : -1}
            onFocus={() => setFocusId('__more')}
            onKeyDown={(e) => onStopKey(e, '__more')}
            onPick={(id) => { setMoreOpen(false); onOpen(id) }}
            onManage={() => { setMoreOpen(false); menu.onManage('tabs') }}
            dragListRef={dragListRef}
            dragList={dragListOpen ? { line: drag?.line?.kind === 'list' ? drag.line.index : null } : null}
          />
        )}

        {/* Drop line: 2 px blue with a dot on top (TAB-31). */}
        {drag?.line?.kind === 'row' && (
          <span aria-hidden className="pointer-events-none absolute top-0 z-10" style={{ left: drag.line.x - 1 }}>
            <span className="absolute left-[-3px] top-0.5 size-2 rounded-full bg-[var(--dashboard-drop-line)]" />
            <span className="absolute left-0 top-1.5 h-[26px] w-0.5 rounded-[1px] bg-[var(--dashboard-drop-line)]" />
          </span>
        )}
      </div>

      {/* The copy that follows the pointer: white, soft shadow, not tilted (TAB-30). */}
      {drag && (
        <div
          aria-hidden
          className={cn(SEGMENT, 'pointer-events-none fixed z-[var(--z-popover)] bg-[var(--dashboard-tab-lifted)] text-[var(--dashboard-figure)] shadow-[var(--dashboard-tab-lifted-shadow)]')}
          style={{ left: drag.x + 8, top: drag.y + 10 }}
        >
          <span className="block max-w-[192px] truncate">{drag.label}</span>
        </div>
      )}
      {drag && <div aria-hidden className="fixed inset-0 z-[var(--z-overlay)] cursor-grabbing" />}

      <p className="sr-only" aria-live="polite">{drag ? (drag.to == null ? `Moving ${drag.label}` : `Moving ${drag.label} to place ${drag.to + 1}`) : ''}</p>
    </div>
  )
}

// ── "N more" (TAB-18, TAB-33) ─────────────────────────────────────────────────

interface MoreCountProps {
  ref: React.Ref<HTMLButtonElement>
  boards: Board[]
  open: boolean
  onOpenChange: (open: boolean) => void
  tabIndex: number
  onFocus: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onPick: (id: string) => void
  onManage: () => void
  /** While a tab is dragged over the count: a plain list with a drop line between rows. */
  dragList: { line: number | null } | null
  dragListRef: React.Ref<HTMLDivElement>
}

function MoreCount({ ref, boards, open, onOpenChange, tabIndex, onFocus, onKeyDown, onPick, onManage, dragList, dragListRef }: MoreCountProps) {
  const lifted = open || !!dragList
  const trigger = (
    // eslint-disable-next-line no-restricted-syntax -- ds-allow: the count is a segment of the tab capsule
    <button
      ref={ref}
      type="button"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      aria-label={`${boards.length} more boards`}
      className={cn(
        SEGMENT, FOCUS_RING, 'cursor-pointer gap-1 border border-solid pl-3.5 pr-3 transition-colors duration-fast',
        lifted
          ? 'border-[var(--border-default)] bg-[var(--dashboard-tab-lifted)] text-[var(--dashboard-figure)]'
          : 'border-transparent bg-transparent text-[var(--dashboard-label)] hover:bg-[var(--dashboard-tab-hover)] hover:text-[var(--dashboard-figure)]',
      )}
    >
      {boards.length} more
      <ChevronDown aria-hidden size={12} strokeWidth={1.75} absoluteStrokeWidth />
    </button>
  )

  if (dragList) {
    return (
      <div className="relative shrink-0">
        {trigger}
        <div ref={dragListRef} className="absolute left-0 top-[calc(100%+8px)] z-[var(--z-popover)]">
          <Dropdown size="md" maxHeight={false}>
            <Dropdown.Section fluid>
              {boards.map((b, i) => (
                <div key={b.id} data-more-row className="relative">
                  {dragList.line === i && <ListDropLine />}
                  <Dropdown.Item label={b.label} fluid />
                </div>
              ))}
              {dragList.line === boards.length && <div className="relative h-0"><ListDropLine /></div>}
            </Dropdown.Section>
          </Dropdown>
        </div>
      </div>
    )
  }

  return (
    <Dropdown.Float autoFlipVertical open={open} onOpenChange={onOpenChange} placement="bottom-start" trigger={trigger}>
      <Dropdown size="md">
        <Dropdown.Section fluid>
          {boards.map((b) => <Dropdown.Item key={b.id} label={b.label} onClick={() => onPick(b.id)} fluid />)}
        </Dropdown.Section>
        <Dropdown.Section divider fluid>
          <Dropdown.Item icon={<SlidersHorizontal />} label="Manage tabs" onClick={onManage} fluid />
        </Dropdown.Section>
      </Dropdown>
    </Dropdown.Float>
  )
}

function ListDropLine() {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-px left-1 right-1 z-10 h-0.5 rounded-[1px] bg-[var(--dashboard-drop-line)]">
      <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-[var(--dashboard-drop-line)]" />
    </span>
  )
}

// ── Rename field (TAB-20 – TAB-24) ────────────────────────────────────────────

interface RenameFieldProps {
  initial: string
  onCommit: (raw: string) => RenameResult
  onDone: () => void
  /** Each keystroke, so the row can make room for the whole name (TAB-22). */
  onValueChange?: (text: string) => void
}

export function RenameField({ initial, onCommit, onDone, onValueChange }: RenameFieldProps) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    el?.focus()
    el?.select() // the whole name selected, so typing replaces it (TAB-20)
  }, [])

  const finish = () => { if (!done.current) { done.current = true; onDone() } }
  const commit = (fromBlur: boolean) => {
    if (done.current) return
    const res = onCommit(value)
    if (res.ok) return finish()
    // Empty: Enter keeps the field open with the error; clicking away puts the old name back (TAB-24).
    if (fromBlur) finish()
    else setError(true)
  }

  return (
    <div className="relative">
      <div
        className={cn(
          SEGMENT, 'inline-grid max-w-full grid-cols-[minmax(0,max-content)] border border-solid bg-[var(--dashboard-tab-lifted)] px-[13px]',
          error ? 'border-[var(--dashboard-error)]' : 'border-[var(--border-default)]',
        )}
      >
        {/* The invisible copy sizes the field to the whole name (TAB-22). */}
        <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre pr-0.5">{value || 'Board name'}</span>
        {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the field is the tab segment itself and sizes to the name (TAB-22); Input has its own box */}
        <input
          ref={inputRef}
          value={value}
          // size=1 drops the input's default ~20-character width, so the copy above sizes the field.
          size={1}
          maxLength={MAX_NAME}
          placeholder="Board name"
          aria-label="Board name"
          aria-invalid={error || undefined}
          aria-describedby={error ? 'board-name-error' : undefined}
          onChange={(e) => { setValue(e.target.value); onValueChange?.(e.target.value); if (error && e.target.value.trim()) setError(false) }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') { e.preventDefault(); commit(false) }
            else if (e.key === 'Escape') { e.preventDefault(); finish() }
          }}
          onBlur={() => commit(true)}
          className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent p-0 text-[14px] font-medium leading-5 tracking-[-0.07px] text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
        />
      </div>
      {error && <NameError id="board-name-error" className="absolute left-0 top-[calc(100%+6px)] z-20" />}
    </div>
  )
}

/** "Add a board name" (TAB-24, MT-6). */
export function NameError({ id, className }: { id?: string; className?: string }) {
  return (
    <p
      id={id}
      role="alert"
      className={cn(
        'm-0 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-solid border-[var(--dashboard-error-border)] bg-[var(--dashboard-error-bg)] py-1 pl-2 pr-2.5',
        'text-[12px] font-medium leading-4 text-[var(--dashboard-error)] shadow-[var(--shadow-soft)]',
        className,
      )}
    >
      <TriangleAlert aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
      Add a board name
    </p>
  )
}
