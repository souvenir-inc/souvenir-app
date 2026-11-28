import { describe, expect, it } from 'vitest'
import { validateForm } from '@/lib/forms/zod-form'
import { formValuesOf, parseAmount, rowOf, targetFormSchema, type TargetFormValues } from './target-form'

const values = (over: Partial<TargetFormValues> = {}): TargetFormValues =>
  ({ target: '55k', direction: 'up', tolerance: '10', owner: '', note: '', ...over })

describe('parseAmount', () => {
  it('reads what people type', () => {
    expect(parseAmount('55k')).toBe(55_000)
    expect(parseAmount('$1.2M')).toBe(1_200_000)
    expect(parseAmount('1,200')).toBe(1200)
    expect(parseAmount('4.5%')).toBe(4.5)
    expect(parseAmount('3.1x')).toBe(3.1)
    expect(parseAmount('-500')).toBe(-500)
    expect(parseAmount('.5')).toBe(0.5)
  })

  it('refuses what is not a number', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('5k5')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })

  it('stays fast on long adversarial input (RG-10)', () => {
    const started = performance.now()
    parseAmount(`${'1'.repeat(10_000)}a`)
    expect(performance.now() - started).toBeLessThan(50)
  })
})

describe('targetFormSchema', () => {
  it('needs a target and says how to write one', () => {
    expect(validateForm(targetFormSchema, values({ target: '  ' })).errors.target).toBe('Enter a target, like 55k or 4.5.')
    expect(validateForm(targetFormSchema, values({ target: 'lots' })).errors.target).toBe('Enter the target as a number, like 55k or 4.5.')
  })

  it('keeps the tolerance between 0 and 100%', () => {
    expect(validateForm(targetFormSchema, values({ tolerance: '150' })).errors.tolerance).toBe('Enter a tolerance from 0 to 100%.')
    expect(validateForm(targetFormSchema, values({ tolerance: '-1' })).errors.tolerance).toBe('Enter a tolerance from 0 to 100%.')
    expect(validateForm(targetFormSchema, values({ tolerance: 'some' })).errors.tolerance).toBe('Enter the tolerance as a number from 0 to 100.')
    expect(validateForm(targetFormSchema, values({ tolerance: '' })).data?.tolerance).toBe(0)
  })

  it('caps the note', () => {
    expect(validateForm(targetFormSchema, values({ note: 'x'.repeat(501) })).errors.note).toBe('Keep the note to 500 characters.')
  })
})

describe('rows from the form and back', () => {
  it('stores a percent target as a share and a tolerance as a fraction', () => {
    const parsed = targetFormSchema.parse(values({ target: '4.5', direction: 'down', tolerance: '20', owner: 'auth0|maya', note: ' Watch it ' }))
    expect(rowOf('refund_rate', parsed, 'percent')).toEqual({ metric: 'refund_rate', target: 0.045, direction: 'down', tolerance: 0.2, owner: 'auth0|maya', note: 'Watch it' })
  })

  it('keeps money as typed and no owner as null', () => {
    expect(rowOf('revenue', targetFormSchema.parse(values()), 'money')).toMatchObject({ target: 55_000, owner: null })
  })

  it('shows a saved row in the units people typed it in', () => {
    const saved = { metric: 'refund_rate', target: 0.045, direction: 'down' as const, tolerance: 0.05, owner: null, note: 'n' }
    expect(formValuesOf(saved, 'percent', true)).toEqual({ target: '4.5', direction: 'down', tolerance: '5', owner: '', note: 'n' })
  })

  it('starts a new target on the metric’s good direction with a 10% tolerance', () => {
    expect(formValuesOf(null, 'money', false)).toEqual({ target: '', direction: 'down', tolerance: '10', owner: '', note: '' })
  })
})
