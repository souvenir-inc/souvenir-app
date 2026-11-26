'use client'

import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useFocusReturn } from './dialog'

// shadcn-shaped Sheet: a Radix Dialog pinned to one screen edge. Radix supplies the focus trap,
// Escape-to-close, outside-click dismissal, focus return to the trigger and the aria wiring; the
// surface itself is unstyled beyond the edge pinning, so callers keep their own look.

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description

const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: 'calc(var(--space-px) * -1)',
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
}

type Side = 'left' | 'right' | 'top' | 'bottom'

const SIDE_STYLE: Record<Side, React.CSSProperties> = {
  left:   { top: 0, left: 0, bottom: 0 },
  right:  { top: 0, right: 0, bottom: 0 },
  top:    { top: 0, left: 0, right: 0 },
  bottom: { bottom: 0, left: 0, right: 0 },
}

export interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: Side
  /** Accessible name. Rendered visually hidden; pass a visible <SheetTitle> in children instead if you have one. */
  title?: string
  /** Scrim colour behind the sheet. */
  overlayColor?: string
  /** z-index of the sheet (a token by default); the overlay sits one below. */
  zIndex?: number | string
}

export function SheetContent({
  side = 'left',
  title,
  overlayColor = 'var(--sheet-color)',
  zIndex = 'var(--z-modal)',
  style,
  children,
  onInteractOutside,
  onCloseAutoFocus,
  ...props
}: SheetContentProps) {
  const { capture, handleCloseAutoFocus } = useFocusReturn(onCloseAutoFocus)
  // One stacking value for both layers: a zIndex given through `style` wins on the sheet,
  // so the overlay sits just under that, not under the default.
  const contentZIndex = style?.zIndex ?? zIndex
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-testid="sheet-overlay"
        style={{ position: 'fixed', inset: 0, zIndex: `calc(${contentZIndex} - 1)`, backgroundColor: overlayColor }}
      />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        style={{ position: 'fixed', outline: 'none', ...SIDE_STYLE[side], ...style, zIndex: contentZIndex }}
        // A click on a toast (its Undo, say) isn't a click outside: the sheet stays open.
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-sonner-toaster]')) event.preventDefault()
          onInteractOutside?.(event)
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        {capture}
        {title !== undefined && (
          <DialogPrimitive.Title style={SR_ONLY}>{title}</DialogPrimitive.Title>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
