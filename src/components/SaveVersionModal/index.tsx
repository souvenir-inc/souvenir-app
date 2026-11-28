'use client'

import React, { useState } from 'react'
import { CancelOneIcon } from '@strange-huge/icons'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

// ── Available change tags ────────────────────────────────────────────────────

export const ALL_CHANGE_TAGS = ['Instructions', 'Model', 'Profile', 'Knowledge', 'Connectors'] as const
export type ChangeTag = (typeof ALL_CHANGE_TAGS)[number]

// ── Props ────────────────────────────────────────────────────────────────────

export interface SaveVersionModalProps {
  open: boolean
  /** Tags that are pre-selected when the modal opens. */
  initialTags?: string[]
  /** Shows a loading spinner on the Save button while true. */
  isSaving?: boolean
  /** Called with the chosen tags when user clicks "Save version". Empty array = skipped. */
  onSave: (tags: string[]) => void
  /** Called when the user cancels (backdrop click, Escape, X icon). Does NOT trigger a save. */
  onClose: () => void
}

// ── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:         'flex',
        alignItems:      'center',
        padding:         'var(--space-1-5) var(--space-3)',
        borderRadius:    'var(--radius-full)',
        border:          selected ? '1px solid var(--blue-400)' : '1px solid var(--border-default)',
        backgroundColor: selected
          ? 'var(--blue-50)'
          : hovered
          ? 'var(--neutral-50)'
          : 'transparent',
        boxShadow:       selected ? '0px 0px 0px 1px var(--blue-200)' : 'none',
        cursor:          'pointer',
        fontFamily:      'var(--font-body)',
        fontWeight:      'var(--font-weight-medium)',
        fontSize:        'var(--font-size-body)',
        lineHeight:      'var(--line-height-body)',
        color:           selected ? 'var(--blue-700)' : 'var(--neutral-600)',
        transition:      'background-color var(--duration-instant), border-color var(--duration-instant), box-shadow var(--duration-instant), color var(--duration-instant)',
        userSelect:      'none',
      }}
    >
      {label}
    </button>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function SaveVersionModal({
  open,
  initialTags = [],
  isSaving    = false,
  onSave,
  onClose,
}: SaveVersionModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTags))
  // Re-seed the selection whenever the modal opens or its initial tags change
  // (adjusting state during render, keyed on the serialised tags).
  const initialTagsKey = initialTags.slice().sort().join(',')
  const seedKey = open ? initialTagsKey : null
  const [seededFor, setSeededFor] = useState<string | null>(seedKey)
  if (seededFor !== seedKey) {
    setSeededFor(seedKey)
    if (open) setSelected(new Set(initialTags))
  }

  function toggleTag(tag: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent
        hideClose
        // While the save runs, Esc and outside clicks wait for it.
        onEscapeKeyDown={e => { if (isSaving) e.preventDefault() }}
        onInteractOutside={e => { if (isSaving) e.preventDefault() }}
        className="flex flex-col gap-4 p-5"
        style={{
          width:           400,
          background:      'var(--modal-bg)',
          borderRadius:    'var(--radius-2xl)',
          boxShadow:       '0px 12px 16px -4px var(--neutral-500-12), var(--shadow-soft), 0px 0px 0px 1px var(--neutral-100)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            {/* style={undefined} drops the shell's default title/description type so these classes apply. */}
            <DialogTitle style={undefined} className="m-0 font-[family-name:var(--font-title)] text-xl font-normal leading-7 text-[var(--legacy-1a1916)]">
              What changed?
            </DialogTitle>
            <DialogDescription style={undefined} className="m-0 font-[family-name:var(--font-body)] text-sm font-normal leading-[var(--line-height-body)] text-[var(--neutral-500)]">
              Tag this version to track what you updated.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <IconButton variant="outline" size="md" icon={<CancelOneIcon size={20} />} aria-label="Cancel" />
          </DialogClose>
        </div>

        {/* Tag chips */}
        <div className="flex flex-wrap gap-2">
          {ALL_CHANGE_TAGS.map(tag => (
            <TagChip
              key={tag}
              label={tag}
              selected={selected.has(tag)}
              onToggle={() => toggleTag(tag)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--neutral-100)] pt-1">
          <Button variant="ghost" size="sm" disabled={isSaving} onClick={() => onSave([])}>
            Skip
          </Button>
          <Button variant="save" size="sm" loading={isSaving} disabled={isSaving} onClick={() => onSave([...selected])}>
            {isSaving ? 'Saving…' : 'Save version'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
