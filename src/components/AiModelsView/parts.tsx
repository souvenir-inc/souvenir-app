'use client'

// Presentational pieces of /settings/ai: badges, model card, provider section, skeletons.

import React from 'react'
import { ModelIcon } from '@/components/ModelIcon'
import { Switch } from '@/components/Switch'
import { type LLMModel } from '@/lib/api/models'
import { formatContextWindow } from '@/lib/models/catalog'

// ── Helpers ───────────────────────────────────────────────────────────────────


type PlanTier = 'standard' | 'pro' | 'power'
type BadgeColor = 'blue' | 'neutral' | 'red' | 'green' | 'brown' | 'purple'


export const TAG_PALETTE_AI: BadgeColor[] = ['green', 'blue', 'purple', 'brown', 'neutral']
export function aiTagColor(tag: string): BadgeColor {
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTE_AI[h % TAG_PALETTE_AI.length]
}

export const PLAN_LABEL: Record<string, string> = {
  standard: 'Standard',
  pro:      'Pro',
  power:    'Power',
}

export const PLAN_COLOR: Record<string, BadgeColor> = {
  standard: 'neutral',
  pro:      'blue',
  power:    'brown',
}

export function featureLabel(model: LLMModel): string | null {
  const inputs  = model.model_inputs  ?? []
  const outputs = model.model_outputs ?? []
  const name    = model.model_name.toLowerCase()
  if (outputs.some(o => o.toLowerCase().includes('image'))) return 'Image gen'
  if (inputs.some(i  => i.toLowerCase().includes('image') || i.toLowerCase().includes('vision'))) return 'Vision'
  if (name.includes('code'))    return 'Code'
  if (name.includes('embed'))   return 'Embeddings'
  if (name.includes('whisper') || name.includes('audio')) return 'Audio'
  const ctx = model.model_context_window ?? 0
  if (ctx >= 1_000_000) return '1M+ context'
  return null
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export const BADGE_STYLES: Record<BadgeColor, {
  bg: string; outerShadow: string; innerShadow: string; color: string
}> = {
  blue: {
    bg:          'var(--blue-100)',
    outerShadow: 'var(--color-tag-Blue-shadow)',
    innerShadow: 'var(--ai-models-view-inner-shadow)',
    color:       'var(--blue-700)',
  },
  neutral: {
    bg:          'var(--neutral-100)',
    outerShadow: 'var(--color-tag-Neutral-shadow)',
    innerShadow: 'var(--ai-models-view-inner-shadow-2)',
    color:       'var(--neutral-700)',
  },
  red: {
    bg:          'var(--red-100)',
    outerShadow: 'var(--color-tag-Red-shadow)',
    innerShadow: 'var(--ai-models-view-inner-shadow-3)',
    color:       'var(--red-700)',
  },
  green: {
    bg:          'var(--green-50)',
    outerShadow: 'var(--color-tag-Green-shadow)',
    innerShadow: 'var(--ai-models-view-inner-shadow-4)',
    color:       'var(--green-800)',
  },
  brown: {
    bg:          'var(--brown-100)',
    outerShadow: 'var(--color-tag-Brown-shadow)',
    innerShadow: 'var(--ai-models-view-inner-shadow-5)',
    color:       'var(--brown-700)',
  },
  purple: {
    bg:          'var(--purple-100)',
    outerShadow: 'var(--ai-models-view-outer-shadow)',
    innerShadow: 'var(--ai-models-view-inner-shadow-6)',
    color:       'var(--purple-700)',
  },
}

export function MiniChip({ label, color }: { label: string; color: BadgeColor }) {
  const s = BADGE_STYLES[color]
  return (
    <span
      style={{
        position:       'relative',
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        'var(--space-0-5)',
        borderRadius:   'var(--radius-sm)',
        boxShadow:      s.outerShadow,
        overflow:       'hidden',
        flexShrink:     0,
      }}
    >
      <span aria-hidden style={{
        position:        'absolute',
        inset:           0,
        borderRadius:    'var(--radius-sm)',
        backgroundColor: s.bg,
        pointerEvents:   'none',
      }} />
      <span aria-hidden style={{
        position:     'absolute',
        inset:        0,
        borderRadius: 'inherit',
        boxShadow:    s.innerShadow,
        pointerEvents:'none',
      }} />
      <span style={{
        position:   'relative',
        padding:    '0 var(--space-1)',
        fontFamily: 'var(--font-body)',
        fontWeight: 'var(--font-weight-medium)',
        fontSize: 'var(--font-size-small)',
        lineHeight: 'var(--line-height-small)',
        color:      s.color,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </span>
  )
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div style={{
      display:         'flex',
      flexDirection:   'column',
      gap:             'var(--space-2-5)',
      padding:         'var(--space-3) var(--space-3) var(--space-4)',
      borderRadius:    'var(--radius-2xl)',
      border:          '1px solid var(--border-default)',
      backgroundColor: 'var(--neutral-white)',
      boxShadow:       'var(--shadow-soft)',
    }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)' }}>
          <div style={{ height: 16, width: '60%', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite' }} />
          <div style={{ height: 12, width: '40%', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite' }} />
        </div>
        <div style={{ width: 40, height: 24, borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite', flexShrink: 0 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={{ height: 11, borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite' }} />
        <div style={{ height: 11, borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite', width: '80%' }} />
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-1-5)', paddingTop: 'var(--space-2)' }}>
        <div style={{ height: 20, width: 56, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite' }} />
        <div style={{ height: 20, width: 56, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite' }} />
      </div>
    </div>
  )
}

/** Route-level placeholder (settings/ai/loading.tsx). */
export function AiModelsLoading() {
  return (
    <div role="status" aria-label="Loading models" style={{ flex: '1 0 0', display: 'flex', justifyContent: 'center', paddingTop: 'var(--space-10)' }}>
      <div style={{ width: '100%', maxWidth: 908, padding: '0 var(--space-6)', boxSizing: 'border-box' }}>
        <SkeletonSection cardCount={3} />
        <SkeletonSection cardCount={3} />
      </div>
    </div>
  )
}

export function SkeletonSection({ cardCount = 3 }: { cardCount?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', padding: 'var(--space-3) var(--space-6) var(--space-6)', borderBottom: '1px solid var(--neutral-100)' }}>
      <div style={{ height: 22, width: 100, borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--neutral-100)', animation: 'pulse 0.9s ease-in-out infinite' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
        {Array.from({ length: cardCount }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────

export interface ModelCardProps {
  model:     LLMModel
  toggling:  boolean
  onToggle:  (model: LLMModel) => void
}

export function ModelCard({ model, toggling, onToggle }: ModelCardProps) {
  const tierKey  = (model.model_plan_type ?? 'standard').toLowerCase() as PlanTier
  const tierLbl  = PLAN_LABEL[tierKey] ?? model.model_plan_type ?? 'Standard'
  const tierClr  = (PLAN_COLOR[tierKey] ?? 'neutral') as BadgeColor
  const ctxLbl   = formatContextWindow(model.model_context_window)
  const featLbl  = featureLabel(model)

  return (
    <div
      style={{
        display:         'flex',
        flexDirection:   'column',
        gap:             'var(--space-2)',
        padding:         'var(--space-3) var(--space-3) var(--space-4)',
        borderRadius:    'var(--radius-2xl)',
        border:          '1px solid var(--border-default)',
        backgroundColor: 'var(--neutral-white)',
        boxShadow:       model.blocked
          ? 'var(--ai-models-view-shadow)'
          : 'var(--shadow-soft)',
        opacity:         model.blocked ? 0.7 : 1,
        transition:      'opacity var(--duration-base), box-shadow var(--duration-base)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flex: '1 0 0', minWidth: 0, gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <div style={{
            width:           44,
            height:          44,
            borderRadius:    'var(--radius-lg)',
            backgroundColor: 'transparent',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            flexShrink:      0,
            overflow:        'hidden',
          }}>
            <ModelIcon model={model.model_provider} size={24} />
          </div>
          <div style={{ flex: '1 0 0', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignSelf: 'stretch' }}>
            <p style={{
              fontFamily:   'var(--font-body)',
              fontWeight:   'var(--font-weight-medium)',
              fontSize:     'var(--font-size-body-lg)',
              lineHeight:   'var(--line-height-body)',
              color:        'var(--neutral-900)',
              margin:       0,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              {model.model_name}
            </p>
            <p style={{
              fontFamily:   'var(--font-body)',
              fontWeight:   'var(--font-weight-semibold)',
              fontSize: 'var(--font-size-small)',
              lineHeight:   'var(--line-height-small)',
              color:        'var(--neutral-500)',
              margin:       0,
              overflow:     'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:   'nowrap',
            }}>
              {model.model_provider}
            </p>
          </div>
        </div>
        <Switch
          aria-label={`Enable ${model.model_name}`}
          checked={!model.blocked}
          onCheckedChange={() => onToggle(model)}
          disabled={toggling}
        />
      </div>

      {/* Description */}
      {model.model_description && (
        <p style={{
          fontFamily:       'var(--font-body)',
          fontWeight:       'var(--font-weight-regular)',
          fontSize: 'var(--font-size-small)',
          lineHeight:       'var(--line-height-small)',
          color:            'var(--neutral-500)',
          margin:           0,
          overflow:         'hidden',
          display:          '-webkit-box',
          WebkitLineClamp:  3,
          WebkitBoxOrient:  'vertical',
        }}>
          {model.model_description}
        </p>
      )}

      {/* Labels */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1-5)', alignItems: 'center', paddingTop: 'var(--space-2)' }}>
        <MiniChip label={tierLbl} color={tierClr} />
        {ctxLbl && <MiniChip label={ctxLbl} color="red" />}
        {featLbl && <MiniChip label={featLbl} color="green" />}
        {model.model_thinking_efforts?.map((e) => (
          <MiniChip key={`effort-${e}`} label={e} color="purple" />
        ))}
        {model.model_tags?.map((tag) => (
          <MiniChip key={tag} label={tag} color={aiTagColor(tag)} />
        ))}
      </div>
    </div>
  )
}

// ── Provider section ──────────────────────────────────────────────────────────

export function ProviderSection({
  provider,
  displayModels,
  allProviderModels,
  togglingId,
  onToggle,
  divider,
}: {
  provider:          string
  displayModels:     LLMModel[]
  allProviderModels: LLMModel[]
  togglingId:        string | null
  onToggle:          (model: LLMModel) => void
  divider?:          boolean
}) {
  const enabledCount = allProviderModels.filter(m => !m.blocked).length
  const totalCount   = allProviderModels.length

  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      gap:           'var(--space-6)',
      padding:       'var(--space-3) var(--space-6) var(--space-6)',
      borderBottom:  divider ? '1px solid var(--neutral-100)' : undefined,
    }}>
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <h2 style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 'var(--font-weight-medium)',
          fontSize:   'var(--font-size-body)',
          lineHeight: 'var(--line-height-body)',
          color:      'var(--neutral-900)',
          margin:     0,
          whiteSpace: 'nowrap',
        }}>
          {provider}
        </h2>
        <MiniChip label={`${enabledCount}/${totalCount} enabled`} color="brown" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
        {displayModels.map(model => (
          <ModelCard
            key={model.model_id}
            model={model}
            toggling={togglingId === model.model_id}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ── AiModelsView ──────────────────────────────────────────────────────────────
// Renders the personal /settings/ai page. The toggle is a per-user preference
// (UserBlockedModels is keyed by user_id on the backend, not org_id) — every
// signed-in user manages their own model list here, regardless of org role.

