// Exports (Canvas PRD, flow 10): a card's numbers as a spreadsheet, a card or a whole board as an image. Each holds
// only what the person can see and carries their name and the date. Figures are exact, never rounded.

import type { ValueFormat } from '@/components/charts/format'
import { formatDayLong } from '@/components/charts/format'
import type { DatedValue } from '@/components/charts/scale'

/** A spreadsheet cell: quoted when it holds a comma, a quote or a line break. */
function cell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A figure as the spreadsheet should hold it: money and counts as they are, a rate as a percentage (3.4, under a
 * "(%)" header), a multiple as it is. Exact: only floating-point noise is trimmed (0.1 + 0.2 reads 0.3).
 */
export function exactFigure(value: number | null, format: ValueFormat): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const raw = format === 'ratio' ? value * 100 : value
  return Number(raw.toPrecision(12))
}

function headerFor(label: string, format: ValueFormat): string {
  if (format === 'ratio') return `${label} (%)`
  if (format === 'multiple') return `${label} (x)`
  return label
}

export interface CardSheetInput {
  label: string
  format: ValueFormat
  /** "Last 30 days", for the title row. */
  datesLabel: string
  /** "Period before", "Same period last year"; null without a comparison. */
  comparisonLabel: string | null
  series: ReadonlyArray<DatedValue>
  /** Lined up with `series` day by day; null without a comparison. */
  comparison: ReadonlyArray<DatedValue> | null
  /** Who's exporting, and when (ISO date). */
  by: string
  on: string
}

/**
 * The card's numbers as CSV: a title row, a "who and when" row, a blank line, then one row per day for the board's
 * dates with the comparison's day and figure beside it.
 */
export function cardCsv(input: CardSheetInput): string {
  const { label, format, series, comparison } = input
  const rows: Array<Array<string | number | null>> = [
    [`${label} · ${input.datesLabel}${input.comparisonLabel ? ` · vs ${input.comparisonLabel.toLowerCase()}` : ''}`],
    [`Exported by ${input.by || 'you'} on ${formatDayLong(input.on)}`],
    [],
  ]
  const header: Array<string | number | null> = ['Date', headerFor(label, format)]
  if (comparison) header.push(`${input.comparisonLabel ?? 'Comparison'} date`, headerFor(`${label}, ${(input.comparisonLabel ?? 'comparison').toLowerCase()}`, format))
  rows.push(header)
  series.forEach((point, i) => {
    const row: Array<string | number | null> = [point.date, exactFigure(point.value, format)]
    if (comparison) {
      const before = comparison[i]
      row.push(before?.date ?? null, before ? exactFigure(before.value, format) : null)
    }
    rows.push(row)
  })
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

/** "revenue-2026-10-17-to-2026-11-15.csv": IDs and dates only. */
export function exportName(slug: string, start: string, end: string, extension: 'csv' | 'png'): string {
  const safe = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board'
  return `${safe}-${start}-to-${end}.${extension}`
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCsv(csv: string, filename: string): void {
  // The byte-order mark makes Excel read the file as UTF-8 (so "·" and "–" survive).
  save(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename)
}

/**
 * A card or the whole board as an image, with a strip under it naming the board, its dates, who exported it and
 * when. Anything marked `data-export-hide` (edit handles, the remove badge) is left out.
 */
export async function downloadImage(node: HTMLElement, filename: string, stamp: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas')
  const background = getComputedStyle(document.body).backgroundColor || '#ffffff'
  const shot = await html2canvas(node, {
    scale: 2,
    backgroundColor: background,
    logging: false,
    ignoreElements: el => el instanceof HTMLElement && el.dataset.exportHide !== undefined,
  })
  const strip = 56
  const canvas = document.createElement('canvas')
  canvas.width = shot.width
  canvas.height = shot.height + strip
  const context = canvas.getContext('2d')
  if (!context) throw new Error('No canvas')
  context.fillStyle = background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(shot, 0, 0)
  context.fillStyle = getComputedStyle(document.body).color || '#555555'
  context.globalAlpha = 0.7
  context.font = '24px system-ui, -apple-system, "Segoe UI", sans-serif'
  context.textBaseline = 'middle'
  context.fillText(stamp, 24, shot.height + strip / 2)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No image')
  save(blob, filename)
}
