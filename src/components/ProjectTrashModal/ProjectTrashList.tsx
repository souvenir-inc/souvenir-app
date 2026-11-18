'use client'

import React, { useEffect, useState } from 'react'
import { DeleteTwoIcon, InformationCircleIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { fetchDeletedProjects, restoreProjectApi, type ApiProjectSummary } from '@/lib/api/projects'

export interface ProjectTrashListProps {
  currentUserId: string
  /** Called after a successful restore — refresh the caller's project list. */
  onRestored:    () => void
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

// Same data logic ProjectTrashModal used to own, lifted out so it can render
// as a plain tab's content on the All Projects page instead of a modal —
// only the fetch/restore behavior and row list carry over; the modal chrome
// (backdrop, header, close button) is gone since a tab needs none of it.
export function ProjectTrashList({ currentUserId, onRestored }: ProjectTrashListProps) {
  const [loading,     setLoading]     = useState(true)
  const [projects,    setProjects]    = useState<ApiProjectSummary[]>([])
  // Distinct from "loaded, zero results" — a failed fetch must never read as
  // "trash is empty", or a real fetch failure would be shown as if there's
  // simply nothing to restore.
  const [loadFailed,  setLoadFailed]  = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadFailed(false)
    fetchDeletedProjects(currentUserId)
      .then(list => { if (!cancelled) setProjects(list) })
      .catch(() => {
        if (cancelled) return
        setLoadFailed(true)
        toast.error("Couldn't load deleted projects")
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [currentUserId, loadAttempt])

  const handleRestore = async (projectId: string) => {
    setRestoringId(projectId)
    try {
      await restoreProjectApi(projectId, currentUserId)
      setProjects(prev => prev.filter(p => p.id !== projectId))
      toast.success('Project restored.')
      onRestored()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore project')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%' }}>
      {/* Info banner — same boxed-hint convention as InviteModal's InfoNote. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', padding: 'var(--space-2-5) var(--space-3)', backgroundColor: 'var(--neutral-100)', borderRadius: 'var(--radius-lg)' }}>
        <InformationCircleIcon size={16} color="var(--neutral-500)" style={{ flexShrink: 0, marginTop: 'var(--space-0-5)' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: '18px', color: 'var(--neutral-700)', margin: 0 }}>
          Workspace and shared projects stay recoverable for 30 days after
          deletion. Personal projects delete instantly and never appear here.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', width: '100%' }}>
        {loading ? (
          [0, 1, 2].map(i => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2-5) var(--space-3)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', opacity: 1 - i * 0.25,
              }}
            >
              <div style={{ flex: '1 0 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
                <div className="kaya-skeleton" style={{ width: '50%', height: 14, borderRadius: 'var(--radius-xs)' }} />
                <div className="kaya-skeleton" style={{ width: '30%', height: 12, borderRadius: 'var(--radius-xs)' }} />
              </div>
              <div className="kaya-skeleton" style={{ width: 64, height: 28, borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
            </div>
          ))
        ) : loadFailed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-6)' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', color: 'var(--neutral-400)', textAlign: 'center', margin: 0 }}>
              Couldn't load recently deleted projects.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setLoadAttempt(a => a + 1)}>
              Try again
            </Button>
          </div>
        ) : projects.length === 0 ? (
          // Same icon-square + title + subtext convention as AgentsPanelContent's
          // and ProjectMembersPanel's own empty states, for a consistent look
          // across this app's panel/tab empty states.
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-9) var(--space-6)', textAlign: 'center' }}>
            <div
              aria-hidden
              style={{
                width: 48, height: 48, borderRadius: 'var(--radius-xl)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'var(--neutral-100)',
              }}
            >
              <DeleteTwoIcon size={22} color="var(--neutral-400)" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <p style={{ margin: 0, fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-heading-sm)', lineHeight: 'var(--line-height-heading-sm)', color: 'var(--neutral-900)' }}>
                Nothing here
              </p>
              <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body-sm)', color: 'var(--neutral-500)' }}>
                No projects have been deleted recently.
              </p>
            </div>
          </div>
        ) : (
          projects.map(p => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2-5) var(--space-3)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)',
              }}
            >
              <div style={{ flex: '1 0 0', minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)', color: 'var(--neutral-900)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-small)', color: 'var(--neutral-500)', margin: 0 }}>
                  Last updated {fmtRelative(p.updatedAt)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={restoringId === p.id}
                onClick={() => { void handleRestore(p.id) }}
              >
                Restore
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ProjectTrashList
