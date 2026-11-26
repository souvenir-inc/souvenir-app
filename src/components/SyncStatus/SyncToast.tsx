'use client'

import { TriangleAlert, X } from 'lucide-react'
import { toast } from '@/components/Toast'
import type { Segment } from '@/lib/warehouse/sync'
import { Segments } from './Segments'
import styles from './SyncStatus.module.css'

/** How long an error toast stays: 8 seconds, paused while hovered; × or its action closes it sooner. */
export const ERROR_TOAST_MS = 8_000

/**
 * The sync error toast (design A): one line, white, a red icon, the message, one dark action and ×.
 * "Meta Ads sync failed • Other apps synced", with Reconnect for admins.
 */
export function SyncErrorToast({ id, segments, action }: {
  id: string | number
  segments: Segment[]
  action: { label: string; onClick: () => void } | null
}) {
  return (
    <div className={styles.toast} role="alert">
      <TriangleAlert size={16} strokeWidth={2.25} className={styles.toastIcon} aria-hidden />
      <p className={styles.toastText}><Segments segments={segments} /></p>
      {action && (
        <button type="button" className={styles.toastAction} onClick={() => { toast.dismiss(id); action.onClick() }}>
          {action.label}
        </button>
      )}
      <button type="button" className={styles.bannerClose} aria-label="Close" onClick={() => toast.dismiss(id)}>
        <X size={14} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  )
}

export function showSyncErrorToast(segments: Segment[], action: { label: string; onClick: () => void } | null) {
  toast.custom(id => <SyncErrorToast id={id} segments={segments} action={action} />, { duration: ERROR_TOAST_MS })
}
