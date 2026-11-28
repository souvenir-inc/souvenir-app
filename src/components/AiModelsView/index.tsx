'use client'

// /settings/ai. Data and filters: use-model-catalog.ts; presentational parts: parts.tsx.

import React from 'react'
import { SearchOneIcon } from '@strange-huge/icons'
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs'
import { useAuth } from '@/context/auth-context'
import { Button } from '@/components/ui/button'

// ── Helpers ───────────────────────────────────────────────────────────────────


type PlanTier = 'standard' | 'pro' | 'power'
type BadgeColor = 'blue' | 'neutral' | 'red' | 'green' | 'brown' | 'purple'
import { useModelCatalog } from './use-model-catalog'
import { MiniChip, SkeletonSection, ProviderSection } from './parts'

export { AiModelsLoading } from './parts'

export function AiModelsView() {
  const { user }   = useAuth()
  const planName   = user?.planName ?? 'Starter'

  const {
    models, isLoading, loadFailed, retryLoad, togglingId, toggle: handleToggle,
    tab, setTab, search, setSearch, filteredModels, visibleProviders, totalEnabled,
  } = useModelCatalog()

  return (
    <div
      className="kaya-scrollbar"
      style={{
        flex:           '1 0 0',
        minHeight:      0,
        overflowY:      'auto',
        overflowX:      'hidden',
        display:        'flex',
        alignItems:     'flex-start',
        justifyContent: 'center',
        paddingTop:     'var(--space-10)',
        paddingBottom:  'var(--space-9)',
      }}
    >
      {/* Horizontal padding lives here, not on the scrolling element above —
          keeps the scrollbar flush with the container's edge. */}
      <div style={{ width: '100%', maxWidth: 908, padding: '0 var(--space-6)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 'var(--space-2-5)' }}>

        {/* ── Header ── */}
        <div style={{ paddingLeft: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          <h1 style={{
            fontFamily:   'var(--font-title)',
            fontWeight:   'var(--font-weight-regular)',
            fontSize:     'var(--font-size-heading)',
            lineHeight:   'var(--line-height-heading)',
            color:        'var(--neutral-900)',
            margin:       0,
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
          }}>
            AI &amp; Models
          </h1>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-regular)',
            fontSize:   'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            color:      'var(--neutral-500)',
            margin:     0,
          }}>
            Enable or disable the AI models available across chat, agents, and workflows.
          </p>
        </div>

        {/* ── Search + filter ── */}
        <div style={{
          border:        '1px solid var(--border-default)',
          borderRadius:  'var(--radius-2xl)',
          boxShadow:     'var(--shadow-soft)',
          overflow:      'hidden',
          padding:       'var(--space-3) var(--space-6)',
          display:       'flex',
          alignItems:    'center',
          gap:           'var(--space-6)',
        }}>
          <div style={{
            flex:            '1 0 0',
            minWidth:        0,
            display:         'flex',
            alignItems:      'center',
            gap:             'var(--space-0-5)',
            padding:         'var(--space-1-5) var(--space-2-5)',
            borderRadius:    'var(--radius-lg)',
            backgroundColor: 'var(--text-field-bg)',
            boxShadow:       'var(--shadow-field)',
          }}>
            <SearchOneIcon size={16} color="var(--neutral-400)" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search models by name or provider…"
              style={{
                flex:            '1 0 0',
                minWidth:        0,
                border:          'none',
                outline:         'none',
                backgroundColor: 'transparent',
                fontFamily:      'var(--font-body)',
                fontWeight:      'var(--font-weight-regular)',
                fontSize:        'var(--font-size-body)',
                lineHeight:      'var(--line-height-body)',
                color:           'var(--neutral-900)',
                padding:         '0 var(--space-0-5)',
              }}
            />
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList size="small">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="enabled">Enabled</TabsTrigger>
              <TabsTrigger value="disabled">Disabled</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ── Models card ── */}
        <div style={{
          border:        '1px solid var(--border-default)',
          borderRadius:  'var(--radius-2xl)',
          boxShadow:     'var(--shadow-soft)',
          overflow:      'hidden',
          paddingTop:    'var(--space-3)',
          paddingBottom: 'var(--space-3)',
        }}>
          {/* Card header */}
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          'var(--space-1)',
            padding:      'var(--space-3) var(--space-6) var(--space-6)',
            borderBottom: '1px solid var(--neutral-100)',
          }}>
            <div style={{ flex: '1 0 0', minWidth: 0, display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-medium)',
                fontSize:   'var(--font-size-body-lg)',
                lineHeight: 'var(--line-height-body)',
                color:      'var(--neutral-900)',
                margin:     0,
                whiteSpace: 'nowrap',
              }}>
                {isLoading ? 'Loading models…' : `${models.length} models available`}
              </p>
              {!isLoading && (
                <MiniChip label={`${planName} · ${totalEnabled} enabled`} color="blue" />
              )}
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <>
              <SkeletonSection cardCount={3} />
              <SkeletonSection cardCount={3} />
              <SkeletonSection cardCount={2} />
            </>
          ) : loadFailed && models.length === 0 ? (
            <div role="alert" style={{ padding: 'var(--space-7) var(--space-6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)', margin: 0 }}>
                Couldn&apos;t load your models.
              </p>
              <Button size="sm" onClick={retryLoad}>Try again</Button>
            </div>
          ) : visibleProviders.length === 0 ? (
            <div style={{ padding: 'var(--space-7) var(--space-6)', textAlign: 'center' }}>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 'var(--font-weight-regular)',
                fontSize:   'var(--font-size-body)',
                lineHeight: 'var(--line-height-body)',
                color:      'var(--neutral-400)',
                margin:     0,
              }}>
                {models.length === 0 ? 'No models are available on your plan.' : 'No models match your search.'}
              </p>
            </div>
          ) : (
            visibleProviders.map((provider, i) => (
              <ProviderSection
                key={provider}
                provider={provider}
                displayModels={filteredModels.filter(m => m.model_provider === provider)}
                allProviderModels={models.filter(m => m.model_provider === provider)}
                togglingId={togglingId}
                onToggle={handleToggle}
                divider={i < visibleProviders.length - 1}
              />
            ))
          )}
        </div>

        {/* ── Info card ── */}
        <div style={{
          border:          '1px solid var(--border-default)',
          borderRadius:    'var(--radius-2xl)',
          boxShadow:       'var(--shadow-soft)',
          overflow:        'hidden',
          padding:         'var(--space-3) var(--space-6)',
          backgroundColor: 'var(--neutral-50)',
        }}>
          <p style={{
            fontFamily:   'var(--font-body)',
            fontWeight:   'var(--font-weight-medium)',
            fontSize:     'var(--font-size-body-lg)',
            lineHeight:   'var(--line-height-body)',
            color:        'var(--neutral-900)',
            margin:       '0 0 var(--space-0-5)',
          }}>
            Disabled models are excluded from auto-routing and per-task assignment
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 'var(--font-weight-regular)',
            fontSize:   'var(--font-size-body)',
            lineHeight: 'var(--line-height-body)',
            color:      'var(--neutral-500)',
            margin:     0,
          }}>
            If a model assigned to a task category is disabled, Souvenir will fall back to the nearest equivalent within your routing preference.
          </p>
        </div>

      </div>
    </div>
  )
}

export default AiModelsView
