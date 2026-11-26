'use client'

import { useEffect, useRef, useState } from 'react'
import { Ellipsis, Eye, EyeOff, GripVertical, Info, Plus, RotateCcw, TriangleAlert, Users, X } from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { Button, IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { canRename, cleanName, daysLeft, MAX_NAME, type Board, type DashboardState } from './board-state'
import { TabMenuContent, type BoardMenuHandlers } from './BoardMenus'

// Manage tabs (docs-v2/dashboard/03-manage-tabs-rules.md, Figma section 415:64464).
// A draft of your order, hidden boards and names: Save applies it; Cancel, Esc or × drop it
// (MT-7). Delete, Leave and Restore apply at once with a toast and Undo (MT-8); Duplicate and New
// board too. The draft follows the live state, so an Undo from a toast shows up here as well.

export type ManageTab = 'tabs' | 'hidden' | 'deleted'

interface Draft { tabs: string[]; hidden: string[]; labels: Record<string, string> }

interface ManageTabsDialogProps {
  open: boolean
  initialTab: ManageTab
  state: DashboardState
  /** Tabs that fit in the row; the list draws a line after them (MT-3). */
  visibleCount: number
  onClose: () => void
  onSave: (draft: Draft) => void
  onDuplicate: (id: string, name?: string) => string | undefined
  onCreate: () => string
  onRestore: (id: string) => void
  onCopyLink: (id: string) => void
  onRequestDelete: (id: string) => void
  onRequestLeave: (id: string) => void
}

const FOCUS = cn(
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-[var(--focus-ring)]',
  'data-[keyboard=true]:focus:outline-2 data-[keyboard=true]:focus:outline-solid data-[keyboard=true]:focus:outline-[var(--focus-ring)]',
)
/** The row tint runs 8 px past both edges (MT-3); the list leaves that room on each side. */
const ROW = cn(
  'group/row relative isolate flex h-8 items-center gap-2 rounded-md',
  'before:absolute before:inset-y-0 before:-inset-x-2 before:-z-10 before:rounded-lg before:content-[""] before:transition-colors before:duration-fast',
  'hover:before:bg-[var(--dashboard-row-hover)] data-[open=true]:before:bg-[var(--dashboard-row-hover)]',
  FOCUS,
)

/** Keeps the draft in step with boards added or removed outside it (Undo, delete, restore). */
function reconcile(d: Draft, s: DashboardState): Draft {
  const live = new Set([...s.tabs, ...s.hidden])
  const known = new Set([...d.tabs, ...d.hidden])
  return {
    tabs: [...d.tabs.filter((id) => live.has(id)), ...s.tabs.filter((id) => !known.has(id))],
    hidden: [...d.hidden.filter((id) => live.has(id)), ...s.hidden.filter((id) => !known.has(id))],
    labels: d.labels,
  }
}

export function ManageTabsDialog(props: ManageTabsDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={(o) => { if (!o) props.onClose() }}>
      {props.open && <ManageTabsBody {...props} />}
    </Dialog>
  )
}

function ManageTabsBody({
  initialTab, state, visibleCount, onClose, onSave, onDuplicate, onCreate, onRestore, onCopyLink, onRequestDelete, onRequestLeave,
}: ManageTabsDialogProps) {
  const [tab, setTab] = useState<ManageTab>(initialTab)
  const [rawDraft, setDraft] = useState<Draft>(() => ({ tabs: state.tabs, hidden: state.hidden, labels: {} }))
  const draft = reconcile(rawDraft, state)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const label = (id: string) => draft.labels[id] ?? state.boards[id]?.label ?? ''
  const update = (fn: (d: Draft) => Draft) => setDraft((prev) => fn(reconcile(prev, state)))
  const onlyOne = draft.tabs.length <= 1 // MT-13

  const hideRow = (id: string) => { if (!onlyOne) update((d) => ({ ...d, tabs: d.tabs.filter((x) => x !== id), hidden: [...d.hidden, id] })) }
  const showRow = (id: string) => update((d) => ({ ...d, hidden: d.hidden.filter((x) => x !== id), tabs: [...d.tabs, id] }))
  const moveRow = (id: string, to: number) => update((d) => {
    const next = d.tabs.filter((x) => x !== id)
    next.splice(to, 0, id)
    return { ...d, tabs: next }
  })
  const duplicateRow = (id: string) => {
    const copy = onDuplicate(id, label(id)) // the name as shown, even if not saved yet
    if (copy) update((d) => {
      const next = d.tabs.filter((x) => x !== copy)
      next.splice(next.indexOf(id) + 1, 0, copy)
      return { ...d, tabs: next }
    })
  }
  const newBoard = () => {
    const id = onCreate()
    update((d) => ({ ...d, tabs: [...d.tabs.filter((x) => x !== id), id] }))
    setRenaming(id)
  }

  const deleted = [...state.deleted].sort((a, b) => b.deletedAt - a.deletedAt) // newest first (MT-10)

  const handlers: BoardMenuHandlers = {
    onRename: (id) => setRenaming(id),
    onDuplicate: duplicateRow,
    onCopyLink,
    onMove: () => {},
    onManage: () => {},
    onHide: hideRow,
    onDelete: onRequestDelete,
    onLeave: onRequestLeave,
  }

  const tabs: [ManageTab, string, number][] = [['tabs', 'Your tabs', draft.tabs.length], ['hidden', 'Hidden', draft.hidden.length], ['deleted', 'Recently deleted', deleted.length]]
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  return (
    <DialogContent
      size="md"
      hideClose
      // Fixed 480 × 560, centred; under 624 px tall it keeps 32 px top and bottom (MT-1).
      style={{ width: 480, height: 560, maxHeight: 'calc(100dvh - 64px)', background: 'var(--neutral-50)', borderRadius: 'var(--radius-2xl)' }}
      aria-describedby={undefined}
      // Esc in a rename field cancels the rename, not the dialog (MT-6). The dialog hears Esc
      // first (on the document, capturing), so it stands aside while a name field has focus.
      onEscapeKeyDown={(e) => {
        if ((document.activeElement as HTMLElement | null)?.closest('[data-rename-field]')) e.preventDefault()
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-2 py-4">
        <div className="relative flex h-7 shrink-0 items-start pl-1.5 pr-10">
          <DialogTitle>Manage tabs</DialogTitle>
          {/* × where the Figma draws it: its icon on the line ⋯ and Save end on (MT-1, MT-3). */}
          <DialogClose asChild>
            <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute -right-0.5 top-0 size-7 rounded-md"
              icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
          </DialogClose>
        </div>

        {/* Inline, borderless tabs; a 2 px line marks the open one (MT-14). */}
        <div role="tablist" aria-label="Manage tabs" className="flex shrink-0 items-start gap-5 px-2">
          {tabs.map(([key, text, n], i) => (
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: borderless inline tab (Figma 423:65554); components/Tabs is the pill strip
            <button
              key={key}
              ref={(el) => { tabRefs.current[i] = el }}
              type="button"
              role="tab"
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
              onKeyDown={(e) => {
                // ← / → move between the tabs (MT-16).
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                e.preventDefault()
                const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                setTab(tabs[j][0])
                tabRefs.current[j]?.focus()
              }}
              className={cn('flex cursor-pointer flex-col gap-1.5 rounded-sm border-0 bg-transparent p-0', FOCUS)}
            >
              <span className="flex items-baseline gap-[var(--space-1-25)] whitespace-nowrap leading-[var(--line-height-compact)]">
                {/* The 2 px line is the width of the label, not the count (MT-14). */}
                <span className={cn("relative text-[length:var(--font-size-body-sm)] font-medium after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:rounded-hairline after:content-['']", tab === key ? 'text-[var(--dashboard-figure)] after:bg-[var(--dashboard-figure)]' : 'text-[var(--dashboard-muted)] hover:text-[var(--dashboard-figure)]')}>{text}</span>
                {n > 0 && <span className="text-[length:var(--font-size-small)] text-[var(--dashboard-faint)]">{n}</span>}
              </span>
              <span aria-hidden className="h-0.5" />
            </button>
          ))}
        </div>

        {/* The list: scrolls between the pinned tabs and footer, with fades (MT-1). The -mx-2 / px-2
            pair leaves room for the row tint 8 px past each edge. */}
        <FadingScroll className="-mx-2 min-h-0 flex-1">
          <div className="px-2">
            {tab === 'tabs' && (
              <RowList
                ids={draft.tabs}
                visibleCount={visibleCount}
                onMove={moveRow}
                labelOf={label}
                renderRow={(id, handle, rowProps) => {
                  const b = state.boards[id]
                  if (!b) return null
                  return (
                    <div {...rowProps} className={ROW} data-open={menuFor === id || undefined} aria-label={label(id)}>
                      <span className="flex h-full items-center pl-[var(--space-0-75)]">{handle}</span>
                      {renaming === id ? (
                        <InlineRename
                          initial={label(id)}
                          onDone={() => setRenaming(null)}
                          onCommit={(raw) => {
                            const name = cleanName(raw)
                            if (!name) return false
                            update((d) => ({ ...d, labels: { ...d.labels, [id]: name } }))
                            return true
                          }}
                        />
                      ) : (
                        <RowName board={b} label={label(id)} onDoubleClick={() => { if (canRename(b)) setRenaming(id) }} />
                      )}
                      <span className="flex shrink-0 items-center gap-0.5 pr-0.5">
                        <IconButton variant="ghost" size="xs" iconSize={16} className="rounded-md" aria-label={`Hide ${label(id)}`} title="Hide tab"
                          icon={<Eye strokeWidth={1.5} absoluteStrokeWidth />} disabled={onlyOne} onClick={() => hideRow(id)} />
                        <Dropdown.Float
                          autoFlipVertical
                          open={menuFor === id}
                          onOpenChange={(o) => setMenuFor(o ? id : null)}
                          placement="bottom-end"
                          trigger={<IconButton variant="ghost" size="xs" iconSize={16} className="rounded-md" aria-label={`${label(id)} options`} icon={<Ellipsis strokeWidth={1.5} absoluteStrokeWidth />} />}
                        >
                          <TabMenuContent board={{ ...b, label: label(id) }} variant="manage" index={draft.tabs.indexOf(id)} count={draft.tabs.length}
                            close={() => setMenuFor(null)} {...handlers} />
                        </Dropdown.Float>
                      </span>
                    </div>
                  )
                }}
              />
            )}

            {tab === 'hidden' && (
              <div className="flex flex-col gap-2.5">
                <Helper>Hidden boards don’t show in your tab row.</Helper>
                <div>
                  {draft.hidden.map((id) => {
                    const b = state.boards[id]
                    if (!b) return null
                    return (
                      <div key={id} tabIndex={0} className={cn(ROW, 'pl-2 pr-[var(--space-0-75)]')} aria-label={`${label(id)}, hidden`}>
                        <RowName board={b} label={label(id)} muted />
                        <IconButton variant="ghost" size="xs" iconSize={16} className="rounded-md" aria-label={`Show ${label(id)}`} title="Show tab"
                          icon={<EyeOff strokeWidth={1.5} absoluteStrokeWidth />} onClick={() => showRow(id)} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {tab === 'deleted' && (
              <div className="flex flex-col gap-2.5">
                <Helper>Boards you deleted stay here for 30 days.</Helper>
                <div>
                  {deleted.map((d) => {
                    const b = state.boards[d.id]
                    if (!b) return null
                    const left = daysLeft(d.deletedAt, now)
                    return (
                      <div key={d.id} tabIndex={0} className={cn(ROW, 'pl-2')} aria-label={`${b.label}, ${left} ${left === 1 ? 'day' : 'days'} left`}>
                        <span className="min-w-0 flex-1 truncate text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--neutral-700)]">{b.label}</span>
                        <span className="shrink-0 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-faint)]">{left} {left === 1 ? 'day' : 'days'} left</span>
                        {/* A borderless Restore whose label ends on the right edge (MT-10). */}
                        <Button
                          variant="ghost" size="xs"
                          leftIcon={<RotateCcw strokeWidth={1.5} absoluteStrokeWidth />}
                          onClick={() => onRestore(d.id)}
                          className="h-6 gap-1 rounded-md bg-transparent pl-1.5 pr-[var(--space-1-75)] text-[length:var(--font-size-small)] font-medium shadow-none [font-family:var(--font-body)] text-[var(--dashboard-figure)] [&_svg]:size-3"
                        >
                          Restore
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </FadingScroll>

        <div className={cn('flex shrink-0 items-center gap-2 px-2', tab === 'tabs' ? 'justify-between' : 'justify-end')}>
          {tab === 'tabs' && (
            <Button
              variant="outline" size="sm" leftIcon={<Plus strokeWidth={1.5} absoluteStrokeWidth />} onClick={newBoard}
              className="h-[30px] gap-1.5 rounded-lg border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] px-2.5 text-[length:var(--font-size-body-sm)] font-medium [font-family:var(--font-body)] text-[var(--dashboard-figure)] [&_svg]:size-4"
            >
              New board
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}
              className="h-[30px] rounded-lg bg-transparent px-3 text-[length:var(--font-size-body-sm)] font-medium shadow-none [font-family:var(--font-body)] text-[var(--neutral-700)]">Cancel</Button>
            <Button size="sm" onClick={() => { onSave(draft); onClose() }}
              className="h-[30px] rounded-lg px-3.5 text-[length:var(--font-size-body-sm)] font-medium [font-family:var(--font-body)]">Save</Button>
          </div>
        </div>
      </div>
    </DialogContent>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────────

/** An info icon and one line on what the tab holds (Hidden, Recently deleted). */
function Helper({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-1.5 pl-[var(--space-1-75)] pr-2 text-[length:var(--font-size-body-sm)] leading-[var(--line-height-compact)] text-[var(--dashboard-muted)]">
      <Info aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0" />
      {children}
    </p>
  )
}

function RowName({ board, label, muted, onDoubleClick }: { board: Board; label: string; muted?: boolean; onDoubleClick?: () => void }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2" onDoubleClick={onDoubleClick}>
      <span className={cn('min-w-0 truncate text-[length:var(--font-size-body)] font-medium leading-5', muted ? 'text-[var(--dashboard-faint)]' : 'text-[var(--neutral-700)]')}>{label}</span>
      {board.sharedBy && <SharedTag by={board.sharedBy.name} muted={muted} />}
    </span>
  )
}

/**
 * "Shared" (Tag / Shared, MT-12): 20 px pill, no border, a see-through fill (the text colour at
 * 7 %, 4 % muted) so it stays a step darker than a hovered row; people icon and text 12 px. Hover
 * names the owner. Long names cut off before it, so it always shows.
 */
export function SharedTag({ by, muted }: { by: string; muted?: boolean }) {
  return (
    <Tooltip content={`Shared by ${by}`} side="top">
      <span
        tabIndex={0}
        aria-label={`Shared by ${by}`}
        className={cn(
          'inline-flex h-5 shrink-0 items-center gap-1 rounded-full pl-1.5 pr-2 text-[length:var(--font-size-small)] font-medium leading-4',
          muted ? 'bg-[var(--dashboard-tag-bg-muted)] text-[var(--dashboard-faint)]' : 'bg-[var(--dashboard-tag-bg)] text-[var(--dashboard-label)]',
          FOCUS,
        )}
      >
        <Users aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />
        Shared
      </span>
    </Tooltip>
  )
}

/**
 * Rename in place (MT-6): white field, 1 px border, the name selected. Enter or clicking away keeps
 * it; Esc cancels. Empty: red border and "Add a board name" inside the field, at its right.
 */
function InlineRename({ initial, onCommit, onDone }: { initial: string; onCommit: (raw: string) => boolean; onDone: () => void }) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = () => { if (!done.current) { done.current = true; onDone() } }
  const commit = (fromBlur: boolean) => {
    if (done.current) return
    if (onCommit(value)) return finish()
    if (fromBlur) finish() // clicking away with nothing typed puts the old name back
    else setError(true)
  }
  return (
    <span
      data-rename-field
      className={cn(
        'flex h-[26px] min-w-0 flex-1 items-center gap-0.5 rounded-md border border-solid bg-[var(--dashboard-card-bg)] pl-[var(--space-1-75)] pr-2',
        error ? 'border-[var(--dashboard-error)]' : 'border-[var(--border-default)]',
      )}
    >
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: an in-row rename field (MT-6) with its error inside it */}
      <input
        ref={ref}
        value={value}
        maxLength={MAX_NAME}
        placeholder="Board name"
        aria-label="Board name"
        aria-invalid={error || undefined}
        aria-describedby={error ? 'manage-name-error' : undefined}
        onChange={(e) => { setValue(e.target.value); if (error && e.target.value.trim()) setError(false) }}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') { e.preventDefault(); commit(false) }
          else if (e.key === 'Escape') {
            // Esc cancels the rename only (the dialog stands aside: onEscapeKeyDown above).
            e.preventDefault()
            finish()
          }
        }}
        onBlur={() => commit(true)}
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)] outline-none placeholder:text-[var(--dashboard-faint)]"
      />
      {error && (
        <span id="manage-name-error" role="alert" className="flex shrink-0 items-center gap-1 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-error)]">
          <TriangleAlert aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
          Add a board name
        </span>
      )}
    </span>
  )
}

/** Scrolls between the pinned header and footer, with fades when there's more (MT-1). */
function FadingScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const read = () => {
    const el = ref.current
    if (!el) return
    setEdges({ top: el.scrollTop > 0, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1 })
  }
  useEffect(() => {
    read()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => ro.disconnect()
  }, [])
  return (
    <div className={cn('relative', className)}>
      {/* No reserved gutter: it would push ⋯ off the line it shares with × and Save (MT-3). */}
      <div ref={ref} onScroll={read} className="kaya-scrollbar size-full overflow-y-auto" style={{ scrollbarGutter: 'auto' }}>
        {children}
      </div>
      <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-[var(--neutral-50)] to-transparent transition-opacity', edges.top ? 'opacity-100' : 'opacity-0')} />
      <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-[var(--neutral-50)] to-transparent transition-opacity', edges.bottom ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}

// ── Your tabs: rows that drag by the handle (MT-4) ───────────────────────────

interface RowProps {
  tabIndex: number
  'data-row-focus': boolean
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

interface RowListProps {
  ids: string[]
  visibleCount: number
  onMove: (id: string, to: number) => void
  labelOf: (id: string) => string
  renderRow: (id: string, handle: React.ReactNode, rowProps: RowProps) => React.ReactNode
}

function RowList({ ids, visibleCount, onMove, labelOf, renderRow }: RowListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; line: number | null } | null>(null)

  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const from = ids.indexOf(id)
    let to: number | null = null
    const move = (ev: PointerEvent) => {
      const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])]
      let g = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2 })
      if (g < 0) g = rows.length
      const t = g > from ? g - 1 : g
      to = t === from ? null : t // no line when nothing would change
      setDrag({ id, x: ev.clientX, y: ev.clientY, line: to == null ? null : g })
    }
    const end = (commit: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
      if (commit && to != null) onMove(id, to)
      setDrag(null)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false) } }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
  }

  // ⌥↑ / ⌥↓ on a focused row (or its handle) move it one place. Moving a focused element in the
  // page drops its focus, so it's put back on the same row (or handle) after the move.
  const keyMove = (e: React.KeyboardEvent, id: string, part: 'row' | 'handle') => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    const i = ids.indexOf(id)
    const to = i + (e.key === 'ArrowUp' ? -1 : 1)
    if (to < 0 || to >= ids.length) return
    e.preventDefault()
    const list = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-row-list]')
    onMove(id, to)
    requestAnimationFrame(() => {
      const row = list?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)
      const target = part === 'handle' ? row?.querySelector<HTMLElement>('[data-handle]') : row?.querySelector<HTMLElement>('[data-row-focus]')
      if (!target) return
      // Focus set by script doesn't count as keyboard focus, so mark it to keep the ring (MT-3).
      target.dataset.keyboard = 'true'
      target.addEventListener('blur', () => { delete target.dataset.keyboard }, { once: true })
      target.focus()
    })
  }

  return (
    <div ref={listRef} data-row-list className="relative">
      {ids.map((id, i) => (
        <div key={id} data-row data-row-id={id} className={cn('relative', drag?.id === id && 'opacity-40')}>
          {drag?.line === i && <RowDropLine />}
          {/* A plain line after the last board that fits in the tab row (MT-3). */}
          {i === visibleCount && visibleCount < ids.length && (
            <div aria-hidden className="px-2 py-1"><div className="h-px bg-[var(--neutral-200)]" /></div>
          )}
          {renderRow(
            id,
            // eslint-disable-next-line no-restricted-syntax -- ds-allow: the 16px drag handle (MT-4); IconButton can't take pointer-drag handlers cleanly
            <button
              type="button"
              aria-label={`Move ${labelOf(id)}. Drag, or Alt + up or down arrow.`}
              data-handle
              onPointerDown={(e) => start(e, id)}
              onKeyDown={(e) => keyMove(e, id, 'handle')}
              className={cn('flex size-4 shrink-0 cursor-grab items-center justify-center rounded-sm border-0 bg-transparent p-0 text-[var(--neutral-400)] hover:text-[var(--neutral-700)] active:cursor-grabbing', FOCUS)}
            >
              <GripVertical aria-hidden size={16} strokeWidth={1.5} absoluteStrokeWidth />
            </button>,
            { tabIndex: 0, 'data-row-focus': true, onKeyDown: (e) => { if (e.target === e.currentTarget) keyMove(e, id, 'row') } },
          )}
        </div>
      ))}
      {drag?.line === ids.length && <div className="relative"><RowDropLine /></div>}
      {/* The chip that follows the pointer (MT-4): white, hairline border, soft shadow, handle + name. */}
      {drag && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[var(--z-tooltip)] flex h-8 items-center gap-2.5 rounded-md border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] pl-2 pr-3 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--neutral-700)] shadow-[var(--dashboard-tab-lifted-shadow)]"
          style={{ left: drag.x - 12, top: drag.y - 16 }}
        >
          <GripVertical size={16} strokeWidth={1.5} absoluteStrokeWidth className="text-[var(--neutral-400)]" />
          {labelOf(drag.id)}
        </div>
      )}
    </div>
  )
}

/** Where a dragged row will land: a 2 px blue line with a dot, 8 px in from each side (MT-4). */
function RowDropLine() {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-px left-2 right-2 z-10 h-0.5 rounded-hairline bg-[var(--dashboard-drop-line)]">
      <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-[var(--dashboard-drop-line)]" />
    </span>
  )
}
