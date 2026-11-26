'use client'

import React, { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ArchiveRestore, Check, ChevronDown, CircleCheck, CircleMinus, Download, LayoutGrid, ListFilter, Plus, RotateCw, Search, Shapes, Sparkles, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConnectorGlyph } from '@/components/ConnectorGlyph'
import { useConnectorIdentities } from '@/components/ContextPanel/identity'
import { MetricModal } from '@/components/Scorecard'
import { Skeleton } from '@/components/Skeleton'
import { Tooltip } from '@/components/Tooltip'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/context/auth-context'
import { useOrgIdentity, useOrgMembers } from '@/context/org-context'
import { useGovernance } from '@/lib/metrics/governance'
import { useDeleteMetric } from '@/lib/warehouse/queries'
import { addCard, createCard, sizeForMetric, type Board } from '@/components/Canvas/board'
import { replaceBoard, tabBoards } from '@/components/Canvas/doc'
import { starterBoards } from '@/components/Canvas/metrics'
import { boardStore, withStarters, type BoardsDoc } from '@/components/Canvas/store'
import {
  countLine, FILTER_KINDS, FILTER_NAMES, filterTable, GROUP_NAMES, groupTable, hasPicks, initials, NO_TABLE_FILTER, optionsOf,
  STATUS_NAMES, tableRows, toCsv, type Creator, type FilterKind, type GroupBy, type MetricStatus, type TableFilter, type TableRow,
} from '@/lib/metrics/library-table'
import { CreateMetricDialog } from './CreateMetricDialog'
import { useLibrary } from './useLibrary'
import styles from './MetricTable.module.css'

const KIND_ICONS: Record<FilterKind, typeof CircleCheck> = { status: CircleCheck, creator: UserRound, area: Shapes, app: ListFilter }
/** Short fixed lists get no search; people and apps do (Dev, 24 Nov). */
const SEARCHABLE: ReadonlySet<FilterKind> = new Set(['creator', 'app'])

/**
 * Settings → Metrics: every metric's definition in one table: its status, who made it, the apps it reads and when it
 * last changed. Search, filter by status, created by, area and app, group the rows, pick some to download, and open
 * one to read its definition in the same window the dashboard uses.
 */
export function MetricDefinitionsScreen() {
  const library = useLibrary()
  const [filter, setFilter] = useState<TableFilter>(NO_TABLE_FILTER)
  const [groupBy, setGroupBy] = useState<GroupBy>('area')
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [filterKind, setFilterKind] = useState<FilterKind | null>(null)
  const [view, setView] = useState<'all' | 'review'>('all')
  const [asking, setAsking] = useState<Ask | null>(null)
  const [editing, setEditing] = useState<TableRow | null>(null)

  const workspace = library.workspace.data
  const { user } = useAuth()
  const { members } = useOrgMembers()
  const nameOf = useMemo(() => {
    const names = new Map(members.map(member => [member.id, member.name || member.email]))
    const me = user?.auth0Id ?? null
    const myName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.name || 'You' : 'You'
    return (id: string) => (id === me ? myName : names.get(id))
  }, [members, user])
  const { orgRole } = useOrgIdentity()
  const isAdmin = orgRole === 'admin'
  const governance = useGovernance(workspace?.id)
  const deleteMetric = useDeleteMetric()
  const rows = useMemo(() => tableRows(library.entries, workspace, nameOf, governance.log), [library.entries, workspace, nameOf, governance.log])
  // Retired metrics leave the list; they come back under Status: Retired.
  const shown = useMemo(() => filterTable(rows, filter).filter(row => row.status !== 'retired' || filter.status.includes('retired')), [rows, filter])
  const proposed = rows.filter(row => row.status === 'proposed')
  const me = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.name || 'You' : 'You'
  const groups = useMemo(() => groupTable(shown, groupBy), [shown, groupBy])
  const logos = useConnectorIdentities(useMemo(() => [...new Set(rows.flatMap(row => row.apps.map(app => app.slug)))], [rows]))
  const filtered = filter.query.trim() !== '' || hasPicks(filter)
  const loaded = library.catalog.data !== undefined

  const set = (patch: Partial<TableFilter>) => setFilter(previous => ({ ...previous, ...patch }))
  const toggleGroup = (id: string) => setClosed(previous => toggled(previous, id))
  const pick = (names: readonly string[], on: boolean) => setPicked(previous => {
    const next = new Set(previous)
    names.forEach(name => (on ? next.add(name) : next.delete(name)))
    return next
  })
  const shownNames = shown.map(row => row.name)
  const pickedRows = rows.filter(row => picked.has(row.name))

  const act = (names: readonly string[], action: 'confirmed' | 'retired' | 'restored') => {
    const before = governance.record(names, action, me)
    const what = names.length === 1 ? (rows.find(row => row.name === names[0])?.label ?? '1 metric') : `${names.length} metrics`
    const word = action === 'confirmed' ? 'confirmed' : action === 'retired' ? 'retired' : 'brought back'
    toast(`${what} ${word}`, { action: { label: 'Undo', onClick: () => governance.restore(before) } })
    setPicked(new Set())
  }
  const dismiss = (row: TableRow) => {
    deleteMetric.mutate(row.name, {
      onSuccess: () => toast(`${row.label} dismissed`),
      onError: () => toast.error(`${row.label} couldn’t be dismissed. Nothing changed.`),
    })
  }
  const addToBoard = async (board: Board, names: readonly string[]) => {
    if (!workspace || !library.catalog.data) return
    const saved = await boardStore.load(workspace.id)
    const doc: BoardsDoc = withStarters(saved, starterBoards(library.catalog.data, workspace, undefined))
    let target = doc.boards.find(b => b.id === board.id)
    if (!target) return
    const fresh = names.filter(name => !target!.cards.some(card => card.metric === name))
    for (const name of fresh) target = addCard(target, createCard(name, 'number', { size: sizeForMetric(library.byName.get(name)?.unit) }))
    const ok = await boardStore.saveFrom(workspace.id, replaceBoard(doc, target), 'metric-library')
    if (!ok) { toast.error(`Couldn’t add to ${board.name}. Nothing changed.`); return }
    const skipped = names.length - fresh.length
    toast(fresh.length === 0 ? `Already on ${board.name}` : `Added ${fresh.length === 1 ? (library.byName.get(fresh[0])?.label ?? '1 metric') : `${fresh.length} metrics`} to ${board.name}${skipped > 0 ? ` • ${skipped} already on it` : ''}`)
    setPicked(new Set())
  }

  return (
    <div className={`kaya-scrollbar ${styles.page}`}>
      <div className={styles.head}>
        <h1 className={styles.title}>Metrics</h1>
        <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          New metric
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Metrics">
        <button type="button" role="tab" className={styles.tab} aria-selected={view === 'all'} onClick={() => setView('all')}>All metrics</button>
        <button type="button" role="tab" className={styles.tab} aria-selected={view === 'review'} onClick={() => { setView('review'); setPicked(new Set()) }}>
          Review{proposed.length > 0 && <span className={styles.tabCount}>{proposed.length}</span>}
        </button>
      </div>

      {view === 'review' ? (
        <ReviewList
          rows={proposed}
          loaded={loaded}
          isAdmin={isAdmin}
          onOpen={name => setOpen(name)}
          onConfirm={row => act([row.name], 'confirmed')}
          onDismiss={row => setAsking({ kind: 'dismiss', rows: [row] })}
          onEdit={row => setEditing(row)}
        />
      ) : (<>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} strokeWidth={1.5} aria-hidden />
          <input
            className={styles.searchInput}
            type="search"
            value={filter.query}
            placeholder="Search metrics"
            aria-label="Search metrics"
            onChange={event => set({ query: event.target.value })}
            onKeyDown={event => { if (event.key === 'Escape') set({ query: '' }) }}
          />
          {filter.query !== '' && (
            <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => set({ query: '' })}>
              <X size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </label>

        <div className={styles.chips}>
          {FILTER_KINDS.filter(kind => filter[kind].length > 0).map(kind => (
            <FilterChip
              key={kind}
              kind={kind}
              picks={filter[kind]}
              labels={optionsOf(rows, filter, kind)}
              onOpen={() => setFilterKind(kind)}
              onClear={() => set({ [kind]: [] })}
            />
          ))}
        </div>

        <div className={styles.toolbarEnd}>
          {loaded && <span className={styles.count} aria-live="polite">{countLine(rows, shown.length, filtered)}</span>}
          <FilterPopover
            rows={rows}
            filter={filter}
            kind={filterKind}
            onKind={setFilterKind}
            onChange={setFilter}
          />
          <GroupByMenu value={groupBy} onChange={by => { setGroupBy(by); setClosed(new Set()) }} />
        </div>
      </div>

      {library.catalog.isError ? (
        <div className={styles.message}>
          <p className={styles.messageTitle}>Metrics failed to load</p>
          <p className={styles.messageHint}>Nothing changed</p>
          <button type="button" className={styles.ghost} onClick={() => { void library.catalog.refetch() }}>
            <RotateCw size={14} strokeWidth={1.75} aria-hidden />
            Try again
          </button>
        </div>
      ) : (
        <div className={styles.table} role="table" aria-label="Metrics" aria-busy={!loaded}>
          <div className={`${styles.grid} ${styles.headerRow}`} role="row">
            <span className={styles.cellBox} role="columnheader">
              <Box
                state={stateOf(shownNames, picked)}
                label="Pick every metric shown"
                disabled={!loaded || shownNames.length === 0}
                onChange={on => pick(shownNames, on)}
              />
            </span>
            <span className={styles.center} role="columnheader">Status</span>
            <span className={styles.name} role="columnheader">Metric</span>
            <span role="columnheader">Definition</span>
            <span className={styles.center} role="columnheader">Apps</span>
            <span className={styles.center} role="columnheader">Created by</span>
            <span className={styles.updated} role="columnheader">Last updated</span>
          </div>

          {!loaded ? (
            <div className={styles.skeleton} aria-label="Loading metrics">
              {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} height="36px" radius="8px" />)}
            </div>
          ) : groups.length === 0 ? (
            <div className={styles.message}>
              <p className={styles.messageTitle}>
                {filter.query.trim() ? <>No metric matches “{filter.query.trim()}”</> : 'No metric matches these filters'}
              </p>
              <p className={styles.messageHint}>Try another word or fewer filters</p>
              <button type="button" className={styles.ghost} onClick={() => setFilter(NO_TABLE_FILTER)}>Clear search & filters</button>
            </div>
          ) : (
            groups.map(group => {
              const names = group.rows.map(row => row.name)
              const isOpen = !closed.has(group.id)
              return (
                <div key={group.id} className={styles.group} role="rowgroup">
                  {groupBy !== 'none' && (
                    <div className={styles.band} role="row">
                      <Box state={stateOf(names, picked)} label={`Pick every metric in ${group.title}`} onChange={on => pick(names, on)} />
                      {group.creator && <span className={styles.bandAvatar}><CreatorMark creator={group.creator} /></span>}
                      <button type="button" className={styles.bandToggle} aria-expanded={isOpen} onClick={() => toggleGroup(group.id)}>
                        {group.title}
                        <ChevronDown size={12} strokeWidth={2} aria-hidden />
                        <span className={styles.bandCount}>{group.rows.length}</span>
                      </button>
                    </div>
                  )}
                  {isOpen && (
                    <div className={styles.rows}>
                      {group.rows.map(row => (
                        <MetricRow
                          key={`${group.id}:${row.name}`}
                          row={row}
                          picked={picked.has(row.name)}
                          logos={logos}
                          onPick={on => pick([row.name], on)}
                          onOpen={() => setOpen(row.name)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      </>)}

      {view === 'all' && pickedRows.length > 0 && (
        <div className={styles.bulk} role="toolbar" aria-label="Picked metrics">
          <span className={styles.bulkCount}>{pickedRows.length === rows.length ? `All ${rows.length} selected` : `${pickedRows.length} selected`}</span>
          <span className={styles.bulkDivider} aria-hidden />
          {pickedRows.some(row => row.status === 'proposed') && (
            <AdminOnly allowed={isAdmin} what="confirm">
              <button type="button" className={styles.bulkButton} disabled={!isAdmin} onClick={() => setAsking({ kind: 'confirm', rows: pickedRows.filter(row => row.status === 'proposed') })}>
                <CircleCheck size={14} strokeWidth={1.75} aria-hidden />
                Confirm
              </button>
            </AdminOnly>
          )}
          <BoardMenu workspaceReady={Boolean(workspace && library.catalog.data)} load={async () => {
            if (!workspace || !library.catalog.data) return []
            return tabBoards(withStarters(await boardStore.load(workspace.id), starterBoards(library.catalog.data, workspace, undefined)))
          }} onPick={board => { void addToBoard(board, pickedRows.map(row => row.name)) }} />
          <button type="button" className={styles.bulkButton} onClick={() => download(pickedRows)}>
            <Download size={14} strokeWidth={1.75} aria-hidden />
            Download
          </button>
          <span className={styles.bulkDivider} aria-hidden />
          {pickedRows.every(row => row.status === 'retired') ? (
            <AdminOnly allowed={isAdmin} what="bring metrics back">
              <button type="button" className={styles.bulkButton} disabled={!isAdmin} onClick={() => act(pickedRows.map(row => row.name), 'restored')}>
                <ArchiveRestore size={14} strokeWidth={1.75} aria-hidden />
                Bring back
              </button>
            </AdminOnly>
          ) : (
            <AdminOnly allowed={isAdmin} what="retire">
              <button type="button" className={`${styles.bulkButton} ${styles.bulkDanger}`} disabled={!isAdmin} onClick={() => setAsking({ kind: 'retire', rows: pickedRows.filter(row => row.status !== 'retired') })}>
                <CircleMinus size={14} strokeWidth={1.75} aria-hidden />
                Retire
              </button>
            </AdminOnly>
          )}
          <span className={styles.bulkDivider} aria-hidden />
          <button type="button" className={styles.bulkButton} aria-label="Clear the picks" onClick={() => setPicked(new Set())}>
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      )}

      {asking && (
        <AskDialog
          ask={asking}
          onClose={() => setAsking(null)}
          onYes={() => {
            if (asking.kind === 'confirm') act(asking.rows.map(row => row.name), 'confirmed')
            if (asking.kind === 'retire') act(asking.rows.map(row => row.name), 'retired')
            if (asking.kind === 'dismiss') dismiss(asking.rows[0])
            setAsking(null)
          }}
        />
      )}
      {editing && <CreateMetricDialog onClose={() => setEditing(null)} initialPrompt={`Change ${editing.label}: `} />}
      {creating && <CreateMetricDialog onClose={() => setCreating(false)} initialPrompt={filter.query.trim() || undefined} />}
      <MetricModal metric={open} onClose={() => setOpen(null)} initialTab="definition" />
    </div>
  )
}

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

type BoxState = 'off' | 'some' | 'all'

function stateOf(names: readonly string[], picked: ReadonlySet<string>): BoxState {
  const count = names.filter(name => picked.has(name)).length
  return count === 0 ? 'off' : count === names.length ? 'all' : 'some'
}

function Box({ state, label, onChange, disabled }: { state: BoxState; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      className={styles.box}
      aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
      aria-label={label}
      disabled={disabled}
      onClick={event => { event.stopPropagation(); onChange(state !== 'all') }}
    >
      {state === 'all' && <Check size={11} strokeWidth={3} aria-hidden />}
      {state === 'some' && <svg width="8" height="2" viewBox="0 0 8 2" aria-hidden><rect width="8" height="2" rx="1" fill="currentColor" /></svg>}
    </button>
  )
}

function MetricRow({ row, picked, logos, onPick, onOpen }: {
  row: TableRow
  picked: boolean
  logos: Map<string, { logo?: string | null; name: string }>
  onPick: (on: boolean) => void
  onOpen: () => void
}) {
  return (
    <div className={`${styles.grid} ${styles.row}`} role="row" data-selected={picked} onClick={onOpen}>
      <span className={styles.cellBox} role="cell">
        <Box state={picked ? 'all' : 'off'} label={`Pick ${row.label}`} onChange={onPick} />
      </span>
      <span className={styles.center} role="cell">
        <Tooltip content={STATUS_NAMES[row.status]} side="top" delayDuration={300}>
          <span style={{ display: 'flex' }}><StatusIcon status={row.status} /></span>
        </Tooltip>
      </span>
      <span className={styles.name} role="cell">
        <button type="button" className={styles.rowButton} onClick={event => { event.stopPropagation(); onOpen() }}>{row.label}</button>
      </span>
      <span className={styles.definition} role="cell">
        <span className={styles.muted} title={row.description}>{row.description || '—'}</span>
      </span>
      <span className={styles.center} role="cell">
        {row.apps.length === 0 ? <span className={styles.dash}>—</span> : (
          <>
            {row.apps.slice(0, 2).map(app => (
              <Tooltip key={app.slug} content={app.name} side="top" delayDuration={300}>
                <span style={{ display: 'flex' }}>
                  <ConnectorGlyph slug={app.slug} name={app.name} logoUrl={logos.get(app.slug)?.logo ?? null} size={16} />
                </span>
              </Tooltip>
            ))}
            {row.apps.length > 2 && (
              <Tooltip content={andList(row.apps.map(app => app.name))} side="top" delayDuration={150}>
                <span className={styles.more}>+{row.apps.length - 2}</span>
              </Tooltip>
            )}
          </>
        )}
      </span>
      <span className={styles.center} role="cell">
        <Tooltip content={row.creator.name} side="top" delayDuration={300}>
          <span style={{ display: 'flex' }}><CreatorMark creator={row.creator} /></span>
        </Tooltip>
      </span>
      <span className={styles.updated} role="cell">
        <span className={styles.muted}>{row.updated ?? '—'}</span>
      </span>
    </div>
  )
}

/** Souvenir's own logo for built-ins; a person's initials otherwise. */
function CreatorMark({ creator }: { creator: Creator }) {
  if (creator.kind === 'souvenir') {
    // eslint-disable-next-line @next/next/no-img-element -- static local mark
    return <img src="/icons/souvenir-logo.svg" width={20} height={20} alt="Souvenir" style={{ display: 'block' }} />
  }
  return <span className={styles.avatar} aria-label={creator.name}>{initials(creator.name)}</span>
}

/** Confirmed: green filled tick • Proposed: amber hourglass, no circle • Retired: grey filled minus (Figma 789:18383–18392). */
export function StatusIcon({ status, size = 16 }: { status: MetricStatus; size?: number }) {
  if (status === 'confirmed') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="8" fill="#15803D" />
        <path d="M4.6 8.3 6.9 10.5 11.4 5.9" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === 'proposed') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="#C2700A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3.5 1.75h9M3.5 14.25h9" />
        <path d="M4.6 1.75v1.85c0 2 2 3.2 3.4 4.4 1.4-1.2 3.4-2.4 3.4-4.4V1.75" />
        <path d="M4.6 14.25V12.4c0-2 2-3.2 3.4-4.4 1.4 1.2 3.4 2.4 3.4 4.4v1.85" />
        <path d="M5.9 4.1h4.2c-.3 1-1.1 1.7-2.1 2.5-1-.8-1.8-1.5-2.1-2.5Z" fill="#C2700A" stroke="none" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#8A817C" />
      <path d="M5 8h6" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

// ── Filters ───────────────────────────────────────────────────────────────────

function FilterChip({ kind, picks, labels, onOpen, onClear }: {
  kind: FilterKind
  picks: readonly string[]
  labels: { value: string; label: string }[]
  onOpen: () => void
  onClear: () => void
}) {
  const Icon = KIND_ICONS[kind]
  const names = picks.map(value => labels.find(option => option.value === value)?.label ?? value)
  return (
    <span className={styles.chip} role="group" aria-label={`${FILTER_NAMES[kind]}: ${names.join(', ')}`}>
      <button type="button" onClick={onOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, border: 'none', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
        <Icon size={14} strokeWidth={1.75} className={styles.chipIcon} aria-hidden />
        {FILTER_NAMES[kind]}
      </button>
      <Tooltip content={`${FILTER_NAMES[kind]} • ${names.join(', ')}`} side="bottom" delayDuration={150}>
        <span className={styles.badge}>{picks.length}</span>
      </Tooltip>
      <button type="button" className={styles.clear} aria-label={`Clear ${FILTER_NAMES[kind]}`} onClick={onClear}>
        <X size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </span>
  )
}

function FilterPopover({ rows, filter, kind, onKind, onChange }: {
  rows: readonly TableRow[]
  filter: TableFilter
  /** The kind a chip asked to open on; null keeps the popover closed. */
  kind: FilterKind | null
  onKind: (kind: FilterKind | null) => void
  onChange: (filter: TableFilter) => void
}) {
  const [active, setActive] = useState<FilterKind>('status')
  const [query, setQuery] = useState('')
  const open = kind !== null
  const current = kind ?? active
  const options = optionsOf(rows, filter, current)
  const q = query.trim().toLowerCase()
  const visible = SEARCHABLE.has(current) && q ? options.filter(option => option.label.toLowerCase().includes(q)) : options
  const picks: readonly string[] = filter[current]
  const total = FILTER_KINDS.reduce((sum, k) => sum + filter[k].length, 0)

  const choose = (next: FilterKind) => { setActive(next); setQuery(''); onKind(next) }
  const togglePick = (value: string) => {
    const list = picks.includes(value) ? picks.filter(item => item !== value) : [...picks, value]
    onChange({ ...filter, [current]: list })
  }

  return (
    <Popover.Root open={open} onOpenChange={next => { setQuery(''); onKind(next ? active : null) }}>
      <Popover.Trigger asChild>
        <button type="button" className={styles.iconButton} aria-label={total > 0 ? `Filters, ${total} picked` : 'Filters'}>
          <ListFilter size={16} strokeWidth={1.75} aria-hidden />
          {total > 0 && <span className={styles.badge}>{total}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.popover} align="end" sideOffset={8} collisionPadding={16}>
          <div className={styles.kinds} role="tablist" aria-orientation="vertical" aria-label="Filter by">
            {FILTER_KINDS.map(k => {
              const Icon = KIND_ICONS[k]
              return (
                <button key={k} type="button" role="tab" className={styles.kind} aria-selected={k === current} onClick={() => choose(k)}>
                  <Icon size={14} strokeWidth={1.75} aria-hidden />
                  {FILTER_NAMES[k]}
                  {filter[k].length > 0 && <span className={styles.badge}>{filter[k].length}</span>}
                </button>
              )
            })}
            <button type="button" className={styles.clearAll} disabled={total === 0} onClick={() => onChange({ ...filter, status: [], creator: [], area: [], app: [] })}>
              Clear all
            </button>
          </div>
          <div className={styles.options} role="tabpanel" aria-label={FILTER_NAMES[current]}>
            <div className={styles.optionsHead}>
              <span>{FILTER_NAMES[current]}</span>
              <button type="button" disabled={picks.length === 0} onClick={() => onChange({ ...filter, [current]: [] })}>Clear</button>
            </div>
            {SEARCHABLE.has(current) && (
              <label className={styles.optionSearch}>
                <Search size={14} strokeWidth={1.5} aria-hidden />
                <input
                  className={styles.searchInput}
                  value={query}
                  placeholder={current === 'app' ? 'Search apps' : 'Search people'}
                  aria-label={current === 'app' ? 'Search apps' : 'Search people'}
                  onChange={event => setQuery(event.target.value)}
                />
                {query !== '' && (
                  <button type="button" className={styles.clear} aria-label="Clear search" onClick={() => setQuery('')}>
                    <X size={12} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </label>
            )}
            <div className={`kaya-scrollbar ${styles.optionList}`} role="group">
              {visible.length === 0 ? (
                <p className={styles.optionEmpty}>{q ? `No ${current === 'app' ? 'app' : 'person'} matches “${query.trim()}”` : 'Nothing to pick'}</p>
              ) : visible.map(option => {
                const on = picks.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    className={styles.option}
                    disabled={option.count === 0 && !on}
                    onClick={() => togglePick(option.value)}
                  >
                    <span className={styles.box} aria-hidden style={{ pointerEvents: 'none' }} data-on={on}>
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    {current === 'status' && <StatusIcon status={option.value as MetricStatus} size={14} />}
                    {option.label}
                    <span className={styles.optionCount}>{option.count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function GroupByMenu({ value, onChange }: { value: GroupBy; onChange: (by: GroupBy) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.groupBy}>
          Group by <strong>{GROUP_NAMES[value]}</strong>
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={6}>
          <DropdownMenu.RadioGroup value={value} onValueChange={next => onChange(next as GroupBy)}>
            {(Object.keys(GROUP_NAMES) as GroupBy[]).map(by => (
              <DropdownMenu.RadioItem key={by} value={by} className={styles.menuItem} aria-checked={by === value}>
                {GROUP_NAMES[by]}
                {by === value && <Check size={14} strokeWidth={2} aria-hidden />}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function download(rows: readonly TableRow[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = rows.length === 1 ? `${rows[0].label}.csv` : `Metrics (${rows.length}).csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** "Shopify, Meta Ads & Google Ads" */
function andList(names: readonly string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

// ── Asking before a change ────────────────────────────────────────────────────

type Ask = { kind: 'confirm' | 'retire' | 'dismiss'; rows: TableRow[] }

const ASK_COPY: Record<Ask['kind'], (rows: TableRow[]) => { title: string; body: string; yes: string; danger?: boolean }> = {
  confirm: rows => ({
    title: rows.length === 1 ? `Confirm ${rows[0].label}?` : `Confirm ${rows.length} metrics?`,
    body: rows.length === 1 ? 'The definition moves from Proposed to Confirmed' : 'Their definitions move from Proposed to Confirmed',
    yes: 'Confirm',
  }),
  retire: rows => ({
    title: rows.length === 1 ? `Retire ${rows[0].label}?` : `Retire ${rows.length} metrics?`,
    body: 'Retired metrics leave the list and wait under Status: Retired • Bring one back from there',
    yes: 'Retire',
    danger: true,
  }),
  dismiss: rows => ({
    title: `Dismiss ${rows[0].label}?`,
    body: 'The proposal is deleted for everyone in the workspace • This can’t be undone',
    yes: 'Dismiss',
    danger: true,
  }),
}

function AskDialog({ ask, onClose, onYes }: { ask: Ask; onClose: () => void; onYes: () => void }) {
  const copy = ASK_COPY[ask.kind](ask.rows)
  return (
    <Dialog open onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {ask.rows.length > 1 && (
          <DialogBody>
            <ul className={styles.askList}>
              {ask.rows.slice(0, 6).map(row => <li key={row.name}><StatusIcon status={row.status} size={14} />{row.label}</li>)}
              {ask.rows.length > 6 && <li className={styles.askMore}>+{ask.rows.length - 6} more</li>}
            </ul>
          </DialogBody>
        )}
        <DialogFooter>
          <button type="button" className={styles.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={copy.danger ? styles.danger : styles.primary} onClick={onYes} autoFocus>{copy.yes}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Members see admin-only actions dimmed, with who can on hover. */
function AdminOnly({ allowed, what, children }: { allowed: boolean; what: string; children: React.ReactElement }) {
  if (allowed) return children
  return (
    <Tooltip content={`Only admins can ${what}`} side="top" delayDuration={150}>
      <span style={{ display: 'inline-flex' }}>{children}</span>
    </Tooltip>
  )
}

function BoardMenu({ workspaceReady, load, onPick }: { workspaceReady: boolean; load: () => Promise<Board[]>; onPick: (board: Board) => void }) {
  const [boards, setBoards] = useState<Board[] | null>(null)
  return (
    <DropdownMenu.Root onOpenChange={next => { if (next) void load().then(setBoards) }}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={styles.bulkButton} disabled={!workspaceReady}>
          <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
          Add to a board
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.menu} side="top" align="center" sideOffset={10}>
          <DropdownMenu.Label className={styles.menuLabel}>Your boards</DropdownMenu.Label>
          {boards === null ? (
            <div className={styles.menuEmpty}>Loading boards…</div>
          ) : boards.length === 0 ? (
            <div className={styles.menuEmpty}>No boards yet</div>
          ) : boards.map(board => (
            <DropdownMenu.Item key={board.id} className={styles.menuItem} onSelect={() => onPick(board)}>
              {board.name}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

// ── Review: what waits for a yes ──────────────────────────────────────────────

function ReviewList({ rows, loaded, isAdmin, onOpen, onConfirm, onDismiss, onEdit }: {
  rows: TableRow[]
  loaded: boolean
  isAdmin: boolean
  onOpen: (name: string) => void
  onConfirm: (row: TableRow) => void
  onDismiss: (row: TableRow) => void
  onEdit: (row: TableRow) => void
}) {
  const [open, setOpen] = useState(true)
  if (!loaded) {
    return (
      <div className={styles.skeleton} aria-label="Loading proposals">
        {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} height="56px" radius="8px" />)}
      </div>
    )
  }
  if (rows.length === 0) {
    return (
      <div className={styles.message}>
        <p className={styles.messageTitle}>Nothing waits for a yes</p>
        <p className={styles.messageHint}>New metrics & changes people propose show here until an admin confirms them</p>
      </div>
    )
  }
  const people = new Set(rows.map(row => row.creator.name))
  return (
    <>
      <p className={styles.reviewSummary}>
        {rows.length === 1 ? '1 change waits for a yes' : `${rows.length} changes wait for a yes`}  •  From {andList([...people])}
      </p>
      <section className={styles.reviewCard} aria-label="Waiting for a yes">
        <button type="button" className={styles.reviewHead} aria-expanded={open} onClick={() => setOpen(!open)}>
          Waiting for a yes
          <ChevronDown size={12} strokeWidth={2} aria-hidden />
          <span className={styles.bandCount}>{rows.length}</span>
        </button>
        {open && rows.map(row => (
          <div key={row.name} className={styles.reviewRow}>
            <div className={styles.reviewText}>
              <div className={styles.reviewTitle}>
                <span className={styles.reviewTag}>New</span>
                <button type="button" className={styles.rowButton} onClick={() => onOpen(row.name)}>{row.label}</button>
              </div>
              <p className={styles.reviewLine}>
                {row.creator.kind === 'souvenir' ? <Sparkles size={12} strokeWidth={1.75} aria-hidden /> : <UserRound size={12} strokeWidth={1.75} aria-hidden />}
                Proposed by {row.creator.name}{row.description ? ` • ${row.description}` : ''}
              </p>
            </div>
            {isAdmin ? (
              <div className={styles.reviewActions}>
                <button type="button" className={styles.primary} onClick={() => onConfirm(row)}>Confirm</button>
                <button type="button" className={styles.ghost} onClick={() => onDismiss(row)}>Dismiss</button>
                <Tooltip content="Edit in chat" side="top" delayDuration={300}>
                  <button type="button" className={styles.iconGhost} aria-label={`Edit ${row.label} in chat`} onClick={() => onEdit(row)}>
                    <Sparkles size={14} strokeWidth={1.75} aria-hidden />
                  </button>
                </Tooltip>
              </div>
            ) : (
              <span className={styles.reviewWaiting}>Waiting for an admin</span>
            )}
          </div>
        ))}
      </section>
    </>
  )
}
