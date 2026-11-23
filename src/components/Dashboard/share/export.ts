// Downloads (docs-v2/dashboard/09-share-export-rules.md SH-31 – SH-37): the spreadsheet, the file names,
// the stamp, and saving a file. The CSV and the names are pure, so they're testable.

import { METRICS } from '../mock-data'
import { TODAY, periodDays, periodEnd, seriesFor } from '../series'
import type { Metric } from '../types'
import { datesLabel, periodLabel } from './share-model'

const DAY = 86_400_000
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const slug = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** The first and last day of the period on screen. */
export function periodRange(period: string): { from: Date; to: Date } {
  const to = periodEnd(period)
  return { from: new Date(to.getTime() - (periodDays(period) - 1) * DAY), to }
}

/** "store-overview-2025-11-08-to-2025-11-14" (SH-33, SH-36). */
export function fileBase(name: string, period: string): string {
  const { from, to } = periodRange(period)
  return `${slug(name)}-${iso(from)}-to-${iso(to)}`
}

/** "Store overview · Last 7 days • Previous period · Dev Shah · 14 Nov 2025" (SH-34). */
export function stamp(board: string, period: string, compare: string, by: string, on: Date = TODAY): string {
  const day = on.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${board} · ${datesLabel(period, compare)} · ${by} · ${day}`
}

/** "Previous 7 days" / "Same days last year": what the comparison columns are called. */
function compareName(period: string, compare: string): string {
  return compare === 'last-year' ? 'Same days last year' : `Previous ${periodDays(period)} days`
}

/** A header for a card's column: rates say "(%)", multiples "(x)". */
const header = (m: Metric) => (m.format === 'percent' ? `${m.label} (%)` : m.format === 'ratio' ? `${m.label} (x)` : m.label)
/** Exact, never "k": two decimals at most, no trailing zeros (6812.4, 5850). */
const exact = (v: number | null) => (v == null ? '' : String(Math.round(v * 100) / 100))

const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/**
 * One sheet: a title row, who exported it and when, a blank row, then Date, each card, the comparison's
 * date and each card's comparison, a row per day (SH-37). Starts with a byte-order mark for Excel.
 */
export function numbersCsv(opts: { title: string; metricIds: string[]; period: string; compare: string; by: string; on?: Date }): string {
  const { metricIds, period, compare, by } = opts
  const on = opts.on ?? TODAY
  const metrics = metricIds.map((id) => METRICS[id]).filter((m): m is Metric => !!m)
  const series = metrics.map((m) => seriesFor(m, period))
  const withCompare = compare !== 'none'
  const cmp = compareName(period, compare)
  const vs = compare === 'last-year' ? 'vs same days last year' : `vs previous ${periodDays(period)} days`
  const rows: string[][] = [
    [`${opts.title} · ${periodLabel(period)}${withCompare ? ` · ${vs}` : ''}`],
    [`Exported by ${by} on ${on.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`],
    [],
    ['Date', ...metrics.map(header), ...(withCompare ? [`${cmp} date`, ...metrics.map((m) => `${header(m)}, ${cmp.toLowerCase()}`)] : [])],
  ]
  const n = series[0]?.days.length ?? 0
  for (let i = 0; i < n; i++) {
    const prevDate = compare === 'last-year'
      ? new Date(series[0].days[i].date.getFullYear() - 1, series[0].days[i].date.getMonth(), series[0].days[i].date.getDate())
      : series[0].previous[i].date
    rows.push([
      iso(series[0].days[i].date),
      ...series.map((s) => exact(s.days[i].value)),
      ...(withCompare ? [iso(prevDate), ...series.map((s) => exact(s.previous[i].value))] : []),
    ])
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** Hands a file to the browser to save. */
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

/** A DOM node drawn into a PNG at twice the screen's sharpness (SH-33). */
export async function nodeToPng(node: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import('html2canvas')
  // html2canvas finds each font's baseline with an image beside some text, measured in this page.
  // Tailwind's preflight makes images block and middle-aligned, which puts every line of text too
  // low in the picture; undo that for the moment of the capture only.
  const fix = document.createElement('style')
  fix.textContent = 'img { display: inline-block !important; vertical-align: baseline !important; }'
  document.head.appendChild(fix)
  let canvas: HTMLCanvasElement
  try {
    canvas = await html2canvas(node, { scale: 2, backgroundColor: null, logging: false, useCORS: true })
  } finally {
    fix.remove()
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'))
}

// `?download=fail` fails the next try (image or numbers), once (SH-35, SH-36).
let failNext = false
export const seedDownloadFail = (v: string | null) => { failNext = v === 'fail' }
export const consumeDownloadFail = () => { const f = failNext; failNext = false; return f }
