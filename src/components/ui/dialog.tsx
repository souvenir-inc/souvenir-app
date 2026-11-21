'use client'

import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { CancelOneIcon } from '@strange-huge/icons'
import { cn } from '@/lib/utils'
import styles from './dialog.module.css'

// shadcn-shaped Dialog on Radix (focus trap, Escape, focus return, aria wiring), restyled with this
// app's tokens so it matches ConfirmModal's surface (white card, 16px radius, same shadow, same overlay).
// There was no shared dialog primitive before; ConfirmModal stays for plain confirm/cancel prompts.

const SHADOW_MODAL = 'var(--shadow-4)'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

/**
 * Radix's modal Dialog only returns focus to a `DialogTrigger`; most dialogs here are opened
 * from state (a button's onClick, a menu item) without one, so focus fell back to <body> on close.
 * `useFocusReturn` remembers the element that had focus when the content mounted (captured in a
 * layout effect, before Radix's FocusScope moves focus inside) and refocuses it on close, unless
 * the caller's own onCloseAutoFocus prevented the default or that element has left the DOM.
 */
export function useFocusReturn(onCloseAutoFocus?: (event: Event) => void) {
  const returnTo = React.useRef<HTMLElement | null>(null)
  const capture = <FocusReturnCapture returnToRef={returnTo} />
  const handleCloseAutoFocus = (event: Event) => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return
    const el = returnTo.current
    returnTo.current = null
    if (el && el.isConnected && el !== document.body) {
      event.preventDefault()
      el.focus()
    }
  }
  return { capture, handleCloseAutoFocus }
}

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// A dialog opened from a dropdown menu item mounts while that item still has focus, but the
// menu (and the item) unmounts right after. Walk up to the menu's trigger instead (Radix labels
// menu content with its trigger's id; a submenu's trigger lives in the parent menu).
function resolveReturnTarget(active: Element | null): HTMLElement | null {
  let el = active
  for (let i = 0; i < 5 && el; i++) {
    const menu = el.closest('[data-radix-menu-content]')
    if (!menu) break
    const triggerId = menu.getAttribute('aria-labelledby')
    el = triggerId ? document.getElementById(triggerId) : null
  }
  if (!(el instanceof HTMLElement)) return null
  return el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE)
}

// The last element focused outside any dialog. A field with `autoFocus` inside the dialog takes
// focus during React's commit, before the capture below runs, so that element is the fallback.
const focusOutsideDialog: { last: Element | null } = { last: null }
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => {
    const target = event.target
    if (target instanceof Element && !target.closest('[role="dialog"], [role="alertdialog"]')) {
      focusOutsideDialog.last = target
    }
  }, true)
}

function FocusReturnCapture({ returnToRef }: { returnToRef: React.RefObject<HTMLElement | null> }) {
  const markerRef = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    const content = markerRef.current?.closest('[role="dialog"], [role="alertdialog"]')
    const active = document.activeElement
    returnToRef.current = resolveReturnTarget(content && active && content.contains(active) ? focusOutsideDialog.last : active)
  }, [returnToRef])
  return <span ref={markerRef} hidden />
}

const WIDTHS = { sm: 400, md: 520, lg: 680 } as const

// On the z-index scale (src/styles/tokens): the backdrop at --z-overlay, the dialog at --z-modal,
// below dropdowns (--z-popover), toasts (--z-toast) and tooltips (--z-tooltip). Menus and tooltips
// opened from inside a dialog portal to <body> and must paint above it.
const DIALOG_Z = 'var(--z-modal)'
const DIALOG_OVERLAY_Z = 'var(--z-overlay)'

export interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, 'title'> {
  /** sm = confirm prompts, md = forms and sharing, lg = the file picker. */
  size?: keyof typeof WIDTHS
  /** Hide the corner close button (the footer offers Cancel/Done instead). */
  hideClose?: boolean
  /** Drop the card styling (width, background, radius, shadow, centring) so a bespoke shell can
   *  style the content itself; focus handling, layering and the overlay stay. Implies hideClose. */
  bare?: boolean
  /** Render the dimmed backdrop. Off for full-screen content that paints its own (the image lightbox). */
  overlay?: boolean
}

export function DialogContent({ size = 'md', hideClose = false, bare = false, overlay = true, className, style, children, onInteractOutside, onCloseAutoFocus, ...props }: DialogContentProps) {
  const { capture, handleCloseAutoFocus } = useFocusReturn(onCloseAutoFocus)
  return (
    <DialogPrimitive.Portal>
      {/* Always rendered: Radix locks background scrolling from the overlay. overlay={false}
          only makes it invisible, for content that paints its own backdrop. */}
      <DialogPrimitive.Overlay
        className={overlay ? styles.overlay : undefined}
        style={{
          position: 'fixed', inset: 0, zIndex: DIALOG_OVERLAY_Z,
          ...(overlay ? { background: 'var(--overlay-bg)', backdropFilter: 'blur(2px)' } : { background: 'transparent' }),
        }}
      />
      <DialogPrimitive.Content
        className={bare ? className : cn(styles.content, className)}
        style={bare ? { zIndex: DIALOG_Z, outline: 'none', ...style } : {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: DIALOG_Z,
          width: WIDTHS[size],
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100dvh - 32px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--neutral-white)',
          borderRadius: 16,
          boxShadow: SHADOW_MODAL,
          outline: 'none',
          overflow: 'hidden',
          ...style,
        }}
        // A click on a toast (its Undo, say) isn't a click outside: the dialog stays open.
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-sonner-toaster]')) event.preventDefault()
          onInteractOutside?.(event)
        }}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      >
        {capture}
        {children}
        {!hideClose && !bare && (
          <DialogPrimitive.Close
            aria-label="Close"
            style={{
              position: 'absolute', top: 14, right: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 8, cursor: 'pointer',
              color: 'var(--neutral-500)',
            }}
          >
            <CancelOneIcon size={14} />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '24px 24px 0', paddingRight: 56 }} {...props}>
      {children}
    </div>
  )
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
}

// With asChild the child element owns its look, so the default text style is left off.
// visuallyHidden keeps the title for screen readers when the dialog shows no visible heading.
export function DialogTitle({ children, visuallyHidden = false, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & { visuallyHidden?: boolean }) {
  return (
    <DialogPrimitive.Title
      style={visuallyHidden ? SR_ONLY : props.asChild ? undefined : { margin: 0, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 16, lineHeight: '24px', color: 'var(--neutral-900)' }}
      {...props}
    >
      {children}
    </DialogPrimitive.Title>
  )
}

export function DialogDescription({ children, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      style={props.asChild ? undefined : { margin: 0, fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14, lineHeight: '22px', color: 'var(--neutral-500)' }}
      {...props}
    >
      {children}
    </DialogPrimitive.Description>
  )
}

export function DialogBody({ children, className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} style={{ padding: '16px 24px', overflowY: 'auto', minHeight: 0, ...style }} {...props}>
      {children}
    </div>
  )
}

export function DialogFooter({ children, className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '0 24px 24px', ...style }}
      {...props}
    >
      {children}
    </div>
  )
}
