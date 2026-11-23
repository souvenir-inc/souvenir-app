'use client'

import { useRef, useState } from 'react'
import { Calendar, CircleCheck, LayoutDashboard, LayoutTemplate, Plug, X } from 'lucide-react'
import { Tooltip } from '@/components/Tooltip'
import { Button, IconButton } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { SOURCE_NAMES, SourceLogo } from './icons'
import { COMPARISONS, METRICS } from './mock-data'
import { periodName } from './period'
import { Spinner } from './sync/Spinner'
import { connectApp, isConnected, useSyncSnapshot } from './sync/sync-store'
import type { AppId } from './sync/sync-model'
import type { Board } from './tabs/board-state'
import { TEMPLATES, callOutTitle, templateFor, toBoardCards } from './templates'
import { dims } from './grid-layout'

// The template library (Figma 170:41837; 08-new-board-rules.md NB-7 – NB-15). Left, what you can
// start from: templates by role, your boards, boards shared with you. Right, the selected one: its
// name, the dates it opens on and the outline of its cards, no figures. Cards whose app isn't
// connected are drawn faded and dashed, with a call-out to connect it (NB-10).

const FOCUS = 'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'
const YOUR_ROLE_TEMPLATE = 'founder'

/** "template:founder" or "board:<id>". */
export type LibraryPick = string

interface NewBoardLibraryProps {
  /** What's selected when it opens; null keeps it closed. */
  openOn: LibraryPick | null
  /** Your tabs and hidden boards, for Your boards and Shared with you (NB-14). */
  boards: Board[]
  onClose: () => void
  onUseTemplate: (templateId: string) => void
  onCopy: (boardId: string) => void
}

export function NewBoardLibrary({ openOn, ...rest }: NewBoardLibraryProps) {
  return (
    <Dialog open={openOn != null} onOpenChange={(o) => { if (!o) rest.onClose() }}>
      {openOn != null && <Library key={openOn} initial={openOn} {...rest} />}
    </Dialog>
  )
}

interface Row { key: LibraryPick; label: string; kind: 'template' | 'board' }

function Library({ initial, boards, onClose, onUseTemplate, onCopy }: Omit<NewBoardLibraryProps, 'openOn'> & { initial: LibraryPick }) {
  const sync = useSyncSnapshot()
  const connected = (app: AppId) => isConnected(sync, app)
  const [picked, setPicked] = useState(initial)
  const listRef = useRef<HTMLDivElement>(null)

  const own = boards.filter((b) => !b.sharedBy && !b.draft)
  const shared = boards.filter((b) => !!b.sharedBy)
  const groups: { heading: string; rows: Row[] }[] = [
    { heading: 'Your role', rows: TEMPLATES.filter((t) => t.id === YOUR_ROLE_TEMPLATE).map((t) => ({ key: `template:${t.id}`, label: t.role, kind: 'template' })) },
    { heading: 'Other roles', rows: TEMPLATES.filter((t) => t.id !== YOUR_ROLE_TEMPLATE).map((t) => ({ key: `template:${t.id}`, label: t.role, kind: 'template' })) },
    { heading: 'Your boards', rows: own.map((b) => ({ key: `board:${b.id}`, label: b.label, kind: 'board' })) },
    { heading: 'Shared with you', rows: shared.map((b) => ({ key: `board:${b.id}`, label: b.label, kind: 'board' })) },
  ]
  const rows = groups.flatMap((g) => g.rows)

  // What's selected, and what it would make.
  const cut = picked.indexOf(':')
  const kind = picked.slice(0, cut) as 'template' | 'board'
  const id = picked.slice(cut + 1)
  const template = kind === 'template' ? TEMPLATES.find((t) => t.id === id) : undefined
  const board = kind === 'board' ? boards.find((b) => b.id === id) : undefined
  const used = template ? templateFor(template.cards, connected) : null
  const laid = template && used
    ? toBoardCards(used.cards).map((c, i) => ({ ...c, needsApp: used.cards[i].needsApp }))
    : (board?.cards ?? []).map((c) => ({ ...c, needsApp: undefined as AppId | undefined }))
  const name = template?.name ?? board?.label ?? ''
  const period = template?.period ?? board?.period ?? '7d'
  const compare = template?.compare ?? board?.compare ?? 'previous'

  // The call-out keeps a row for every app the template asked for, also once connected, until the
  // dialog closes (NB-10). The dummy store marks such apps in `connections`.
  const appRows: { app: AppId; count: number }[] = []
  if (template) {
    for (const c of template.cards) {
      const m = METRICS[c.metricId]
      if (!m || m.unmeasured) continue
      for (const app of m.alsoFrom ? [m.source, m.alsoFrom] : [m.source]) {
        if (sync.connections[app] === undefined) continue
        const row = appRows.find((r) => r.app === app)
        if (row) row.count += 1
        else appRows.push({ app, count: 1 })
      }
    }
  }
  const needing = laid.filter((c) => c.needsApp).length
  const waitingApps = new Set(laid.map((c) => c.needsApp).filter(Boolean)).size
  const nothingShows = !!template && (laid.length === 0 || needing === laid.length)

  const go = () => {
    if (template) { if (!nothingShows) onUseTemplate(template.id) }
    else if (board) onCopy(board.id)
  }

  // ↑ ↓ move through the list; Enter uses the selected one (NB-7).
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (t.closest('[data-callout]')) return
      e.preventDefault()
      const i = rows.findIndex((r) => r.key === picked)
      const next = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      setPicked(next.key)
      listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(next.key)}"]`)?.focus()
    } else if (e.key === 'Enter' && !t.closest('button:not([data-row])')) {
      e.preventDefault()
      go()
    }
  }

  const periodLabel = periodName(period)
  const compareLabel = COMPARISONS.find((c) => c.id === compare)
  const action = template ? 'Use template' : 'Make a copy'
  const height = laid.reduce((h, c) => Math.max(h, c.y + dims(c.size).h), 0)

  return (
    <DialogContent
      hideClose
      aria-describedby={undefined}
      data-new-board-library
      style={{ width: 'min(1080px, calc(100vw - 32px))', maxWidth: 'none', height: 'min(760px, calc(100dvh - 64px))', borderRadius: 16, padding: 0, background: 'var(--dashboard-card-bg)', overflow: 'hidden' }}
      onOpenAutoFocus={(e) => { e.preventDefault(); listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(picked)}"]`)?.focus() }}
      onKeyDown={onKey}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative flex h-14 shrink-0 items-center border-b border-solid border-[var(--neutral-200)] px-5">
          <DialogTitle className="text-[16px] font-semibold leading-6 text-[var(--dashboard-figure)]">New board</DialogTitle>
          <DialogClose asChild>
            <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-3.5 size-7 rounded-[8px]" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
          </DialogClose>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left: what you can start from (NB-7). */}
          <div ref={listRef} role="listbox" aria-label="Start from" className="kaya-scrollbar flex w-[248px] shrink-0 flex-col gap-4 overflow-y-auto bg-[var(--dashboard-hover-band)] px-3 py-4">
            {groups.filter((g) => g.rows.length).map((g) => (
              <div key={g.heading} role="group" aria-label={g.heading} className="flex flex-col gap-0.5">
                <p className="m-0 px-2 pb-1 text-[11px] font-medium uppercase leading-4 tracking-[0.04em] text-[var(--dashboard-faint)]">{g.heading}</p>
                {g.rows.map((r) => {
                  const on = r.key === picked
                  return (
                    // eslint-disable-next-line no-restricted-syntax -- ds-allow: a library row (Figma 170:41851)
                    <button
                      key={r.key}
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-row={r.key}
                      tabIndex={on ? 0 : -1}
                      onClick={() => setPicked(r.key)}
                      onDoubleClick={go}
                      className={cn(
                        'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-solid px-2 text-left text-[13px] leading-5',
                        on ? 'border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)] font-medium text-[var(--dashboard-figure)]' : 'border-transparent bg-transparent text-[var(--neutral-700)] hover:bg-[var(--dashboard-card-bg)]',
                        FOCUS,
                      )}
                    >
                      {r.kind === 'template'
                        ? <LayoutTemplate aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-label)]" />
                        : <LayoutDashboard aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-[var(--dashboard-label)]" />}
                      <span className="min-w-0 truncate">{r.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Right: the selected one (NB-8). */}
          <div className="kaya-scrollbar flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-1">
              <h2 data-library-name className="m-0 text-[18px] font-semibold leading-7 text-[var(--dashboard-figure)]">{name}</h2>
              <p data-library-dates className="m-0 flex items-center gap-1.5 text-[13px] leading-5 text-[var(--dashboard-label)]">
                <Calendar aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />
                <span className="font-medium text-[var(--dashboard-figure)]">{periodLabel}</span>
                {compare !== 'none' && <span>• {compareLabel?.menuLabel ?? compareLabel?.label}</span>}
              </p>
            </div>

            {appRows.length > 0 && (
              <div data-library-callout className="flex flex-col gap-2 rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-panel-bg)] p-3">
                <p className="m-0 text-[13px] font-medium leading-5 text-[var(--dashboard-figure)]">
                  {needing ? callOutTitle(needing, laid.length, waitingApps) : 'Every card in this template can show now'}
                </p>
                {appRows.map(({ app, count }) => <AppRow key={app} app={app} count={count} />)}
              </div>
            )}

            {/* The outline: each card at its size, its name, its apps, a grey bar for the number. */}
            <ul
              data-library-outline
              aria-label="Cards on this board"
              className="m-0 grid list-none grid-cols-4 gap-3 p-0"
              style={{ gridTemplateRows: `repeat(${Math.max(height, 1)}, 84px)` }}
            >
              {laid.map((c) => {
                const m = METRICS[c.metricId]
                if (!m) return null
                const { w, h } = dims(c.size)
                const apps: AppId[] = m.alsoFrom ? [m.source, m.alsoFrom] : [m.source]
                return (
                  <li
                    key={c.metricId}
                    data-outline-card={c.metricId}
                    data-needs-app={c.needsApp}
                    className={cn(
                      'flex min-w-0 flex-col justify-between rounded-xl border border-solid p-3',
                      c.needsApp ? 'border-dashed border-[var(--dashboard-waiting-border)] bg-[var(--dashboard-panel-bg)] opacity-60' : 'border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)]',
                    )}
                    style={{ gridColumn: `${c.x + 1} / span ${w}`, gridRow: `${c.y + 1} / span ${h}` }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-5 text-[var(--dashboard-figure)]">{m.label}</span>
                      {apps.map((a) => <SourceLogo key={a} source={a} className="size-3.5 shrink-0" />)}
                    </span>
                    <span aria-hidden className="block h-3 w-16 rounded-full bg-[var(--dashboard-outline-bar)]" />
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-solid border-[var(--neutral-200)] px-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {nothingShows ? (
            <Tooltip content="Connect an app to use this template" side="top">
              {/* A disabled button gets no hover, so the tooltip sits on a wrapper. */}
              <span tabIndex={0} className={cn('rounded-lg', FOCUS)}><Button disabled className="pointer-events-none">{action}</Button></span>
            </Tooltip>
          ) : (
            <Button data-library-go onClick={go}>{action}</Button>
          )}
        </div>
      </div>
    </DialogContent>
  )
}

/** An app the template reads that isn't connected: Connect → Connecting… → Connected (NB-10). */
function AppRow({ app, count }: { app: AppId; count: number }) {
  const sync = useSyncSnapshot()
  const state = sync.connections[app] ?? 'connected'
  return (
    <div data-callout={app} data-connection={state} className="flex items-center gap-2.5">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-card-bg)]">
        <SourceLogo source={app} className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-[var(--dashboard-figure)]">
        {SOURCE_NAMES[app]} <span className="text-[var(--dashboard-label)]">· {count} card{count === 1 ? '' : 's'}</span>
      </span>
      {state === 'connecting' ? (
        <span role="status" className="flex shrink-0 items-center gap-1.5 text-[13px] leading-[18px] text-[var(--dashboard-label)]"><Spinner size={14} />Connecting…</span>
      ) : state === 'connected' ? (
        <span role="status" className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium leading-[18px] text-[var(--dashboard-positive)]"><CircleCheck aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />Connected</span>
      ) : (
        // eslint-disable-next-line no-restricted-syntax -- ds-allow: the call-out's outlined Connect (Figma 170:51126)
        <button
          type="button"
          onClick={() => connectApp(app)}
          className={cn('flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] py-1 pl-2.5 pr-3 text-[13px] font-medium leading-[18px] text-[var(--dashboard-figure)] shadow-[var(--dashboard-button-shadow)] hover:bg-[var(--neutral-100)]', FOCUS)}
        >
          <Plug aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth />{state === 'failed' ? 'Try again' : 'Connect'}
        </button>
      )}
    </div>
  )
}
