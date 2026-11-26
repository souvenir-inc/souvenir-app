// How a link carries what its sender was looking at (Header · Period filter, 19 Nov). Dates are a filter: every board
// opens on the person's default period from Settings → Account, compared with the period before, and nothing is
// saved to a board. A link is the one exception: it opens on the sender's period and comparison.

import { comparisonFor, isComparison, isQuickPeriod, type PeriodView } from '@/lib/warehouse/period'
import type { DateRange } from './windows'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * A view carried by a link: `?board=<id>&period=7d&compare=year`; a custom range as `&from=2026-10-01&to=2026-10-31`;
 * a custom comparison as `&compare=custom&cfrom=…&cto=…`. Anything missing or unreadable is left out, so a plain link
 * opens on your own default.
 */
export interface LinkedView {
  boardId: string | null
  view: PeriodView | null
}

function rangeFrom(from: string | null, to: string | null): DateRange | null {
  if (!from || !to || !ISO.test(from) || !ISO.test(to)) return null
  return from <= to ? { start: from, end: to } : { start: to, end: from }
}

export function viewFromSearch(search: string): LinkedView {
  const params = new URLSearchParams(search)
  const boardId = params.get('board')
  const custom = rangeFrom(params.get('from'), params.get('to'))
  const period = params.get('period')
  const compare = params.get('compare')
  const compareCustom = rangeFrom(params.get('cfrom'), params.get('cto'))
  let view: PeriodView | null = null
  const asked = isComparison(compare) && (compare !== 'custom' || compareCustom) ? compare : 'previous'
  if (custom) {
    view = { period: 'custom', custom, comparison: comparisonFor('custom', asked), compareCustom }
  } else if (isQuickPeriod(period)) {
    view = { period, custom: null, comparison: comparisonFor(period, asked), compareCustom }
  }
  if (view && view.comparison !== 'custom') view = { ...view, compareCustom: null }
  return { boardId: boardId && boardId.length <= 80 ? boardId : null, view }
}

/** The query string for a board seen as `view` (or plain, with none). IDs and dates only: nothing personal. */
export function searchForView(boardId: string, view: PeriodView | null): string {
  const params = new URLSearchParams({ board: boardId })
  if (view) {
    if (view.period === 'custom' && view.custom) {
      params.set('from', view.custom.start)
      params.set('to', view.custom.end)
    } else if (view.period !== 'custom') {
      params.set('period', view.period)
    }
    const comparison = comparisonFor(view.period, view.comparison)
    if (comparison === 'custom' && view.compareCustom) {
      params.set('compare', 'custom')
      params.set('cfrom', view.compareCustom.start)
      params.set('cto', view.compareCustom.end)
    } else if (comparison !== 'previous' && comparison !== 'custom') {
      params.set('compare', comparison)
    }
  }
  return `?${params.toString()}`
}
