'use client'

import React from 'react'
import { cva } from 'class-variance-authority'
import { AlertCircleIcon, AlertTwoIcon, CancelOneIcon, CheckmarkCircleTwoIcon, InformationCircleIcon } from '@strange-huge/icons'
import { cn } from '@/lib/utils'

// Alert: a message about the page or a task that stays on screen until it's resolved or dismissed
// (a toast is the passing kind). The surface is the one toasts and the credit notice already use: the
// --toast-{tone}-* colours, --toast-radius, a soft drop shadow plus a hairline ring in the tone's border.
//
//   <Alert tone="warning" title="Running low on credits" action={<Button size="xs">View usage</Button>}
//     onDismiss={…}>You've used 95% of this month's credits.</Alert>

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const TOKEN: Record<AlertTone, string> = { info: 'info', success: 'success', warning: 'warning', danger: 'error' }

const ICON: Record<AlertTone, React.ComponentType<{ size?: number; color?: string }>> = {
  info:    InformationCircleIcon,
  success: CheckmarkCircleTwoIcon,
  warning: AlertTwoIcon,
  danger:  AlertCircleIcon,
}

const alertVariants = cva('flex items-start gap-2.5 min-w-0 rounded-[var(--toast-radius)] px-3.5 py-2.5', {
  variants: {
    tone: {
      info:    'bg-[var(--toast-info-bg)] text-[var(--toast-info-text)] shadow-[var(--shadow-soft),0px_6px_16px_-4px_var(--neutral-900-10),0px_0px_0px_1px_var(--toast-info-border)]',
      success: 'bg-[var(--toast-success-bg)] text-[var(--toast-success-text)] shadow-[var(--shadow-soft),0px_6px_16px_-4px_var(--neutral-900-10),0px_0px_0px_1px_var(--toast-success-border)]',
      warning: 'bg-[var(--toast-warning-bg)] text-[var(--toast-warning-text)] shadow-[var(--shadow-soft),0px_6px_16px_-4px_var(--neutral-900-10),0px_0px_0px_1px_var(--toast-warning-border)]',
      danger:  'bg-[var(--toast-error-bg)] text-[var(--toast-error-text)] shadow-[var(--shadow-soft),0px_6px_16px_-4px_var(--neutral-900-10),0px_0px_0px_1px_var(--toast-error-border)]',
    },
  },
})

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone
  /** Bold first line. Without it, `children` is the whole message. */
  title?: React.ReactNode
  /** Replace the tone's icon; `false` hides it. */
  icon?: React.ReactElement | false
  /** A button or link on the right (keep it small: Button size="xs"). */
  action?: React.ReactNode
  /** Shows a close button. */
  onDismiss?: () => void
  /**
   * `status` (default) is announced politely; `alert` interrupts the screen reader, so keep it for
   * errors that block what the person is doing.
   */
  urgency?: 'status' | 'alert'
  ref?: React.Ref<HTMLDivElement>
}

export function Alert({ tone = 'info', title, icon, action, onDismiss, urgency = 'status', className, children, ref, ...props }: AlertProps) {
  const Icon = ICON[tone]
  return (
    <div ref={ref} role={urgency} data-tone={TOKEN[tone]} className={cn(alertVariants({ tone }), className)} {...props}>
      {icon !== false && (
        <span aria-hidden className="mt-[var(--space-0-75)] inline-flex shrink-0">
          {icon ?? <Icon size={16} color="currentColor" />}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {title && <p className="m-0 text-body font-medium">{title}</p>}
        {children && <div className={cn('text-body', title ? 'font-normal' : 'font-medium')}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center self-center">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="inline-flex size-6 shrink-0 items-center justify-center self-center rounded-sm border-0 bg-transparent p-0 text-current opacity-70 hover:opacity-100 cursor-pointer outline-2 outline-solid outline-transparent focus-visible:outline-[var(--focus-ring)]"
        >
          <CancelOneIcon size={14} color="currentColor" />
        </button>
      )}
    </div>
  )
}
