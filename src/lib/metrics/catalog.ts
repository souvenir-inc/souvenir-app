// What the catalog says about one metric: whose definition it is (Souvenir's, adjusted by the workspace, or the
// workspace's own), whether someone has checked it, which metrics use it, and which metrics a chat reply points to.

import type { MetricEntry } from '@/lib/api/warehouse-schemas'
import { CUSTOM_CATEGORY } from './display'
import { isMetricValue, referencesOf } from './tree'

/** Souvenir's library metric, the workspace's own version of one (`overridden`), or one the workspace added. */
export type Origin = 'builtin' | 'adjusted' | 'custom'

export function originOf(entry: Pick<MetricEntry, 'category' | 'overridden'>): Origin {
  if (entry.category === CUSTOM_CATEGORY) return 'custom'
  return entry.overridden ? 'adjusted' : 'builtin'
}

export const ORIGIN_NAMES: ReadonlyMap<Origin, string> = new Map([
  ['builtin', 'Built in'], ['adjusted', 'Adjusted by your workspace'], ['custom', 'Custom'],
])

/** Custom metrics that use this one in their formula: what else moves when it changes. */
export function usersOf(name: string, entries: readonly MetricEntry[]): MetricEntry[] {
  return entries.filter(entry => entry.name !== name && isMetricValue(entry.value) && referencesOf(entry.value).includes(name))
}

const SAYS_EXISTS = /\b(already|exists?|available|use the existing)\b/i
/** Longest reply searched for metric names (RG-1: cap first). */
const REPLY_LIMIT = 4000

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_]/.test(char)
}

/** Where `form` first appears in `text` as a whole word, or -1. A linear scan, no regex built from data. */
function wordIndex(text: string, form: string): number {
  if (form === '') return -1
  for (let at = text.indexOf(form); at !== -1; at = text.indexOf(form, at + 1)) {
    if (!isWordChar(text[at - 1]) && !isWordChar(text[at + form.length])) return at
  }
  return -1
}

/**
 * Metrics a chat reply points to when it says one already exists ("This is already available as MER"), in the
 * order it names them, so the reply can offer "Open MER". Labels match as written; technical names (`ad_spend`)
 * match too, but a plain-word name ("revenue") is just a word in a sentence.
 */
export function mentionedMetrics(reply: string, catalog: readonly MetricEntry[], limit = 2): MetricEntry[] {
  const text = reply.slice(0, REPLY_LIMIT)
  if (!SAYS_EXISTS.test(text)) return []
  const found: Array<{ entry: MetricEntry; at: number }> = []
  for (const entry of catalog) {
    const forms = entry.name.includes('_') ? [entry.label, entry.name] : [entry.label]
    const positions = forms.map(form => wordIndex(text, form)).filter(at => at !== -1)
    if (positions.length > 0) found.push({ entry, at: Math.min(...positions) })
  }
  return found.sort((a, b) => a.at - b.at || b.entry.label.length - a.entry.label.length).slice(0, limit).map(item => item.entry)
}
