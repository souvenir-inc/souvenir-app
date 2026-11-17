'use client'

import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ArrowDownOneIcon, TickTwoIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { Dropdown } from '@/components/Dropdown'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { leaveProjectApi, type ApiProjectMember } from '@/lib/api/projects'
import { projectMembersQuery } from '@/lib/projects/project-queries'

// Same Radix dialog shell as ConfirmModal/LeaveWorkspaceModal. Needs
// its own component: the owner's exit branches into a successor picker OR an
// archive/convert-to-personal choice depending on whether anyone else is
// still on the project — neither existing modal has a slot for that.
// The successor picker's menu portals to document.body — a click in it isn't a click outside the dialog.
const isInDropdown = (t: EventTarget | null) => t instanceof Element && !!t.closest('[data-kds-dropdown-panel]')

type AloneAction = 'archive' | 'convertPersonal'

export interface LeaveProjectModalProps {
  projectId:     string
  isOwner:       boolean
  currentUserId: string
  onClose:       () => void
  /** Called after a successful leave — refresh the caller's project list/state. */
  onLeft:        () => void
}

export function LeaveProjectModal({ projectId, isOwner, currentUserId, onClose, onLeft }: LeaveProjectModalProps) {
  const queryClient = useQueryClient()
  const [loadingMembers, setLoadingMembers] = useState(isOwner)
  const [others,         setOthers]         = useState<ApiProjectMember[]>([])
  // Distinct from "loaded, zero others" — a failed fetch must never be read
  // as "you're alone", or the owner could archive/convert a project that
  // actually still has other collaborators on it, based on a network error
  // rather than the real membership.
  const [membersLoadFailed, setMembersLoadFailed] = useState(false)
  const [loadAttempt,    setLoadAttempt]    = useState(0)
  const [submitting,     setSubmitting]     = useState(false)
  const [successorMenuOpen, setSuccessorMenuOpen] = useState(false)
  const [successorId,       setSuccessorId]       = useState<string | null>(null)
  const [aloneAction,       setAloneAction]       = useState<AloneAction | null>(null)

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    setLoadingMembers(true)
    setMembersLoadFailed(false)
    queryClient.fetchQuery({ ...projectMembersQuery(projectId), staleTime: 0 })
      .then(members => {
        if (cancelled) return
        setOthers(members.filter(m => m.userId !== currentUserId))
      })
      .catch(() => {
        if (cancelled) return
        setMembersLoadFailed(true)
        toast.error("Couldn't load project members")
      })
      .finally(() => { if (!cancelled) setLoadingMembers(false) })
    return () => { cancelled = true }
  }, [isOwner, projectId, currentUserId, loadAttempt, queryClient])

  const hasOthers = others.length > 0
  const selectedSuccessor = others.find(m => m.userId === successorId) ?? null
  const canConfirm = !isOwner || (!membersLoadFailed && (hasOthers ? !!successorId : !!aloneAction))

  const handleLeave = async () => {
    if (!canConfirm) return
    setSubmitting(true)
    try {
      if (!isOwner) {
        await leaveProjectApi(projectId, {})
      } else if (hasOthers) {
        await leaveProjectApi(projectId, { successorUserId: successorId! })
      } else {
        await leaveProjectApi(projectId, { aloneAction: aloneAction! })
      }
      toast.success(isOwner ? 'Ownership handled — you left the project.' : 'You left the project.')
      onLeft()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to leave project')
      setSubmitting(false)
    }
  }

  const description = !isOwner
    ? "You'll lose access to this project."
    : loadingMembers
      ? 'Checking who else is on this project…'
      : membersLoadFailed
        ? "Couldn't check who else is on this project."
        : hasOthers
          ? 'Pick who takes over as owner before you leave.'
          : "You're the only one on this project — archive it or convert it to a personal project first."


  return (
    <Dialog open onOpenChange={(next) => { if (!next && !submitting) onClose() }}>
      <DialogContent
        hideClose
        role="alertdialog"
        aria-modal="true"
        onEscapeKeyDown={(e) => { if (submitting || successorMenuOpen) e.preventDefault() }}
        onInteractOutside={(e) => { if (submitting || isInDropdown(e.target)) e.preventDefault() }}
        style={{ width: 420, padding: 'var(--space-6)', gap: 'var(--space-5)' }}
      >
        <div>
          <DialogTitle>Leave project?</DialogTitle>
          <DialogDescription style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-500)', margin: 'var(--space-2) 0 0' }}>
            {description}
          </DialogDescription>
        </div>

        {isOwner && loadingMembers && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-3)' }}>
            <Spinner size={20} />
          </div>
        )}

        {isOwner && !loadingMembers && membersLoadFailed && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Button variant="secondary" size="sm" onClick={() => setLoadAttempt(a => a + 1)}>
              Try again
            </Button>
          </div>
        )}

        {isOwner && !loadingMembers && !membersLoadFailed && hasOthers && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body-sm)', lineHeight: '18px', color: 'var(--neutral-700)', margin: 0 }}>
              New owner
            </p>
            <Dropdown.Float
              open={successorMenuOpen}
              onOpenChange={setSuccessorMenuOpen}
              placement="bottom-start"
              trigger={
                <button
                  type="button"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)',
                    width: '100%', padding: 'var(--space-2) var(--space-2-5)', borderRadius: 'var(--radius-lg)', border: 'none',
                    backgroundColor: 'var(--neutral-white)', boxShadow: '0px 0px 0px 1px rgba(59,54,50,0.3)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', color: 'var(--neutral-900)',
                  }}
                >
                  {selectedSuccessor ? (selectedSuccessor.name || selectedSuccessor.email) : 'Select a member'}
                  <ArrowDownOneIcon size={16} color="var(--neutral-400)" />
                </button>
              }
            >
              <Dropdown size="md">
                <Dropdown.Section fluid>
                  {others.map(m => (
                    <Dropdown.Item
                      key={m.userId}
                      label={m.name || m.email || m.userId}
                      subLabel={m.name ? (m.email ?? undefined) : undefined}
                      selected={m.userId === successorId}
                      rightIcon={m.userId === successorId ? <TickTwoIcon size={16} /> : undefined}
                      onClick={() => { setSuccessorId(m.userId); setSuccessorMenuOpen(false) }}
                      fluid
                    />
                  ))}
                </Dropdown.Section>
              </Dropdown>
            </Dropdown.Float>
          </div>
        )}

        {isOwner && !loadingMembers && !membersLoadFailed && !hasOthers && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {([
              { value: 'archive' as const, label: 'Archive project', desc: 'Keep it, but make it read-only.' },
              { value: 'convertPersonal' as const, label: 'Convert to personal project', desc: 'Keep working in it, just for you.' },
            ]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAloneAction(opt.value)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)', textAlign: 'left',
                  padding: 'var(--space-2-5) var(--space-3)', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                  border: aloneAction === opt.value ? '1.5px solid var(--neutral-900)' : '1px solid var(--border-default)',
                  backgroundColor: aloneAction === opt.value ? 'var(--neutral-50)' : 'var(--neutral-white)',
                }}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', color: 'var(--neutral-900)' }}>{opt.label}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-small)', color: 'var(--neutral-500)' }}>{opt.desc}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={submitting}
            disabled={!canConfirm || loadingMembers}
            onClick={() => { void handleLeave() }}
          >
            Leave project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default LeaveProjectModal
