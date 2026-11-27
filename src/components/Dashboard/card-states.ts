// What each card shows while reading (05-cards-reading-rules.md CR-18 – CR-30): its body state and
// its health, as pure functions of what the warehouse reported.

import { STATUS_LABEL, needsAttention, statusReason } from '@/lib/scorecard/status'
import { formatPercent } from './format'
import type { Health } from './types'

// ── Body state (CR-18) ─────────────────────────────────────────────────────────

export type CardBody =
  | 'loading' | 'removed' | 'no-data-yet' | 'couldnt-load' | 'no-data'
  /** Today, and its app hasn't synced today: "—" and "No data yet" (CR-26). */
  | 'today-empty'
  | 'numbers'

export interface BodyFacts {
  loading?: boolean
  /** The metric is no longer in the warehouse's library. */
  removed?: boolean
  /** An app it reads is still on its first sync. */
  firstSyncRunning?: boolean
  couldntLoad?: boolean
  unmeasured?: boolean
  todayEmpty?: boolean
}

/** One body state per card, in this order: loading, removed, no data yet, couldn't load, no data, then the numbers. */
export function cardBody(f: BodyFacts): CardBody {
  if (f.loading) return 'loading'
  if (f.removed) return 'removed'
  if (f.firstSyncRunning) return 'no-data-yet'
  if (f.couldntLoad) return 'couldnt-load'
  if (f.unmeasured) return 'no-data'
  if (f.todayEmpty) return 'today-empty'
  return 'numbers'
}

/** Empty cards don't open the metric window (CR-18). */
export const opens = (body: CardBody) => body === 'numbers' || body === 'today-empty'

// ── Health (CR-28 – CR-30) ────────────────────────────────────────────────────

export type HealthTone = 'good' | 'bad'

export interface HealthPill {
  text: string
  tone: HealthTone
  /** Shown beside the pill on cards wider than 3 columns: "Target $55k". */
  target?: string
}

/**
 * The pill a card shows against its scorecard target, or none when there's nothing to judge (CR-28,
 * CR-29). With the scorecard's judgement (lib/scorecard/status.ts) it says what the metric window
 * says: On track, At risk or Off track; at risk still counts as on track (good).
 */
export function healthPill(health: Health | null, body: CardBody): HealthPill | null {
  if (!health || body !== 'numbers') return null
  const target = `Target ${health.target}`
  if (health.judgement) {
    const status = health.judgement.status
    return { text: STATUS_LABEL[status], tone: status === 'off_track' ? 'bad' : 'good', target }
  }
  return health.verdict === 'on'
    ? { text: 'On track', tone: 'good', target }
    : { text: `Off target ${health.off ?? ''}`.trim(), tone: 'bad', target }
}

/** Off track goes into Needs attention (needsAttention: at risk doesn't). */
export const flagged = (health: Health | null): health is Health =>
  !!health && (health.judgement ? needsAttention(health.judgement) : health.verdict === 'off')

/** The reason in a Needs attention row: "12% below the target, past the 5% tolerance"; "Off target −12%" without a judgement. */
export function reasonOf(health: Health): string {
  if (health.judgement && health.rule) return statusReason(health.judgement, health.rule, formatPercent)
  return `Off target ${health.off ?? ''}`.trim()
}
