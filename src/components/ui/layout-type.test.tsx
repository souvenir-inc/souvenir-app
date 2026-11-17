// @vitest-environment jsdom

// Phase 3 primitives: Text, Heading, Box, Stack, Inline, Grid, Card. Each renders the element asked
// for, maps its props to the token classes, and lets a caller's className win. Also checks that cn()
// understands the token scales (a type size and a text colour must both survive).

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Text, Heading } from '@/components/ui/text'
import { Box, Stack, Inline, Grid } from '@/components/ui/layout'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/ui/card'
import { cn } from '@/lib/utils'

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
  return container.firstElementChild as HTMLElement
}

const classes = (el: Element) => el.className.split(/\s+/)

describe('cn with token scales', () => {
  it('keeps a type size next to a text colour', () => {
    expect(cn('text-body', 'text-[var(--neutral-500)]').split(' ')).toEqual(['text-body', 'text-[var(--neutral-500)]'])
  })
  it('lets a later type size replace an earlier one', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small')
  })
  it('treats semantic spacing as spacing', () => {
    expect(cn('p-2', 'p-inset-md')).toBe('p-inset-md')
  })
  it('merges elevation, duration and z-index tokens', () => {
    expect(cn('shadow-1', 'shadow-3')).toBe('shadow-3')
    expect(cn('duration-200', 'duration-fast')).toBe('duration-fast')
    expect(cn('z-10', 'z-modal')).toBe('z-modal')
  })
})

describe('Text', () => {
  it('defaults to a body paragraph in the default tone', async () => {
    const el = await render(<Text>Hello</Text>)
    expect(el.tagName).toBe('P')
    expect(classes(el)).toEqual(expect.arrayContaining(['m-0', 'text-body', 'text-[var(--neutral-900)]', 'font-normal']))
  })
  it('maps variant, tone, weight, truncate and lineClamp', async () => {
    const el = await render(<Text as="span" variant="small" tone="muted" weight="medium" truncate>x</Text>)
    expect(el.tagName).toBe('SPAN')
    expect(classes(el)).toEqual(expect.arrayContaining(['text-small', 'text-[var(--neutral-500)]', 'font-medium', 'truncate']))
    const clamped = await render(<Text lineClamp={2}>x</Text>)
    expect(classes(clamped)).toContain('line-clamp-2')
  })
  it('uses the code font for the code variant', async () => {
    const el = await render(<Text variant="code">x</Text>)
    expect(classes(el)).toEqual(expect.arrayContaining(['text-code', 'font-[family-name:var(--font-code)]']))
  })
  it("lets the caller's className win", async () => {
    const el = await render(<Text tone="muted" className="text-[var(--blue-600)]">x</Text>)
    expect(classes(el)).toContain('text-[var(--blue-600)]')
    expect(classes(el)).not.toContain('text-[var(--neutral-500)]')
  })
  it('passes htmlFor through on a label', async () => {
    const el = await render(<Text as="label" htmlFor="email">Email</Text>)
    expect(el.tagName).toBe('LABEL')
    expect(el.getAttribute('for')).toBe('email')
  })
})

describe('Heading', () => {
  it('renders the level as the element with its default look', async () => {
    const h1 = await render(<Heading level={1}>Title</Heading>)
    expect(h1.tagName).toBe('H1')
    expect(classes(h1)).toEqual(expect.arrayContaining(['text-heading', 'font-normal']))
    const h3 = await render(<Heading level={3}>Section</Heading>)
    expect(h3.tagName).toBe('H3')
    expect(classes(h3)).toEqual(expect.arrayContaining(['text-heading-sm', 'font-semibold']))
  })
  it('can change the look or the element independently', async () => {
    const el = await render(<Heading level={2} as="p" variant="body-lg" weight="semibold">x</Heading>)
    expect(el.tagName).toBe('P')
    expect(classes(el)).toEqual(expect.arrayContaining(['text-body-lg', 'font-semibold']))
    expect(classes(el)).not.toContain('text-heading-md')
  })
})

describe('Box, Stack, Inline, Grid', () => {
  it('Box maps padding, radius, surface and border', async () => {
    const el = await render(<Box as="section" p="4" px="6" radius="xl" surface="subtle" bordered>x</Box>)
    expect(el.tagName).toBe('SECTION')
    expect(classes(el)).toEqual(expect.arrayContaining(['p-4', 'px-6', 'rounded-xl', 'bg-[var(--neutral-50)]', 'border']))
  })
  it('Stack is a column with the gap and alignment asked for', async () => {
    const el = await render(<Stack gap="3" align="start" justify="between">x</Stack>)
    expect(classes(el)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'gap-3', 'items-start', 'justify-between']))
  })
  it('Inline is a centred row by default and can wrap', async () => {
    const el = await render(<Inline gap="1.5" wrap>x</Inline>)
    expect(classes(el)).toEqual(expect.arrayContaining(['flex', 'flex-row', 'gap-1.5', 'items-center', 'flex-wrap']))
  })
  it('Grid takes a count or per-breakpoint counts', async () => {
    const one = await render(<Grid cols={3} gap="4">x</Grid>)
    expect(classes(one)).toEqual(expect.arrayContaining(['grid', 'grid-cols-3', 'gap-4']))
    const responsive = await render(<Grid cols={{ base: 1, md: 2, lg: 3 }}>x</Grid>)
    expect(classes(responsive)).toEqual(expect.arrayContaining(['grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3']))
  })
})

describe('Card', () => {
  it('defaults to the plain card surface', async () => {
    const el = await render(<Card>x</Card>)
    expect(classes(el)).toEqual(expect.arrayContaining(['rounded-xl', 'bg-[var(--card-bg)]', 'shadow-1', 'p-0']))
  })
  it('maps variants and padding', async () => {
    const raised = await render(<Card variant="raised" padding="md" as="article">x</Card>)
    expect(raised.tagName).toBe('ARTICLE')
    expect(classes(raised)).toEqual(expect.arrayContaining(['shadow-2', 'p-4']))
    const inset = await render(<Card variant="inset">x</Card>)
    expect(classes(inset)).toEqual(expect.arrayContaining(['border', 'shadow-none']))
  })
  it('renders header, body and footer sections', async () => {
    const el = await render(
      <Card>
        <CardHeader>h</CardHeader>
        <CardBody>b</CardBody>
        <CardFooter>f</CardFooter>
      </Card>,
    )
    const [h, b, f] = Array.from(el.children)
    expect(classes(h)).toContain('border-b')
    expect(classes(b)).toContain('flex-col')
    expect(classes(f)).toEqual(expect.arrayContaining(['border-t', 'justify-end']))
  })
})
