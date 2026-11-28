import { cardBody, flagged, healthPill, reasonOf } from '../card-states'
import type { CardView } from '../MetricCard'
import type { AttentionItem } from '../NeedsAttention'
import type { useLiveDashboard } from '../live/dashboard-data'
import type { Metrics } from '../live/metrics'
import { clock, hoursSince } from '../sync/sync-model'
import type { SyncSnapshot } from '../sync/sync-store'
import type { Board } from '../tabs/board-state'
import type { AppId } from '../types'

// How the open board's cards read (05-cards-reading-rules.md), worked out from the board, its
// numbers and the sync state. Pure, so the board screen only wires it up.

type Live = ReturnType<typeof useLiveDashboard>

/** The apps a metric reads; none for one the warehouse can't measure. */
export function appsOf(metrics: Metrics, metricId: string): AppId[] {
  const metric = metrics.get(metricId)
  return !metric || metric.unmeasured ? [] : metric.apps
}

/** The apps this board's cards read, and how many cards read each (SY-1, SY-6). A card reading two apps counts for both. */
export function appUses(board: Board, metrics: Metrics) {
  const uses: Partial<Record<AppId, number>> = {}
  for (const c of board.cards) for (const app of appsOf(metrics, c.metricId)) uses[app] = (uses[app] ?? 0) + 1
  return { uses, apps: Object.keys(uses) as AppId[] }
}

export interface CardViewInput {
  live: Live
  data: NonNullable<Live['data']>
  board: Board
  sync: SyncSnapshot
  now: number
  /** The store's midnight: an app that last synced before it hasn't synced "today". */
  midnight: number
  period: string
  /** The numbers are on their way, or a draft is being made: the cards shimmer (TAB-6, NB-21, NB-24). */
  loading: boolean
}

/**
 * How a card reads (CR-18 – CR-29): its body, its app's dot, a shimmer while it syncs, its days and
 * its health. `picture`: for an image, the cards as they'll read once loaded (SH-34).
 */
export function cardViewFor({ live, data, board, sync, now, midnight, period, loading }: CardViewInput) {
  const canEdit = board.access !== 'view'
  return (metricId: string, picture = false): CardView | undefined => {
    const metric = data.metrics.get(metricId)
    if (!metric) return { body: 'removed', canEdit }
    // The board's status knows each app's state; until it answers, the warehouse summary's first syncs.
    const apps = appsOf(data.metrics, metricId).map((id) => ({ id, a: sync.apps[id] }))
    const firstSync = apps.some((x) => (x.a ? x.a.state === 'first' : data.apps.firstSync(x.id)))
    const body = cardBody({
      loading: !picture && loading,
      firstSyncRunning: firstSync,
      // The numbers didn't load: this card says so with Try again; the rest of the board keeps working (CR-20).
      couldntLoad: live.numbersFailed,
      unmeasured: !!metric.unmeasured,
      // On Today, an app that hasn't synced since yesterday has nothing for today (CR-26).
      todayEmpty: period === 'today' && apps.some((x) => x.a?.syncedAt != null && x.a.syncedAt < midnight),
    })
    // The worse dot; hovering it names the app(s) and how old the numbers are (CR-25).
    const failed = apps.filter((x) => x.a?.state === 'failed')
    const behind = apps.filter((x) => x.a?.state === 'behind')
    const tips = failed.length
      ? failed.map((x) => `${x.a.name} sync failed · numbers from ${x.a.syncedAt == null ? 'its first sync' : clock(x.a.syncedAt)}`)
      : behind.map((x) => {
          const h = hoursSince(x.a.syncedAt, now)
          return `${x.a.name} hasn’t synced in ${h} hour${h === 1 ? '' : 's'} · numbers from ${x.a.syncedAt == null ? 'its first sync' : clock(x.a.syncedAt)}`
        })
    const chart = board.cards.find((c) => c.metricId === metricId)?.chart
    return {
      body,
      dot: tips.length ? { tone: failed.length ? 'failed' : 'behind', tip: tips.join('; ') } : undefined,
      syncing: !picture && apps.some((x) => x.a?.state === 'syncing'),
      health: healthPill(metric.health, body),
      canEdit,
      bars: chart ? chart === 'bars' : undefined,
      // The chart has its own skeleton and its own failure: the number can show before (or without) it.
      chartLoading: !picture && live.chartLoading(metricId),
      chartFailed: live.chartsFailed,
    }
  }
}

/** Needs attention: every flagged metric on your tabs, red first, with the boards it's on (CR-31). */
export function attentionFor(tabs: Board[], metrics: Metrics): AttentionItem[] {
  const attention: AttentionItem[] = []
  for (const b of tabs) {
    for (const c of b.cards) {
      const metric = metrics.get(c.metricId)
      const health = metric?.health ?? null
      if (!metric || !flagged(health)) continue
      const seen = attention.find((x) => x.metricId === metric.id)
      if (seen) {
        if (!seen.boards.split(', ').includes(b.label)) seen.boards += `, ${b.label}`
        continue
      }
      attention.push({ metricId: metric.id, label: metric.label, boards: b.label, reason: reasonOf(health), value: metric.value, tone: 'red' })
    }
  }
  return attention
}
