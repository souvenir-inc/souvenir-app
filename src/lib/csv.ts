/**
 * CSV for files people open in Excel, Sheets or Numbers (VS-10, VS-13, FI-14; OWASP CSV Injection).
 *
 * A text cell that a spreadsheet could run as a formula is neutralised with a leading `'`: one that
 * starts with = + - @ (or their full-width forms ＝ ＋ － ＠), or with a tab, CR or LF, also after
 * leading spaces. A cell with a comma, quote, CR or LF is quoted with inner quotes doubled.
 * Numbers are written as numbers, so a negative figure stays a figure.
 */

export type CsvValue = string | number | null | undefined

// Leading whitespace (ASCII, no-break, ideographic) is skipped: some apps trim it before parsing.
const FORMULA_START = /^[  　]*[=+\-@＝＋－＠]|^[\t\r\n]/
const NEEDS_QUOTES = /[",\r\n]/

/** One cell, escaped for CSV and safe to open in a spreadsheet. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Rows of cells as CSV text, CRLF between rows (RFC 4180) and after the last. */
export function toCsv(rows: readonly (readonly CsvValue[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
