// @vitest-environment jsdom

// Phase 5 primitives: Alert, Meter, EmptyState, Table, Collapsible, Kbd, TextLink, Icon, ScrollArea —
// roles and accessible names, the props that change behaviour, and the token classes they map to.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Alert } from '@/components/ui/alert'
import { Meter, meterToneFor } from '@/components/ui/meter'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Kbd } from '@/components/ui/kbd'
import { TextLink } from '@/components/ui/link'
import { Icon } from '@/components/ui/icon'
import { ScrollArea } from '@/components/ui/scroll-area'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

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

describe('Alert', () => {
  it('is a polite status by default and an alert when urgent', async () => {
    await render(<Alert tone="warning" title="Low credits">Top up soon.</Alert>)
    expect($('[role="status"]')?.textContent).toContain('Low credits')
    await render(<Alert tone="danger" urgency="alert">Out of credits</Alert>)
    expect($('[role="alert"]')?.getAttribute('data-tone')).toBe('error')
  })
  it('uses the toast tokens for its tone', async () => {
    await render(<Alert tone="success">Saved</Alert>)
    expect($('[role="status"]')!.className).toContain('bg-[var(--toast-success-bg)]')
  })
  it('shows a dismiss button only with onDismiss', async () => {
    await render(<Alert>Info</Alert>)
    expect($('button')).toBeNull()
    const onDismiss = vi.fn()
    await render(<Alert onDismiss={onDismiss}>Info</Alert>)
    await act(async () => $<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click())
    expect(onDismiss).toHaveBeenCalled()
  })
})

describe('Meter', () => {
  it('exposes a labelled progressbar with clamped values', async () => {
    await render(<Meter label="Credits used" value={150} max={100} />)
    const bar = $('[role="progressbar"]')!
    expect(bar.getAttribute('aria-label')).toBe('Credits used')
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('100%')
  })
  it('colours the auto tone by how full it is', () => {
    expect(meterToneFor(0.3)).toBe('success')
    expect(meterToneFor(0.6)).toBe('warning')
    expect(meterToneFor(0.9)).toBe('danger')
  })
  it('shows caption and trailing text', async () => {
    await render(<Meter label="x" value={1} caption="1 of 10" trailing="10%" />)
    expect(container.textContent).toContain('1 of 10')
    expect(container.textContent).toContain('10%')
  })
})

describe('EmptyState', () => {
  it('renders title, description and action', async () => {
    await render(<EmptyState title="No files yet" description="Upload one." action={<button>Upload</button>} role="status" />)
    expect($('[role="status"]')?.textContent).toContain('No files yet')
    expect(container.textContent).toContain('Upload one.')
    expect($('button')?.textContent).toBe('Upload')
  })
})

describe('Table', () => {
  it('renders table semantics with column headers and an empty row', async () => {
    await render(
      <Table aria-label="Members">
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead align="end">Role</TableHead></TableRow></TableHeader>
        <TableBody><TableEmpty colSpan={2}>No members</TableEmpty></TableBody>
      </Table>,
    )
    expect($('table')?.getAttribute('aria-label')).toBe('Members')
    const heads = Array.from(container.querySelectorAll('th'))
    expect(heads.map((h) => h.getAttribute('scope'))).toEqual(['col', 'col'])
    expect(heads[1].className).toContain('text-end')
    expect($<HTMLTableCellElement>('td')!.colSpan).toBe(2)
  })
  it('aligns cells', async () => {
    await render(<Table><TableBody><TableRow><TableCell align="center">x</TableCell></TableRow></TableBody></Table>)
    expect($('td')!.className).toContain('text-center')
  })
})

describe('Collapsible', () => {
  it('toggles aria-expanded and the panel', async () => {
    await render(
      <Collapsible>
        <CollapsibleTrigger>Advanced</CollapsibleTrigger>
        <CollapsiblePanel>Hidden content</CollapsiblePanel>
      </Collapsible>,
    )
    const trigger = $<HTMLButtonElement>('button')!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await act(async () => trigger.click())
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Hidden content')
  })
})

describe('Kbd, TextLink, Icon, ScrollArea', () => {
  it('Kbd renders a kbd element on the shortcut tokens', async () => {
    await render(<Kbd>⌘ K</Kbd>)
    expect($('kbd')?.className).toContain('bg-[var(--shortcut-pill-bg)]')
  })
  it('TextLink opens external links safely in a new tab', async () => {
    await render(<TextLink href="https://example.com" external>Docs</TextLink>)
    const a = $<HTMLAnchorElement>('a')!
    expect(a.target).toBe('_blank')
    expect(a.rel).toBe('noreferrer')
    expect(a.textContent).toContain('opens in a new tab')
  })
  it('TextLink keeps in-app links in the tab', async () => {
    await render(<TextLink href="/settings">Settings</TextLink>)
    expect($<HTMLAnchorElement>('a')!.getAttribute('target')).toBeNull()
  })
  it('Icon is decorative unless labelled', async () => {
    const Glyph = ({ size }: { size?: number }) => <svg data-size={size} />
    await render(<Icon as={Glyph} size={20} />)
    expect($('span')?.getAttribute('aria-hidden')).toBe('true')
    expect($('svg')?.getAttribute('data-size')).toBe('20')
    await render(<Icon as={Glyph} label="Failed" tone="danger" />)
    expect($('[role="img"]')?.getAttribute('aria-label')).toBe('Failed')
  })
  it('ScrollArea uses the shared scrollbar and the orientation asked for', async () => {
    await render(<ScrollArea orientation="horizontal">x</ScrollArea>)
    expect($('div')!.className).toEqual(expect.stringContaining('kaya-scrollbar'))
    expect($('div')!.className).toEqual(expect.stringContaining('overflow-x-auto'))
  })
})
