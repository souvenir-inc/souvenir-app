// @vitest-environment jsdom

// Phase 4 form primitives: Field wiring (label ↔ control, hint/error ↔ aria-describedby, invalid),
// Textarea (count, rows), RadioGroup and SegmentedControl (radio semantics, selection), Select (trigger).

import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Field, FieldError, FieldHint, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioItem } from '@/components/ui/radio-group'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Select } from '@/components/ui/select'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(node: React.ReactNode) {
  await act(async () => root.render(node))
}

const $ = <T extends Element = HTMLElement>(sel: string) => container.querySelector(sel) as T | null
const $$ = (sel: string) => Array.from(container.querySelectorAll(sel)) as HTMLElement[]

describe('Field + Textarea', () => {
  it('links the label, hint and error to the control and marks it invalid', async () => {
    await render(
      <Field invalid>
        <FieldLabel>Message</FieldLabel>
        <Textarea />
        <FieldHint>Keep it short.</FieldHint>
        <FieldError>Required</FieldError>
      </Field>,
    )
    const textarea = $<HTMLTextAreaElement>('textarea')!
    const label = $<HTMLLabelElement>('label')!
    expect(label.htmlFor).toBe(textarea.id)
    expect(textarea.getAttribute('aria-invalid')).toBe('true')
    const describedBy = textarea.getAttribute('aria-describedby') ?? ''
    const described = describedBy.split(' ').map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual(expect.arrayContaining(['Keep it short.', 'Required']))
    expect($('[role="alert"]')?.textContent).toBe('Required')
  })

  it('renders no error element when there is no message', async () => {
    await render(<Field><FieldLabel>Name</FieldLabel><Textarea /><FieldError>{''}</FieldError></Field>)
    expect($('[role="alert"]')).toBeNull()
  })

  it('shows a live character count with maxLength', async () => {
    function Controlled() {
      const [v, setV] = useState('hi')
      return <Textarea value={v} onChange={(e) => setV(e.target.value)} maxLength={20} showCount />
    }
    await render(<Controlled />)
    expect(container.textContent).toContain('2 / 20')
    expect($<HTMLTextAreaElement>('textarea')!.maxLength).toBe(20)
  })

  it('uses minRows as the starting height', async () => {
    await render(<Textarea minRows={4} />)
    const t = $<HTMLTextAreaElement>('textarea')!
    expect(t.rows).toBe(4)
    expect(t.style.minHeight).toBe(`${4 * 22 + 14}px`)
  })
})

describe('RadioGroup', () => {
  it('renders a radiogroup of radios and reports the chosen value', async () => {
    const onValueChange = vi.fn()
    await render(
      <RadioGroup aria-label="Plan" defaultValue="monthly" onValueChange={onValueChange}>
        <RadioItem value="monthly" label="Monthly" />
        <RadioItem value="yearly" label="Yearly" description="Save 25%" />
      </RadioGroup>,
    )
    expect($('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Plan')
    const radios = $$('[role="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    await act(async () => radios[1].click())
    expect(onValueChange).toHaveBeenCalledWith('yearly')
    expect(container.textContent).toContain('Save 25%')
  })
})

describe('SegmentedControl', () => {
  it('marks the current segment and calls back on a new one', async () => {
    const onValueChange = vi.fn()
    await render(
      <SegmentedControl
        aria-label="Access"
        value="ask"
        onValueChange={onValueChange}
        options={[{ value: 'allow', label: 'Allow' }, { value: 'ask', label: 'Ask' }, { value: 'block', label: 'Block' }]}
      />,
    )
    const radios = $$('[role="radio"]')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
    await act(async () => radios[2].click())
    expect(onValueChange).toHaveBeenCalledWith('block')
  })
})

describe('Select', () => {
  it('shows the chosen label, or the placeholder', async () => {
    const options = [{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'Name' }] as const
    await render(<Select aria-label="Sort" value="name" onValueChange={() => {}} options={options} />)
    const button = $<HTMLButtonElement>('button')!
    expect(button.textContent).toContain('Name')
    // The label joins the accessible name instead of replacing it, so the chosen value
    // is announced too ("Sort: Name"), including when the Select is disabled.
    expect(button.getAttribute('aria-label')).toBeNull()
    expect(button.querySelector('.sr-only')?.textContent).toBe('Sort: ')
    expect(button.textContent).toMatch(/Sort: .*Name/)
    await render(<Select aria-label="Sort" value={undefined} placeholder="Sort by" onValueChange={() => {}} options={options} />)
    expect($<HTMLButtonElement>('button')!.textContent).toContain('Sort by')
  })
})
