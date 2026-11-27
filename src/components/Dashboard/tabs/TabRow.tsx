'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { ChevronDown, Sparkles } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { canRename, layoutRow, type Board } from './board-state'
import { TabMenuContent, type BoardMenuHandlers } from './BoardMenus'
import { MoreCount } from './MoreCount'
import { RenameField } from './RenameField'
import { FOCUS_RING, SEGMENT } from './tab-styles'
import { useTabDrag } from './use-tab-drag'
import type { RenameResult } from './use-dashboard'
import { DURATION, SPRING } from "@/styles/tokens/motion"

// The board tab row (fe-handbook/features/dashboard/source-docs/01-tabs-rules.md §2 – §7, §10).
//   Layout     up to 6 tabs, fewer when there's less room; the rest behind "N more" (TAB-15 – TAB-18)
//   Keyboard   one tab stop, ← → move, Enter/Space open, ⌥← ⌥→ reorder (TAB-10 – TAB-13)
//   Mouse      click opens on release; double-click the open tab renames; right-click opens its menu
//   Drag       tabs stay put, the place dims, a copy follows, a blue line marks the drop (TAB-30 – TAB-35)

const TAB_MAX = 220     // TAB-3
const PAD = 2           // capsule padding

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
  const wasOpenAtPress = useRef(false)
  const { drag, dragListOpen, capsuleRef, dragListRef, suppressClick, onTabPointerDown } = useTabDrag({
    order, visible, overflow, labelOf: (id) => byId[id]?.label ?? '', renaming: !!renamingId, onMoveTo, tabRefs, countRef,
  })

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
              transition={{ layout: { duration: DURATION.quick, ease: [0.2, 0, 0, 1] } }}
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
                  {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: a role="tab" segment of the custom tablist (manual activation, roving tabIndex, drag, double-click rename, TAB-10 – TAB-13); Button wraps its label in a padded span and adds a raised shadow and press scale, which break the shared sliding pill and the truncating name */}
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
                        transition={reduceMotion ? { duration: 0 } : { type: 'spring', ...SPRING.settle }}
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
            <span className="absolute left-0 top-1.5 h-[26px] w-0.5 rounded-hairline bg-[var(--dashboard-drop-line)]" />
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

// Kept reachable from here for anything that imported them with the row.
export { NameError, RenameField } from './RenameField'
