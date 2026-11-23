'use client'

// What each card shows while reading (05-cards-reading-rules.md CR-18 – CR-30): its body state,
// its health, and the dummy scenarios that put cards in the drawn states (`?cards=`). The rules are
// pure functions; the scenario state is a small external store, read through useCardStates
// (useSyncExternalStore), like the sync store.

import { useSyncExternalStore } from 'react'
import type { Health, Metric } from './types'

// ── Body state (CR-18) ─────────────────────────────────────────────────────────

export type CardBody =
  | 'loading' | 'removed' | 'locked' | 'no-data-yet' | 'couldnt-load' | 'no-data'
  /** Today, and its app hasn't synced today: "—" and "No data yet" (CR-26). */
  | 'today-empty'
  | 'numbers'

export interface BodyFacts {
  loading?: boolean
  removed?: boolean
  locked?: boolean
  /** Its app is on a first sync that has run a while (a fresh first sync shows the skeleton). */
  firstSyncRunning?: boolean
  couldntLoad?: boolean
  unmeasured?: boolean
  todayEmpty?: boolean
}

/** One body state per card, in this order: loading, removed, locked, no data yet, couldn't load, no data, then the numbers. */
export function cardBody(f: BodyFacts): CardBody {
  if (f.loading) return 'loading'
  if (f.removed) return 'removed'
  if (f.locked) return 'locked'
  if (f.firstSyncRunning) return 'no-data-yet'
  if (f.couldntLoad) return 'couldnt-load'
  if (f.unmeasured) return 'no-data'
  if (f.todayEmpty) return 'today-empty'
  return 'numbers'
}

/** Empty and locked cards don't open the metric window (CR-18, CR-23). */
export const opens = (body: CardBody) => body === 'numbers' || body === 'today-empty'

// ── Health (CR-28 – CR-30) ────────────────────────────────────────────────────

export type HealthTone = 'good' | 'bad' | 'warn'

export interface HealthPill {
  text: string
  tone: HealthTone
  /** Shown beside the pill on cards wider than 3 columns: "Target $55k". */
  target?: string
}

/** The pill a card shows, or none when it's healthy or there's nothing to judge (CR-28, CR-29). */
export function healthPill(health: Health | undefined, body: CardBody): HealthPill | null {
  if (!health || body !== 'numbers') return null
  if (health.by === 'target') {
    return health.verdict === 'on'
      ? { text: 'On track', tone: 'good', target: `Target ${health.target}` }
      : { text: `Off target ${health.off ?? ''}`.trim(), tone: 'bad', target: `Target ${health.target}` }
  }
  if (health.verdict === 'red') return { text: 'Red flag', tone: 'bad' }
  return { text: health.verdict === 'below' ? 'Below healthy' : 'Above healthy', tone: 'warn' }
}

/** Flagged for Needs attention: red (off target, red flag) or amber (below / above healthy). */
export function flagOf(health: Health | undefined): 'red' | 'amber' | null {
  if (!health) return null
  if (health.by === 'target') return health.verdict === 'off' ? 'red' : null
  return health.verdict === 'red' ? 'red' : 'amber'
}

/** "Off target −12%", "Red flag", "Below healthy": the reason in a Needs attention row. */
export function reasonOf(health: Health): string {
  if (health.by === 'target') return health.verdict === 'off' ? `Off target ${health.off ?? ''}`.trim() : 'On track'
  return health.verdict === 'red' ? 'Red flag' : health.verdict === 'below' ? 'Below healthy' : 'Above healthy'
}

// ── Dummy scenarios (stand-in, 05 §9) ──────────────────────────────────────────

export interface CardStates {
  couldntLoad: string[]
  boardFailed: boolean
  locked: string[]
  removed: string[]
  /** Meta Ads connected on 12 Nov: few days and no comparison on its cards (CR-24). */
  newMeta: boolean
  /** Nine flagged metrics, so the Needs attention list scrolls (CR-32). */
  manyFlags: boolean
  /** Cards (or the board, as '*') asking again after Try again. */
  retrying: string[]
}

const EMPTY: CardStates = { couldntLoad: [], boardFailed: false, locked: [], removed: [], newMeta: false, manyFlags: false, retrying: [] }
let snap: CardStates = EMPTY
let seededWith: string | null = null
const listeners = new Set<() => void>()
const set = (next: Partial<CardStates>) => { snap = { ...snap, ...next }; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l) }

export function useCardStates(): CardStates {
  return useSyncExternalStore(subscribe, () => snap, () => EMPTY)
}

const SCENARIOS: Record<string, Partial<CardStates>> = {
  cardfail: { couldntLoad: ['ad-spend'] },
  boardfail: { boardFailed: true },
  locked: { locked: ['net-sales', 'refund-rate'] },
  removed: { removed: ['discount-rate'] },
  newmeta: { newMeta: true },
  manyflags: { manyFlags: true },
}

export function seedCardsFromQuery(cards: string | null) {
  const key = cards ?? ''
  if (seededWith === key || (seededWith !== null && key === '')) return
  seededWith = key
  set({ ...EMPTY, ...Object.assign({}, ...key.split(',').map((k) => SCENARIOS[k] ?? {})) })
}

let addFailsOnce = false

/** `?add=fail`: the next Add to board fails once (06 AC-25). */
export function seedAddFail(add: string | null) { addFailsOnce = add === 'fail' }

/** Whether this add should fail (and stop failing after). */
export function consumeAddFail(): boolean {
  const fail = addFailsOnce
  addFailsOnce = false
  return fail
}

const RETRY_MS = 700

/** Try again on a card: it shimmers, then shows its numbers (CR-20). */
export function retryCard(id: string) {
  set({ retrying: [...snap.retrying, id] })
  window.setTimeout(() => set({ retrying: snap.retrying.filter((r) => r !== id), couldntLoad: snap.couldntLoad.filter((c) => c !== id) }), RETRY_MS)
}

/** Try again on the board (CR-21). */
export function retryBoard() {
  set({ retrying: [...snap.retrying, '*'] })
  window.setTimeout(() => set({ retrying: snap.retrying.filter((r) => r !== '*'), boardFailed: false }), RETRY_MS)
}

// Extra flags for `?cards=manyflags` (Figma C-6b: nine flagged).
const MANY: Record<string, Health> = {
  'new-customers': { by: 'target', verdict: 'off', off: '−3%', target: '46 a day', perDay: 46 },
  'returning-rate': { by: 'benchmark', verdict: 'below' },
  'processing-fees': { by: 'target', verdict: 'off', off: '−2%', target: '$1.1k' },
  cpm: { by: 'benchmark', verdict: 'above' },
  'net-sales': { by: 'target', verdict: 'off', off: '−4%', target: '$44k' },
}

/** A metric's health, with the scenario's extra flags. */
export function healthFor(metric: Metric, states: CardStates): Health | undefined {
  return (states.manyFlags && MANY[metric.id]) || metric.health
}
