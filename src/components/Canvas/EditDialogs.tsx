'use client'

import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/ConfirmModal'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

/** Cancel with changes (Figma "Cancel · discard your changes?"): Keep editing, or Discard. */
export function DiscardDialog({ boardName, onDiscard, onClose }: {
  boardName: string
  onDiscard: () => void
  onClose: () => void
}) {
  return (
    <ConfirmModal
      title={`Discard changes to ${boardName}?`}
      description="The board goes back to how it was before you started editing."
      cancelLabel="Keep editing"
      confirmLabel="Discard"
      onConfirm={async () => { onDiscard() }}
      onClose={onClose}
    />
  )
}

/**
 * Leaving edit mode another way with changes (another board, New board; Figma "Unsaved changes · leaving edit mode"):
 * Don't save, or Save. Closing the dialog (Esc, outside) stays in edit mode.
 */
export function UnsavedDialog({ boardName, saving, onSave, onDontSave, onClose }: {
  boardName: string
  saving: boolean
  onSave: () => void
  onDontSave: () => void
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={next => { if (!next && !saving) onClose() }}>
      <DialogContent size="sm" hideClose role="alertdialog" aria-modal="true" style={{ padding: 24, gap: 20 }}>
        <div>
          <DialogTitle>{`Save changes to ${boardName}?`}</DialogTitle>
          <DialogDescription style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14, lineHeight: '22px', color: 'var(--neutral-500)', margin: '8px 0 0' }}>
            You’re leaving edit mode with changes that aren’t saved.
          </DialogDescription>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button variant="secondary" disabled={saving} onClick={onDontSave}>Don’t save</Button>
          <Button loading={saving} onClick={onSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
