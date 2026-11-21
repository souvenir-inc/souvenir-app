'use client'

import React, { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { FolderOneIcon, CancelOneIcon, InformationCircleIcon } from '@strange-huge/icons'
import { cn } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/button'

// ── Shadows ───────────────────────────────────────────────────────────────────

const SHADOW_MODAL        = 'var(--shadow-4)'
const SHADOW_ROW_SELECTED = '0px 0px 0px 1.5px var(--blue-400)'
const SHADOW_ROW_HOVER    = '0px 0px 0px 1px rgba(59,54,50,0.14)'

const EMPTY_PROJECTS: Project[] = []

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Project {
  id:           string
  name:         string
  description?: string
}

export interface MoveToProjectModalProps {
  open:       boolean
  onClose:    () => void
  /** Called with the selected project id when user confirms */
  onConfirm:  (projectId: string) => void
  projects?:  Project[]
  /** How many chats are being moved — shown in the header + warning copy */
  chatCount?: number
  /**
   * True while the caller's `onConfirm` is in flight. Keeps the modal open
   * (rather than the caller hiding it via its own `open` expression) and
   * shows a spinner on "Move to project" instead of the modal just
   * vanishing mid-request.
   */
  loading?:   boolean
  className?: string
}

// ── ProjectRow ────────────────────────────────────────────────────────────────

interface ProjectRowProps {
  project:  Project
  selected: boolean
  onSelect: () => void
}

function ProjectRow({ project, selected, onSelect }: ProjectRowProps) {
  const buttonRef = useRef<HTMLButtonElement>(null)

  const applyHoverStyle = () => {
    if (!buttonRef.current) return
    buttonRef.current.style.backgroundColor = selected ? 'var(--neutral-50)' : 'color-mix(in srgb, var(--neutral-100) 60%, transparent)'
    buttonRef.current.style.boxShadow = selected ? SHADOW_ROW_SELECTED : SHADOW_ROW_HOVER
  }
  const clearHoverStyle = () => {
    if (!buttonRef.current) return
    buttonRef.current.style.backgroundColor = selected ? 'var(--neutral-50)' : 'transparent'
    buttonRef.current.style.boxShadow = selected ? SHADOW_ROW_SELECTED : 'none'
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      onMouseEnter={applyHoverStyle}
      onMouseLeave={clearHoverStyle}
      style={{
        display:         'flex',
        alignItems:      'center',
        gap:             'var(--space-2-5)',
        padding:         'var(--space-2-5) var(--space-3)',
        borderRadius:    'var(--radius-lg)',
        border:          'none',
        width:           '100%',
        textAlign:       'left',
        backgroundColor: selected ? 'var(--neutral-50)' : 'transparent',
        boxShadow:       selected ? SHADOW_ROW_SELECTED : 'none',
        cursor:          'pointer',
        transition:      'background-color var(--duration-fast), box-shadow var(--duration-fast)',
      }}
    >
      {/* Folder icon container */}
      <div style={{
        display:         'inline-flex',
        alignItems:      'center',
        justifyContent:  'center',
        width:           32,
        height:          32,
        borderRadius:    'var(--radius-md)',
        backgroundColor: selected ? 'color-mix(in srgb, var(--info-500) 10%, transparent)' : 'var(--neutral-100)',
        flexShrink:      0,
        transition:      'background-color var(--duration-fast)',
      }}>
        <FolderOneIcon size={16} color={selected ? 'var(--blue-400)' : 'var(--neutral-500)'} variant="static" />
      </div>

      {/* Text */}
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <p style={{
          margin:       0,
          fontFamily:   'var(--font-body)',
          fontSize:     'var(--font-size-body)',
          fontWeight:   'var(--font-weight-medium)',
          lineHeight:   'var(--line-height-body)',
          color:        selected ? 'var(--blue-400)' : 'var(--neutral-800)',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          transition:   'color var(--duration-fast)',
        }}>
          {project.name}
        </p>
        {project.description && (
          <p style={{
            margin:       'var(--space-0-5) 0 0',
            fontFamily:   'var(--font-body)',
            fontSize:     'var(--font-size-caption)',
            fontWeight:   'var(--font-weight-regular)',
            lineHeight:   'var(--line-height-caption)',
            color:        'var(--neutral-400)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            {project.description}
          </p>
        )}
      </div>

      {/* Radio dot */}
      <div style={{
        width:           18,
        height:          18,
        borderRadius:    '50%',
        boxShadow:       selected ? 'none' : '0px 0px 0px 1.5px rgba(59,54,50,0.28)',
        backgroundColor: selected ? 'var(--blue-400)' : 'transparent',
        flexShrink:      0,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        transition:      'background-color var(--duration-fast), box-shadow var(--duration-fast)',
      }}>
        {selected && (
          <div style={{
            width:           7,
            height:          7,
            borderRadius:    '50%',
            backgroundColor: 'var(--neutral-white)',
          }} />
        )}
      </div>
    </button>
  )
}

// ── MoveToProjectModal ────────────────────────────────────────────────────────

export function MoveToProjectModal({
  open,
  onClose,
  onConfirm,
  projects  = EMPTY_PROJECTS,
  chatCount = 1,
  loading   = false,
  className,
}: MoveToProjectModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [atTop,      setAtTop]      = useState(true)
  const [atBottom,   setAtBottom]   = useState(false)

  const handleConfirm = () => {
    if (!selectedId || loading) return
    onConfirm(selectedId)
  }

  const handleClose = () => {
    if (loading) return
    setSelectedId(null)
    onClose()
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setAtTop(el.scrollTop < 8)
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 8)
  }

  const chatLabel = chatCount === 1 ? '1 chat' : `${chatCount} chats`
  const noun      = chatCount === 1 ? 'this chat' : 'these chats'

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent
        hideClose
        aria-label={`Move ${chatLabel} to project`}
        className={cn(className)}
        onEscapeKeyDown={(e) => { if (loading) e.preventDefault() }}
        onInteractOutside={(e) => { if (loading) e.preventDefault() }}
        style={{
          width:      560,
          maxHeight:  'calc(100dvh - 64px)',
          background: 'var(--modal-bg)',
          boxShadow:  SHADOW_MODAL,
        }}
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{
          flexShrink:   0,
          padding:      'var(--space-5) var(--space-5) var(--space-4)',
          borderBottom: '1px solid var(--neutral-100)',
          position:     'relative',
        }}>
          <DialogTitle asChild>
          <p style={{
            margin:     0,
            fontFamily: 'var(--font-title)',
            fontSize:   '1.5rem',
            fontWeight: 'var(--font-weight-regular)',
            lineHeight: '2rem',
            color:      'var(--neutral-900)',
          }}>
            Move to project
          </p>
          </DialogTitle>
          <DialogDescription asChild>
          <p style={{
            margin:     'var(--space-0-5) 0 0',
            fontFamily: 'var(--font-body)',
            fontSize:   'var(--font-size-caption)',
            fontWeight: 'var(--font-weight-regular)',
            lineHeight: 'var(--line-height-caption)',
            color:      'var(--neutral-400)',
          }}>
            Moving {chatLabel}
          </p>
          </DialogDescription>
          <div style={{ position: 'absolute', top: 14, right: 14 }}>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Close"
              icon={<CancelOneIcon size={16} />}
              onClick={handleClose}
              disabled={loading}
            />
          </div>
        </div>

        {/* ── Context card — ModelFeaturedCard default (unselected) style ── */}
        <div style={{
          flexShrink:      0,
          margin:          'var(--space-4) var(--space-4) 0',
          borderRadius:    'var(--radius-xl)',
          position:        'relative',
          overflow:        'hidden',
          backgroundColor: 'var(--neutral-white)',
          boxShadow:       'var(--shadow-model-featured-default-outer)',
        }}>
          {/* Inner depth shadow */}
          <div aria-hidden style={{
            position:      'absolute',
            inset:         0,
            borderRadius:  'inherit',
            boxShadow:     'var(--shadow-model-featured-default-inner)',
            pointerEvents: 'none',
          }} />

          {/* Content */}
          <div style={{
            position:      'relative',
            padding:       'var(--space-3) var(--space-3)',
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)' }}>
              <InformationCircleIcon animated size={16} color="var(--neutral-500)" />
              <p style={{
                margin:     0,
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-medium)',
                fontSize:   'var(--font-size-body)',
                lineHeight: 'var(--line-height-body-sm)',
                color:      'var(--neutral-700)',
              }}>
                {noun.charAt(0).toUpperCase() + noun.slice(1)} will know everything the project knows
              </p>
            </div>
            <p style={{
              margin:     0,
              fontFamily: 'var(--font-body)',
              fontWeight: 'var(--font-weight-regular)',
              fontSize:   'var(--font-size-caption)',
              lineHeight: 'var(--line-height-caption)',
              color:      'var(--neutral-600)',
            }}>
              All of the project&apos;s instructions, uploaded files, and context will be
              automatically available inside {noun} once moved. The AI will use that
              knowledge in every reply.
            </p>
          </div>
        </div>

        {/* ── Project list — the one section that grows/shrinks with the
            modal's own maxHeight; header/context-card/footer stay fixed
            size (flexShrink: 0 above/below) ── */}
        <div style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', padding: 'var(--space-3) var(--space-4) 0', display: 'flex', flexDirection: 'column' }}>
          <div
            role="radiogroup"
            aria-label="Select a project"
            className="kaya-scrollbar"
            onScroll={handleScroll}
            style={{
              display:             'flex',
              flexDirection:       'column',
              gap:                 'var(--space-1)',
              flex:                '1 1 auto',
              minHeight:           0,
              maxHeight:           420,
              overflowY:           'auto',
              overscrollBehaviorY: 'contain',
              padding:             'var(--space-0-5)',
              paddingBottom:       'var(--space-3)',
              opacity:             loading ? 0.5 : 1,
              pointerEvents:       loading ? 'none' : undefined,
              transition:          'opacity var(--duration-fast)',
            }}
          >
            {projects.length === 0 ? (
              <p style={{
                margin:     'var(--space-5) 0',
                textAlign:  'center',
                fontFamily: 'var(--font-body)',
                fontSize:   'var(--font-size-body)',
                color:      'var(--neutral-400)',
              }}>
                No projects yet
              </p>
            ) : (
              projects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  selected={selectedId === project.id}
                  onSelect={() => setSelectedId(project.id)}
                />
              ))
            )}
          </div>

          {/* Top/bottom scroll-edge fade — plain gradient, no backdrop
              blur (the blurred layers made the rows right underneath
              the edge unreadable while scrolling). */}
          <div aria-hidden style={{
            position:      'absolute',
            top: 12, left: 16, right: 16,
            height:        '32px',
            background:    'linear-gradient(to bottom, var(--neutral-white) 0%, transparent 100%)',
            pointerEvents: 'none',
            zIndex:        'calc(var(--z-raised) + 1)',
            opacity:       atTop ? 0 : 1,
            transition:    'opacity var(--duration-fast) ease',
          }} />

          <div aria-hidden style={{
            position:      'absolute',
            bottom: 0, left: 16, right: 16,
            height:        '32px',
            background:    'linear-gradient(to top, var(--neutral-white) 0%, transparent 100%)',
            pointerEvents: 'none',
            zIndex:        'calc(var(--z-raised) + 1)',
            opacity:       atBottom ? 0 : 1,
            transition:    'opacity var(--duration-fast) ease',
          }} />
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div style={{
          flexShrink:     0,
          display:        'flex',
          justifyContent: 'flex-end',
          alignItems:     'center',
          gap:            'var(--space-2)',
          padding:        'var(--space-3) var(--space-4) var(--space-4)',
          borderTop:      '1px solid var(--neutral-100)',
        }}>
          <Button variant="cancel" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="default" disabled={!selectedId || loading} loading={loading} onClick={handleConfirm}>
            Move to project
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}

export default MoveToProjectModal
