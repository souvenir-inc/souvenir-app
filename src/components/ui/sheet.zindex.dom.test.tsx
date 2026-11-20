// @vitest-environment jsdom
//
// The sheet and its overlay stack from one value: a zIndex given through `style` wins on
// the sheet, and the overlay sits just under it rather than under the default.

import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { Sheet, SheetContent } from '@/components/ui/sheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let container: HTMLDivElement
afterEach(() => { act(() => root.unmount()); container.remove() })

describe('SheetContent stacking', () => {
  it('puts the overlay under a zIndex given through style', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
      <Sheet open><SheetContent title="Panel" style={{ zIndex: 10 }}>content</SheetContent></Sheet>,
    ))
    const overlay = document.querySelector('[data-testid="sheet-overlay"]') as HTMLElement
    const content = document.querySelector('[role="dialog"]') as HTMLElement
    expect(content.style.zIndex).toBe('10')
    expect(overlay.style.zIndex).toBe('calc(9)')
  })
})
