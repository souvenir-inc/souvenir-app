'use client'

import React, { useState } from 'react'
import { PlusSignIcon, SearchOneIcon, CancelOneIcon } from '@strange-huge/icons'
import { Button, IconButton } from '@/components/ui/button'
import { InputField } from '@/components/InputField'
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import { ScheduleCard, type ScheduleCardProps } from './ScheduleCard'
import { useMobile } from '@/hooks/use-mobile'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScheduleListItem = Omit<ScheduleCardProps, 'onClick'>

/** Your own schedules, or every schedule in your organization. */
export type ScheduleScope = 'mine' | 'organization'

export interface ScheduleListViewProps {
  schedules:          ScheduleListItem[]
  scope:              ScheduleScope
  onScopeChange:      (scope: ScheduleScope) => void
  onScheduleClick?:   (id: string) => void
  onCreateNew?:       () => void
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onCreateNew }: { onCreateNew?: () => void }) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            'var(--space-6)',
      padding:        'var(--space-9) var(--space-6)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', alignItems: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-title)',
          fontWeight: 'var(--font-weight-regular)',
          fontSize:   'var(--font-size-heading)',
          lineHeight: 'var(--line-height-heading)',
          color:      'var(--legacy-1a1916)',
          margin:     0,
          whiteSpace: 'nowrap',
        }}>
          No schedules yet
        </p>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-regular)',
          fontSize:   'var(--font-size-body-lg)',
          lineHeight: 'var(--line-height-body)',
          color:      'var(--legacy-1a1916)',
          textAlign:  'center',
          maxWidth:   427,
          margin:     0,
        }}>
          Create a schedule to run a task automatically on a cadence.
        </p>
      </div>
      <Button
        variant="default"
        size="sm"
        leftIcon={<PlusSignIcon size={16} />}
        onClick={onCreateNew}
      >
        Create schedule
      </Button>
    </div>
  )
}

// ── ScheduleListView ──────────────────────────────────────────────────────────

export function ScheduleListView({
  schedules,
  scope,
  onScopeChange,
  onScheduleClick,
  onCreateNew,
}: ScheduleListViewProps) {
  const isEmpty = schedules.length === 0
  const [searchOpen, setSearchOpen] = useState(false)
  // One column on phones — two would clip the cards' dates and status badges.
  const isMobile = useMobile()
  const [query, setQuery] = useState('')

  const trimmedQuery = query.trim().toLowerCase()
  const visibleSchedules = trimmedQuery
    ? schedules.filter(s =>
        s.name.toLowerCase().includes(trimmedQuery)
        || (s.description ?? '').toLowerCase().includes(trimmedQuery),
      )
    : schedules
  const noSearchResults = !isEmpty && trimmedQuery !== '' && visibleSchedules.length === 0

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           'var(--space-6)',
      padding:       'var(--space-7) 0',
      width:         '100%',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <h2 style={{
            margin:     0,
            fontFamily: 'var(--font-title)',
            fontSize:   'var(--font-size-heading)',
            fontWeight: 'var(--font-weight-regular)',
            lineHeight: 'var(--line-height-heading)',
            color:      'var(--neutral-900)',
          }}>
            Schedules
          </h2>
          <p style={{
            margin:     'var(--space-1) 0 0',
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-regular)',
            fontSize:   'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            color:      'var(--neutral-500)',
          }}>
            {scope === 'organization'
              ? 'Everyone in your organization can see these. Copy one to run it as your own.'
              : 'Automated tasks that run on your behalf'}
          </p>
        </div>
        {!isEmpty && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: isMobile ? '1 1 100%' : '0 0 auto', minWidth: 0 }}>
            {searchOpen && (
              <div style={{ flex: '1 1 160px', minWidth: 0, maxWidth: isMobile ? undefined : 220 }}>
                <InputField
                  label="Search schedules"
                  showLabel={false}
                  value={query}
                  onChange={setQuery}
                  placeholder="Search schedules…"
                  leftIcon={<SearchOneIcon size={16} />}
                  size="small"
                  fluid
                  autoFocus
                />
              </div>
            )}
            <IconButton
              variant={searchOpen ? 'secondary' : 'outline'}
              size="sm"
              icon={searchOpen ? <CancelOneIcon size={16} /> : <SearchOneIcon size={16} />}
              aria-label={searchOpen ? 'Close search' : 'Search schedules'}
              onClick={() => {
                setSearchOpen(open => !open)
                setQuery('')
              }}
            />
            <Button
              variant="default"
              size="sm"
              leftIcon={<PlusSignIcon size={16} />}
              onClick={onCreateNew}
            >
              New schedule
            </Button>
          </div>
        )}
      </div>

      <div style={{ width: 240 }}>
        <Tabs value={scope} onValueChange={(value) => onScopeChange(value as ScheduleScope)}>
          <TabsList fluid size="small">
            <TabsTrigger value="mine">Mine</TabsTrigger>
            <TabsTrigger value="organization">Organization</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isEmpty ? (
        <EmptyState onCreateNew={onCreateNew} />
      ) : noSearchResults ? (
        <p style={{
          margin:     0,
          padding:    'var(--space-9) var(--space-6)',
          textAlign:  'center',
          fontFamily: 'var(--font-body)',
          fontSize:   'var(--font-size-body)',
          lineHeight: 'var(--line-height-body)',
          color:      'var(--neutral-500)',
        }}>
          No schedules match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <>
          {/* Schedule grid */}
          <div style={{
            display:             'grid',
            gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))',
            gap:                 'var(--space-6)',
          }}>
            {visibleSchedules.map(s => (
              <ScheduleCard
                key={s.id}
                {...s}
                onClick={onScheduleClick}
              />
            ))}
          </div>
        </>
      )}

    </div>
  )
}

ScheduleListView.displayName = 'ScheduleListView'
