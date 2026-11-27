import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from './csv'

describe('csvCell', () => {
  it('leaves plain text and numbers as they are', () => {
    expect(csvCell('Revenue')).toBe('Revenue')
    expect(csvCell('2025-11-08')).toBe('2025-11-08')
    expect(csvCell(6812.4)).toBe('6812.4')
    expect(csvCell(0)).toBe('0')
  })

  it('writes a negative number as a number, not as neutralised text', () => {
    expect(csvCell(-120.5)).toBe('-120.5')
  })

  it('writes nothing for null, undefined and non-finite numbers', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('')
  })

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '=HYPERLINK("http://x","y")', '=cmd|\' /C calc\'!A0'])('neutralises %s', (raw) => {
    expect(csvCell(raw).replace(/^"/, '')).toMatch(/^'/)
  })

  it.each(['＝1+1', '＋1', '－1', '＠SUM(A1)'])('neutralises the full-width form %s', (raw) => {
    expect(csvCell(raw)).toBe(`'${raw}`)
  })

  it('neutralises a cell starting with a tab, CR or LF', () => {
    expect(csvCell('\t=1+1')).toBe("'\t=1+1")
    expect(csvCell('\r=1+1')).toBe(`"'\r=1+1"`)
    expect(csvCell('\n=1+1')).toBe(`"'\n=1+1"`)
  })

  it('neutralises a formula behind leading spaces', () => {
    expect(csvCell('  =1+1')).toBe("'  =1+1")
    expect(csvCell('　＝1+1')).toBe("'　＝1+1")
  })

  it('keeps a sign in the middle of text', () => {
    expect(csvCell('Email & SMS - weekly')).toBe('Email & SMS - weekly')
    expect(csvCell('a=b')).toBe('a=b')
  })

  it('quotes a cell with a comma, a quote, CR or LF, doubling inner quotes', () => {
    expect(csvCell('Revenue, previous 7 days')).toBe('"Revenue, previous 7 days"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('line\rbreak')).toBe('"line\rbreak"')
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"')
  })

  it('neutralises and quotes together', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
  })
})

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF, ending with one', () => {
    expect(toCsv([['Date', 'Revenue'], ['2025-11-08', 6100], [], ['-x', null]])).toBe("Date,Revenue\r\n2025-11-08,6100\r\n\r\n'-x,\r\n")
  })
})
