'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Archive, Check, Copy, Eye, EyeOff, Image as ImageIcon, Info, LayoutDashboard, Link,
  LogOut, Pencil, Plus, Redo2, RotateCcw, SlidersHorizontal, Trash2, Undo2,
} from 'lucide-react'
import { Button } from '@/components/Button'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useConnectorIdentities } from '@/components/ContextPanel/identity'
import { measure, type MeasureRequest, type Measurement } from '@/lib/api/warehouse'
import { formatChartValue, formatDayLong } from '@/components/charts/format'
import { MetricModal, useMetricHealth } from '@/components/Scorecard'
import { Skeleton } from '@/components/Skeleton'
import { Tooltip } from '@/components/Tooltip'
import { useOptionalAuthUser, userFullName } from '@/context/auth-context'
import { useSavedFormulas } from '@/lib/metrics/use-saved-formulas'
import { useSyncStatus } from '@/components/SyncStatus'
import { dataUntil, earliestDate } from '@/lib/warehouse/freshness'
import { comparisonButtonLabel } from '@/lib/warehouse/compare'
import { comparisonFor, periodLabel, usePeriod, type PeriodView } from '@/lib/warehouse/period'
import { useMeasurement, useMetricCatalog, useWorkspace } from '@/lib/warehouse/queries'
import {
  addCard, createCard, duplicateCard, removeCard, reorderCards, sizeForMetric, swapMetric, updateCard,
  type Board, type BoardCard,
} from './board'
import { planMeasurements } from './batching'
import { toast } from 'sonner'
import { AddCardDialog } from './AddCardDialog'
import { BoardActions } from './BoardActions'
import { BoardGrid, type EditHint } from './BoardGrid'
import { DiscardDialog, UnsavedDialog } from './EditDialogs'
import { useEditLock, type EditLock } from './editLock'
import { usePhoneWidth } from './editWidth'
import { BoardMenu, BoardMenuHeading, BoardMenuItem, BoardMenuSeparator, BoardSubmenu } from './BoardMenu'
import { BoardTabs } from './BoardTabs'
import { boardToast } from './boardToast'
import { CardSheet } from './CardSheet'
import { searchForView, viewFromSearch, type LinkedView } from './dates'
import { DiagnoseView } from './DiagnoseView'
import { InHeader } from './HeaderSlot'
import { cardCsv, downloadCsv, downloadImage, exportName } from './export'
import { SHOPIFY_SLUGS, sourceCategories, sourcesFor, STARTER_METRICS, valueFormatOf } from './metrics'
import { deleteText, leaveText, ManageTabsDialog, type ManageView } from './ManageTabsDialog'
import { AttentionProbe, AttentionRow, type AttentionChip } from './AttentionRow'
import { TEMPLATE_METRICS } from './templates'
import { useCardFlags } from './useCardFlags'
import { NARROW_TAB_LIMIT, NARROW_WIDTH, TAB_LIMIT } from './tabs'
import { BOARD_NAME_MAX, useBoards } from './useBoards'
import { addDays, eachDay, todayIn, windowFor, type DateRange } from './windows'
import styles from './Canvas.module.css'

export interface CanvasScreenProps {
  /** A metric name from `?focus=` ("Open in Boards" on a scorecard red): opens the diagnose view for it. */
  focus?: string
}

const NO_LINK: LinkedView = { boardId: null, view: null }

/** Cards added on this visit to one board: they keep a "New" badge until the board is next opened. */
interface NewCards {
  boardId: string | null
  ids: ReadonlySet<string>
}
const NO_NEW: NewCards = { boardId: null, ids: new Set() }

/**
 * Edit mode's starting point: the board as it was when editing began, so Cancel can put it back, or for a board made
 * by New board, the board to go back to when Cancel discards it.
 */
interface EditStart {
  boardId: string
  board: Board
  isNew: boolean
  backTo: string | null
}

/** What edit mode is asking before it goes on: Cancel with changes, or leaving edit mode another way with changes. */
type EditAsk = { kind: 'discard' } | { kind: 'leave'; then: () => void }

/** The failed-save toast's id: Try again and the automatic retry replace or close this one toast. */
const SAVE_TOAST = 'edit-save-failed'
/** Edit mode left open closes itself after this long without a change, saving, so the board isn't kept from others. */
const EDIT_IDLE_MS = 30 * 60_000

/** Who holds a board's edit lock, as a sentence starts: their name, or "You" for your own other tab. */
function holderName(holder: EditLock, you: string): string {
  return holder.by === you ? 'You' : holder.by
}

/** The metrics measured once to learn what the store can measure: every starter's and every template's. */
const PROBE_METRICS = [...new Set([...STARTER_METRICS, ...TEMPLATE_METRICS])]

/**
 * Boards: your own boards of metric cards. The dates are a filter in the header (`PeriodFilter`): every board opens on
 * your default period, compared with the period before, and nothing is saved to a board. Cards are arranged in edit
 * mode.
 */
export function CanvasScreen({ focus }: CanvasScreenProps) {
  const { period, custom, comparison, compareCustom, setView, reset } = usePeriod()
  const you = userFullName(useOptionalAuthUser())
  // A link opens a board on the period and comparison its sender was looking at (`?board=…&period=…&compare=…`).
  const [linked] = useState<LinkedView>(() => (typeof window === 'undefined' ? NO_LINK : viewFromSearch(window.location.search)))
  const [now] = useState(() => new Date().toISOString())
  const workspace = useWorkspace()
  const catalog = useMetricCatalog(workspace.data !== undefined)
  // Which starter and template metrics can this store measure? One totals request over the last 30 days answers it (a
  // metric no connection fills comes back in `unavailable`, the same thing a card shows as "No data").
  const known = new Set((catalog.data ?? []).map(m => m.name))
  const probeToday = workspace.data ? todayIn(workspace.data.timezone) : ''
  const probeRequest: MeasureRequest = {
    metrics: PROBE_METRICS.filter(name => known.has(name)),
    start: probeToday ? addDays(probeToday, -29) : '', end: probeToday, grain: 'total',
  }
  const probe = useMeasurement(probeRequest, probeToday !== '' && probeRequest.metrics.length > 0)
  // A focused visit opens the diagnose view; the saved boards aren't touched by it.
  const boards = useBoards(workspace.data, catalog.data, {
    unavailable: probe.data?.unavailable,
    settled: probe.isSuccess || probe.isError || (catalog.data !== undefined && probeRequest.metrics.length === 0),
  }, { initialBoardId: linked.boardId, by: you })
  // For the source marks on each card: custom metrics' formulas (to find their roots) and connector logos.
  const formulas = useSavedFormulas(workspace.data?.id)
  const identities = useConnectorIdentities((workspace.data?.connectors ?? []).filter(slug => !SHOPIFY_SLUGS.has(slug)))
  const [adding, setAdding] = useState(false)
  /** The board whose Delete or Leave confirm is open. */
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  /** Manage tabs, open on one of its views. */
  const [managing, setManaging] = useState<ManageView | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [freshId, setFreshId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // Edit mode lives in useBoards (its changes are held there until Save); this keeps how it started.
  const editing = boards.editing
  const [editStart, setEditStart] = useState<EditStart | null>(null)
  const [newCards, setNewCards] = useState<NewCards>(NO_NEW)
  /** The card whose settings are open (a click on it in edit mode). */
  const [sheetId, setSheetId] = useState<string | null>(null)
  /** The metric open up close (the Scorecard chat's MetricModal), from a click on a card. */
  const [openMetric, setOpenMetric] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // ── Dates are a filter (D105) ──
  // Every board opens on your default from Settings → Account, compared with the period before: opening a board drops
  // the dates picked on the last one. A link opens on its sender's view the first time, when it names this board or none.
  const board = boards.board
  // A board opened again drops the "New" badges from the last time; leaving a board while editing keeps its changes.
  if (board && newCards.boardId !== null && newCards.boardId !== board.id) setNewCards(NO_NEW)
  // Edit mode ends with its board: switching boards drops it (after asking, when there are changes).
  if (editStart && (!editing || (board && editStart.boardId !== board.id))) setEditStart(null)
  const [opening, setOpening] = useState<{ id: string; view: PeriodView | null } | null>(null)
  if (board && !focus && opening?.id !== board.id) {
    const fromLink = opening === null && linked.view !== null && (linked.boardId === null || linked.boardId === board.id)
    setOpening({ id: board.id, view: fromLink ? linked.view : null })
  }
  // Before paint, so the header never shows the last board's dates over this one.
  useLayoutEffect(() => {
    if (!opening) return
    if (opening.view) setView(opening.view)
    else reset()
  }, [opening, setView, reset])

  // The scorecard's targets and health, for the pill on each card.
  const health = useMetricHealth()

  // The scorecard's flags (target, else industry benchmark) for cards and the "Needs attention" row, and the row's own
  // totals, one per range, as they answer.
  const flagKit = useCardFlags()
  const [attention, setAttention] = useState<Record<string, Measurement | undefined>>({})
  const onProbe = useCallback((key: string, measurement: Measurement | undefined) => {
    setAttention(prev => (prev[key] === measurement ? prev : { ...prev, [key]: measurement }))
  }, [])

  // A sync banner closed on one board stays closed on that board only (D74): the banners are scoped to the open board.
  const setSyncScope = useSyncStatus()?.setScope
  const boardId = board?.id ?? null
  useEffect(() => { setSyncScope?.(boardId) }, [setSyncScope, boardId])

  // Saving is silent; only a failure is worth a word (storage full or blocked), once per failure.
  const saveFailed = boards.saveState === 'failed'
  useEffect(() => {
    if (saveFailed) boardToast({ icon: AlertTriangle, tone: 'error', message: 'Your board changes couldn’t be saved. They’ll be lost when you leave this page.' })
  }, [saveFailed])

  // ⌘Z / Ctrl+Z undoes the last change on this page; ⇧⌘Z / Ctrl+Y redoes it. Not while typing or in a dialog. Outside
  // edit mode a toast names what was undone ("Undid Duplicate") with Redo (Dev, 19 Nov: Undo is toasts and ⌘Z); in
  // edit mode the bar's arrows show it.
  const { undo, redo } = boards
  useEffect(() => {
    const undoNow = () => {
      const label = undo()
      if (label && !editing) boardToast({ icon: Undo2, message: `Undid ${label}`, action: { label: 'Redo', onClick: redoNow } })
    }
    const redoNow = () => {
      const label = redo()
      if (label && !editing) boardToast({ icon: Redo2, message: `Redid ${label}`, action: { label: 'Undo', onClick: undoNow } })
    }
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [contenteditable="true"]') || target.closest('[role="dialog"]'))) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undoNow() }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redoNow() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, editing])

  // ── Edit mode's session (Figma "Board · Edit mode"): changes are held until Save; Cancel throws them away (asking
  // first when there are any); one editor at a time; a failed save stays on screen until a save works, and retries
  // when the connection returns; edit mode left open closes itself after 30 minutes without a change. ──
  const editLock = useEditLock(workspace.data?.id, board?.id ?? null, you || 'Someone')
  const phone = usePhoneWidth()
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  /** A save failed in this edit: the next one that works says "Changes saved". */
  const [saveFailedEdit, setSaveFailedEdit] = useState(false)
  const failedRef = useRef(false)
  const [asking, setAsking] = useState<EditAsk | null>(null)
  const [hint, setHint] = useState<EditHint>(null)
  if (!editing && (hint || asking || saveFailedEdit)) {
    setHint(null)
    setAsking(null)
    setSaveFailedEdit(false)
  }

  const markFailed = (failed: boolean) => {
    failedRef.current = failed
    setSaveFailedEdit(failed)
  }

  /** Save: keeps the changes and leaves edit mode, then `then`. A failure keeps edit mode open and says so. */
  const saveEditing = async (then?: () => void): Promise<boolean> => {
    if (savingRef.current) return false
    savingRef.current = true
    setSaving(true)
    toast.dismiss(SAVE_TOAST)
    const ok = await boards.saveEdit()
    savingRef.current = false
    setSaving(false)
    if (!ok) {
      markFailed(true)
      boardToast({
        id: SAVE_TOAST, icon: AlertTriangle, tone: 'error', persistent: true,
        message: 'Changes not saved. Your edits are still here.',
        action: { label: 'Try again', onClick: () => { void saveEditing(then) } },
      })
      return false
    }
    // Saving is silent; only a save that worked after one failed says so (Figma "Save failed · saved").
    if (failedRef.current) boardToast({ icon: Check, message: 'Changes saved' })
    markFailed(false)
    editLock.release()
    then?.()
    return true
  }

  /** Leaves edit mode, throwing its changes away. */
  const discardEditing = () => {
    toast.dismiss(SAVE_TOAST)
    markFailed(false)
    boards.discardEdit()
    editLock.release()
  }

  /** Something that leaves edit mode (another board, New board): asks first when there are changes. */
  const leaveEditing = (then: () => void) => {
    if (!editing) return then()
    if (boards.dirty) { setAsking({ kind: 'leave', then }); return }
    discardEditing()
    then()
  }

  // What the timers and the browser call reach: this render's functions.
  const session = useRef({ saveEditing, dirty: boards.dirty, editing })
  useLayoutEffect(() => { session.current = { saveEditing, dirty: boards.dirty, editing } })

  // A failed save is tried again when the connection comes back.
  useEffect(() => {
    if (!editing || !saveFailedEdit) return
    const retry = () => { void session.current.saveEditing() }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [editing, saveFailedEdit])

  // 30 minutes without a change: saved and closed, so the board isn't kept from anyone else (Dev, 19 Nov).
  const editedCards = editing ? board?.cards : undefined
  useEffect(() => {
    if (!editing) return
    const timer = window.setTimeout(() => {
      const changed = session.current.dirty
      void session.current.saveEditing(() => {
        boardToast({
          icon: Info,
          message: changed ? 'Edit mode closed after 30 min. Your changes are saved.' : 'Edit mode closed after 30 min.',
        })
      })
    }, EDIT_IDLE_MS)
    return () => window.clearTimeout(timer)
  }, [editing, editedCards])

  // Closing the tab with changes not saved: the browser's own warning.
  useEffect(() => {
    if (!boards.dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [boards.dirty])

  // Leaving edit mode any way at all (a board deleted from its tab, say) lets go of the board.
  const releaseLock = editLock.release
  useEffect(() => { if (!editing) releaseLock() }, [editing, releaseLock])

  if (catalog.isError && !catalog.data) {
    return (
      <div className={styles.screen}>
        <div className={styles.empty}>
          <p>Couldn&apos;t load this board.</p>
          <Button variant="secondary" onClick={() => { void catalog.refetch() }}>Try again</Button>
        </div>
      </div>
    )
  }
  // The plan needs each metric's source to cut at its last data day, so it waits for the catalog.
  if (!workspace.data || !board || !catalog.data) return <BoardSkeleton />

  const ws = workspace.data
  const today = todayIn(ws.timezone)
  const entries = new Map(catalog.data.map(m => [m.name, m]))
  // A custom metric's sources aren't in the catalog, so it's cut at the earliest of every source.
  const everySource = earliestDate(ws.categories.map(c => dataUntil(ws, c.category)))
  // Where a metric's numbers come from: its own synced area, or for a blended or custom metric (MER = revenue ÷ ad
  // spend), the areas its formula reads. Its data ends where the earliest of those ends, so MER is cut with the store
  // and the ads cards instead of running past them.
  const synced = new Set(ws.categories.map(c => c.category))
  const categoriesOf = (metric: string): string[] => sourceCategories(metric, entries, synced, name => formulas[name]?.value)
  const untilOf = (metric: string) => {
    const entry = entries.get(metric)
    if (!entry) return null
    const areas = categoriesOf(metric)
    if (areas.length > 0) return earliestDate(areas.map(category => dataUntil(ws, category)))
    // Nothing to go on (a custom metric with no formula here): cut with every source, the safe side.
    return synced.has(entry.category) ? null : everySource
  }
  const sourcesOf = (metric: string) => sourcesFor(categoriesOf(metric), ws.connectors)
    .map(source => ({ ...source, logo: identities.get(source.slug)?.logo ?? null }))
  const healthKit = { healthFor: health.healthFor, targetOf: health.targetOf, untilOf, flags: flagKit }
  // A source that has never synced (no last sync, not ready) has no data yet: whatever its metrics return, often 0,
  // is missing data, not a real number, so their cards say so on every board.
  const neverSynced = new Set(ws.categories.filter(c => c.lastSyncedAt === null && c.status !== 'ready').map(c => c.category))
  const waitingOf = (metric: string) => {
    const entry = entries.get(metric)
    return entry !== undefined && entry.category !== 'custom' && neverSynced.has(entry.category)
  }

  if (focus) {
    return (
      <>
        <DiagnoseView focus={focus} workspace={ws} catalog={entries} today={today} untilOf={untilOf} period={period} custom={custom}
          onOpen={setOpenMetric} sourcesOf={sourcesOf} healthKit={healthKit} waitingOf={waitingOf} />
        <MetricModal metric={openMetric} onClose={() => setOpenMetric(null)} />
      </>
    )
  }

  // What's on screen: the header's period and comparison.
  const view: PeriodView = { period, custom, comparison, compareCustom }
  const plan = planMeasurements(board.cards, today, untilOf, period, custom, comparison, compareCustom)
  const viewRange: DateRange = windowFor(period, comparison, today, null, custom, compareCustom).current
  const compared = comparisonFor(period, comparison) === 'none' ? null : comparisonButtonLabel(view, today)
  const viewText = `${periodLabel(period, custom)}${compared ? ` vs ${compared.charAt(0).toLowerCase()}${compared.slice(1)}` : ''}`

  // "Needs attention": every metric on every board (not only the one on screen), judged on the value its card shows:
  // the period on screen, cut where its source's data ends. Each range is one totals request; nothing for a metric
  // that can't be measured, has no data yet, or has no value.
  const attentionCards = [...new Set(boards.boards.flatMap(b => b.cards.map(c => c.metric)))]
    .filter(metric => entries.has(metric) && !waitingOf(metric))
    .map(metric => createCard(metric, 'target', { id: `attention-${metric}` }))
  const attentionPlan = flagKit ? planMeasurements(attentionCards, today, untilOf, period, custom) : null
  const totalKeys = new Set(Object.values(attentionPlan?.byCard ?? {}).map(needs => needs.total).filter((k): k is string => k !== null))
  const chips: AttentionChip[] = []
  if (flagKit && attentionPlan) {
    for (const card of attentionCards) {
      const needs = attentionPlan.byCard[card.id]
      const measured = needs?.total ? attention[needs.total] : undefined
      const entry = entries.get(card.metric)
      if (!needs || !measured || !entry || card.metric in measured.unavailable) continue
      const value = measured.periods[0]?.values[card.metric] ?? null
      if (value === null) continue
      const level = flagKit.flagFor(card.metric, entry.unit, value, needs.window.measured ?? needs.window.current, untilOf(card.metric))
      if (level) chips.push({ metric: card.metric, label: entry.label, value: formatChartValue(value, valueFormatOf(entry)), level })
    }
  }
  const labelOf = (metric: string) => entries.get(metric)?.label ?? metric

  // New metrics land at the end of the board with a ring for 2 s and a "New" badge for the rest of the visit, and a
  // toast says so with Undo (Dev, 20 Nov: option C).
  const add = (metrics: string[]) => {
    const cards = metrics.map(metric => createCard(metric, 'number', { size: sizeForMetric(entries.get(metric)?.unit) }))
    if (cards.length === 0) return
    const target = board.id
    const ids = new Set(cards.map(c => c.id))
    boards.update(b => cards.reduce((next, card) => addCard(next, card), b), 'Add metrics')
    setFreshId(cards[cards.length - 1].id)
    setNewCards(prev => ({ boardId: target, ids: new Set([...(prev.boardId === target ? prev.ids : []), ...ids]) }))
    const one = cards.length === 1 ? labelOf(metrics[0]) : undefined
    setAnnouncement(one ? `Added ${one} to the board` : `Added ${cards.length} metrics to the board`)
    boardToast({
      icon: Check, message: one ? 'Added {name}' : `Added ${cards.length} metrics`, name: one,
      action: { label: 'Undo', onClick: () => boards.updateBoard(target, b => ({ ...b, cards: b.cards.filter(c => !ids.has(c.id)) })) },
    })
  }

  // Edit mode (Dev, 19 and 20 Nov): changes are held until Save, Cancel throws them away. One editor at a time: Edit
  // board on a board someone else is editing says who. A board made by New board is discarded by Cancel instead.
  const startEditing = (start: Omit<EditStart, 'board'> = { boardId: board.id, isNew: false, backTo: null }) => {
    if (phone) return false
    const holder = editLock.claim(start.boardId)
    if (holder) {
      boardToast({ icon: Pencil, message: `${holderName(holder, you)} ${holder.by === you ? 'are' : 'is'} already editing {name}`, name: nameOf(start.boardId) })
      return false
    }
    boards.beginEdit()
    setEditStart({ ...start, board: boards.boards.find(b => b.id === start.boardId) ?? board })
    return true
  }
  const cancelEditing = () => {
    const start = editStart
    if (start?.isNew) {
      const name = nameOf(start.boardId)
      discardEditing()
      setRenamingId(null)
      const undoDiscard = boards.discard(start.boardId, start.backTo)
      if (undoDiscard) boardToast({ icon: Trash2, message: '{name} discarded', name, action: { label: 'Undo', onClick: undoDiscard } })
      return
    }
    // Cancel with changes asks first (Dev, 19 Nov); with none it just leaves.
    if (boards.dirty) setAsking({ kind: 'discard' })
    else discardEditing()
  }

  // New board makes an empty board at once, the last tab, its name ready to type, in edit mode (Dev, 20 Nov: an
  // empty board only for now; templates and Ask the AI are phase 2). Cancel discards it. From edit mode with changes,
  // it asks about them first.
  const newBoard = () => leaveEditing(() => {
    const backTo = board.id
    const id = boards.add()
    if (!id) return
    setFreshId(null)
    setRenamingId(id)
    startEditing({ boardId: id, isNew: true, backTo })
  })

  const remove = (id: string) => {
    const card = board.cards.find(c => c.id === id)
    if (!card) return
    const at = board.cards.indexOf(card)
    const target = board.id
    boards.update(b => removeCard(b, id), 'Remove card')
    setAnnouncement(`Removed ${labelOf(card.metric)}`)
    // Undo puts the card back in its place and size, marked for a moment, without taking back anything done since.
    boardToast({
      icon: Trash2, message: 'Removed {name}', name: labelOf(card.metric),
      action: {
        label: 'Undo',
        onClick: () => {
          boards.updateBoard(target, b => (b.cards.some(c => c.id === card.id) ? b : addCard(b, card, at)), 'Remove card')
          setFreshId(card.id)
        },
      },
    })
  }

  const stamp = `${board.name} · ${viewText} · ${you || 'You'} · ${formatDayLong(today)}`

  const downloadNumbers = async (card: BoardCard) => {
    const needs = plan.byCard[card.id]
    const entry = entries.get(card.metric)
    const range = needs?.window.measured
    if (!needs || !entry || !range) throw new Error('Nothing to export')
    const compared = needs.window.measuredComparison
    const ask = (r: DateRange) => measure({ metrics: [card.metric], start: r.start, end: r.end, grain: 'day' })
    const [current, before] = await Promise.all([ask(range), compared ? ask(compared) : Promise.resolve(null)])
    const daily = (m: Measurement, r: DateRange) => {
      const byDay = new Map(m.periods.map(p => [p.start, p.values[card.metric] ?? null]))
      return eachDay(r).map(date => ({ date, value: byDay.get(date) ?? null }))
    }
    const csv = cardCsv({
      label: entry.label, format: valueFormatOf(entry), datesLabel: needs.window.label,
      comparisonLabel: compared ? needs.window.comparisonLabel : null,
      series: daily(current, range), comparison: before && compared ? daily(before, compared) : null,
      by: you, on: today,
    })
    downloadCsv(csv, exportName(card.metric, range.start, range.end, 'csv'))
  }

  const downloadCardImage = async (card: BoardCard) => {
    const node = gridRef.current?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(card.id)}"]`)
    if (!node) throw new Error('No card')
    await downloadImage(node, exportName(card.metric, viewRange.start, viewRange.end, 'png'), stamp)
  }

  const downloadBoardImage = async () => {
    if (!gridRef.current) return
    try {
      await downloadImage(gridRef.current, exportName(board.name, viewRange.start, viewRange.end, 'png'), stamp)
    } catch {
      boardToast({ icon: AlertTriangle, tone: 'error', message: 'Couldn’t download the image. Try again.' })
    }
  }

  const copyLink = async (id = board.id) => {
    // The board on screen links to the dates you're looking at; another board opens on the reader's default.
    const url = `${window.location.origin}${window.location.pathname}${searchForView(id, id === board.id ? view : null)}`
    try {
      await navigator.clipboard.writeText(url)
      boardToast({ icon: Link, message: 'Link copied' })
    } catch {
      boardToast({ icon: AlertTriangle, tone: 'error', message: 'Couldn’t copy the link.' })
    }
  }

  // Your tabs: each change says what happened, with Undo (D87, D88, D90).
  const nameOf = (id: string) => boards.boards.find(b => b.id === id)?.name
    ?? boards.deleted.find(d => d.board.id === id)?.board.name ?? 'Board'
  const done = (icon: typeof EyeOff, message: string, name: string, undoChange: (() => void) | null, iconStroke?: number) => {
    if (!undoChange) return
    setAnnouncement(message.replace('{name}', name))
    boardToast({ icon, message, name, action: { label: 'Undo', onClick: undoChange }, iconStroke })
  }
  const hideBoard = (id: string) => done(EyeOff, '{name} hidden from your tabs', nameOf(id), boards.hide(id))
  const showBoard = (id: string) => done(Eye, '{name} is back in your tabs', nameOf(id), boards.show(id))
  const deleteBoard = (id: string) => done(Trash2, '{name} deleted', nameOf(id), boards.remove(id))
  const leaveBoard = (id: string) => done(LogOut, 'You left {name}', nameOf(id), boards.leave(id))
  const restoreBoard = (id: string) => done(RotateCcw, '{name} restored', nameOf(id), boards.restore(id, false), 2)
  // A copy lands right after the original and opens; the toast offers Undo (Dev, 19 Nov: one Duplicate, the copy is
  // yours, from a board shared with you too).
  const duplicateBoard = (id: string) => leaveEditing(() => {
    const name = nameOf(id)
    setFreshId(null)
    done(Copy, 'Made a copy of {name}', name, boards.duplicate(id))
  })
  /** Opens another board; from edit mode with changes, it asks about them first. */
  const openBoard = (id: string) => {
    if (id === board.id) return
    leaveEditing(() => { boards.select(id); setFreshId(null) })
  }
  const renameBoard = (id: string, typed: string) => {
    const wanted = typed.trim().replace(/\s+/g, ' ').slice(0, BOARD_NAME_MAX)
    const saved = boards.rename(id, typed)
    // A name in use isn't blocked: it's numbered, and this says why (D84).
    if (saved && saved !== wanted) {
      boardToast({
        icon: Info, message: `Saved as {name} • ${wanted} is already in use`, name: saved,
        action: { label: 'Rename', onClick: () => setRenamingId(id) },
      })
    }
  }
  const tabLimit = typeof window !== 'undefined' && window.matchMedia(`(max-width: ${NARROW_WIDTH}px)`).matches ? NARROW_TAB_LIMIT : TAB_LIMIT
  const inTabs = new Set(boards.tabs.map(b => b.id))

  const sheetCard = sheetId ? board.cards.find(c => c.id === sheetId) ?? null : null

  return (
    <div className={styles.screen}>
      {attentionPlan?.requests.filter(r => totalKeys.has(r.key)).map(r => (
        <AttentionProbe key={r.key} rangeKey={r.key} request={r.request} onResult={onProbe} />
      ))}
      <AttentionRow chips={chips} onOpen={setOpenMetric} />
      <InHeader>
        <BoardTabs
          tabs={boards.tabs}
          activeId={board.id}
          renamingId={renamingId}
          onRenamingChange={setRenamingId}
          onSelect={openBoard}
          onRename={renameBoard}
          onReorder={boards.reorderTabs}
          onDuplicate={duplicateBoard}
          onCopyLink={id => { void copyLink(id) }}
          onHide={hideBoard}
          onDelete={setDeletingId}
          onLeave={setLeavingId}
          onManage={() => setManaging('tabs')}
          canDelete={boards.boards.length > 1}
        />
      </InHeader>
      <BoardActions
        editing={editing}
        // A board shared with you is view only (S6: only the maker edits).
        viewOnly={board.sharedBy !== undefined}
        onAddMetrics={() => setAdding(true)}
        onNewBoard={newBoard}
        onEdit={() => { startEditing() }}
        saving={saving}
        editingBy={editLock.holder ? holderName(editLock.holder, you) : null}
        canEdit={!phone}
        // Sharing needs the back end (S6+); until then Share hands over the board's link, as Copy link does.
        onShare={() => { void copyLink() }}
        onCopyLink={() => { void copyLink() }}
        onUndo={() => { boards.undo() }}
        onRedo={() => { boards.redo() }}
        canUndo={boards.canUndo}
        canRedo={boards.canRedo}
        onCancel={cancelEditing}
        onSave={() => { void saveEditing() }}
        menu={close => {
          const item = (action: () => void) => () => { close(); action() }
          return (
            <BoardMenu>
              {/* Every board you can see (D33): your tabs in their order, then the hidden ones, grey with an eye-off
                  that puts them back (D87). */}
              <BoardSubmenu icon={LayoutDashboard} label="All boards">
                <BoardMenuHeading>All boards</BoardMenuHeading>
                {[...boards.tabs, ...boards.hidden].map(b => (
                  <BoardMenuItem
                    key={b.id}
                    icon={LayoutDashboard}
                    label={b.name}
                    current={b.id === board.id}
                    muted={!inTabs.has(b.id)}
                    end={inTabs.has(b.id) ? undefined : (
                      <Tooltip content="Show tab">
                        <span
                          className={styles.allBoardsShow}
                          onClick={event => { event.stopPropagation(); close(); showBoard(b.id) }}
                        >
                          <EyeOff size={16} strokeWidth={1.75} aria-hidden />
                        </span>
                      </Tooltip>
                    )}
                    onSelect={item(() => openBoard(b.id))}
                  />
                ))}
                <BoardMenuSeparator />
                <BoardMenuItem icon={Plus} label="New board" onSelect={item(newBoard)} />
                <BoardMenuItem icon={SlidersHorizontal} label="Manage tabs" onSelect={item(() => setManaging('tabs'))} />
              </BoardSubmenu>
              {boards.deleted.length > 0 && (
                <BoardMenuItem icon={Archive} label={`Recently deleted (${boards.deleted.length})`}
                  onSelect={item(() => setManaging('deleted'))} />
              )}
              <BoardMenuSeparator />
              {/* A board shared with you to view: no Rename, and Copy link is up front on the + instead (Dev, 20 Nov).
                  Version history (Dev, 19 Nov: not needed for now) and Start over (Dev, 19 Nov: no Start over) are out. */}
              {!board.sharedBy && <BoardMenuItem icon={Pencil} label="Rename" onSelect={item(() => setRenamingId(board.id))} />}
              <BoardMenuItem icon={Copy} label="Duplicate" onSelect={item(() => duplicateBoard(board.id))} />
              {!board.sharedBy && <BoardMenuItem icon={Link} label="Copy link" onSelect={item(() => { void copyLink() })} />}
              <BoardMenuItem icon={ImageIcon} label="Download as image" onSelect={item(() => { void downloadBoardImage() })} />
              <BoardMenuSeparator />
              <BoardMenuItem icon={EyeOff} label="Hide tab" disabled={boards.tabs.length <= 1} onSelect={item(() => hideBoard(board.id))} />
              <BoardMenuSeparator />
              {board.sharedBy ? (
                <BoardMenuItem icon={LogOut} label="Leave board" danger disabled={boards.boards.length <= 1}
                  onSelect={item(() => setLeavingId(board.id))} />
              ) : (
                <BoardMenuItem icon={Trash2} label="Delete board" danger disabled={boards.boards.length <= 1}
                  onSelect={item(() => setDeletingId(board.id))} />
              )}
              {board.sharedBy && <p className={styles.menuFoot}>Shared by <strong>{board.sharedBy}</strong></p>}
            </BoardMenu>
          )
        }}
      />

      {board.cards.length === 0 ? (
        <div className={styles.empty}>
          <p>This board has no cards yet.</p>
          <Button variant="secondary" onClick={() => setAdding(true)}>Add metrics</Button>
        </div>
      ) : (
        <div ref={gridRef} className={styles.gridWrap}>
          <BoardGrid
            board={board}
            plan={plan}
            catalog={entries}
            catalogReady
            freshId={freshId}
            newIds={newCards.boardId === board.id ? newCards.ids : undefined}
            onReorder={(ids, step) => boards.update(b => reorderCards(b, ids), step?.startsWith('resize') ? 'Resize card' : 'Move card', step)}
            onChange={(id, patch, step) => boards.update(b => updateCard(b, id, patch), patch.size ? 'Resize card' : 'Change card', step)}
            onRemove={remove}
            editing={editing}
            // A long press starts editing. Nothing on the grid ends it: only Save or Cancel (Dev, 19 Nov).
            onEditingChange={on => { if (on && !editing && !board.sharedBy) startEditing() }}
            onAnnounce={setAnnouncement}
            onHint={setHint}
            onOpen={setOpenMetric}
            onEdit={setSheetId}
            sourcesOf={sourcesOf}
            held={boards.held}
            waitingOf={waitingOf}
            healthKit={healthKit}
            categoriesOf={categoriesOf}
          />
        </div>
      )}

      <div className="sr-only" aria-live="polite">{announcement}</div>

      {/* The keys for the card in hand, above the edit bar (Figma "Keyboard · moving a card" / "resizing a card"). */}
      {editing && hint && (
        <div className={styles.keyHint} aria-hidden>
          {hint === 'move' ? (
            <><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Space</kbd> drop · <kbd>Esc</kbd> cancel</>
          ) : (
            <><kbd>←</kbd><kbd>→</kbd> width · <kbd>↑</kbd><kbd>↓</kbd> height</>
          )}
        </div>
      )}
      {asking?.kind === 'discard' && (
        <DiscardDialog
          boardName={board.name}
          onDiscard={() => { setAsking(null); discardEditing() }}
          onClose={() => setAsking(null)}
        />
      )}
      {asking?.kind === 'leave' && (
        <UnsavedDialog
          boardName={board.name}
          saving={saving}
          onSave={() => {
            const then = asking.then
            void saveEditing(then).then(() => setAsking(null))
          }}
          onDontSave={() => { const then = asking.then; setAsking(null); discardEditing(); then() }}
          onClose={() => setAsking(null)}
        />
      )}

      <MetricModal metric={openMetric} onClose={() => setOpenMetric(null)} />

      {adding && (
        <AddCardDialog
          catalog={catalog.data}
          onBoard={new Set(board.cards.map(c => c.metric))}
          onAdd={add}
          onClose={() => setAdding(false)}
        />
      )}
      {sheetCard && (
        <CardSheet
          card={sheetCard}
          entry={entries.get(sheetCard.metric)}
          catalog={catalog.data}
          onSwap={metric => boards.update(b => swapMetric(b, sheetCard.id, metric, entries.get(metric)?.unit), 'Change metric')}
          onChart={kind => boards.update(b => updateCard(b, sheetCard.id, { kind }), 'Change chart')}
          onDuplicate={() => {
            boards.update(b => duplicateCard(b, sheetCard.id), 'Duplicate card')
            setAnnouncement(`Duplicated ${labelOf(sheetCard.metric)}`)
          }}
          onRemove={() => remove(sheetCard.id)}
          onDownloadNumbers={() => downloadNumbers(sheetCard)}
          onDownloadImage={() => downloadCardImage(sheetCard)}
          onClose={() => setSheetId(null)}
        />
      )}
      {managing && (
        <ManageTabsDialog
          tabs={boards.tabs}
          hidden={boards.hidden}
          deleted={boards.deleted}
          now={now}
          rowLimit={tabLimit}
          initialView={managing}
          canDelete={boards.boards.length > 1}
          onSave={boards.manage}
          onDuplicate={duplicateBoard}
          onCopyLink={id => { void copyLink(id) }}
          onDelete={deleteBoard}
          onLeave={leaveBoard}
          onRestore={restoreBoard}
          onNewBoard={newBoard}
          onClose={() => setManaging(null)}
        />
      )}
      {deletingId && boards.boards.some(b => b.id === deletingId) && (
        <ConfirmModal
          title={`Delete ${nameOf(deletingId)}?`}
          description={deleteText(boards.boards.find(b => b.id === deletingId)!)}
          confirmLabel="Delete board"
          onConfirm={async () => { deleteBoard(deletingId) }}
          onClose={() => setDeletingId(null)}
        />
      )}
      {leavingId && boards.boards.some(b => b.id === leavingId) && (
        <ConfirmModal
          title={`Leave ${nameOf(leavingId)}?`}
          description={leaveText(boards.boards.find(b => b.id === leavingId)!)}
          confirmLabel="Leave board"
          onConfirm={async () => { leaveBoard(leavingId) }}
          onClose={() => setLeavingId(null)}
        />
      )}
    </div>
  )
}

function BoardSkeleton() {
  const spans = [3, 3, 3, 3, 6, 6]
  return (
    <div className={styles.screen} aria-busy aria-label="Loading the board">
      <InHeader><Skeleton style={{ width: 320, height: 36, borderRadius: 9999 }} /></InHeader>
      <ul className={styles.grid}>
        {spans.map((cols, i) => (
          <li key={i} className={styles.cell} style={{ gridColumn: `span ${cols}`, gridRow: `span ${cols === 6 ? 2 : 1}` }}>
            <Skeleton style={{ width: '100%', height: '100%', borderRadius: 16, opacity: 0.6 }} />
          </li>
        ))}
      </ul>
    </div>
  )
}
