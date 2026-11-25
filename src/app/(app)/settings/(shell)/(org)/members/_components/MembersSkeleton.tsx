'use client'

import React from 'react'
import { SHADOW_CARD, SHADOW_STAT_CARD } from './members-shared'

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonBlock({ width = '100%', height, radius = 8 }: { width?: string | number; height: number; radius?: number }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--neutral-100) 25%, var(--neutral-50) 50%, var(--neutral-100) 75%)',
      backgroundSize: '200% 100%',
      animation: 'membersSkeletonShimmer 1.4s ease-in-out infinite',
      flexShrink: 0,
    }} />
  )
}

/** A bone vertically centred in a text line of the given height, so line boxes match the real text. */
function Line({ lh, width, height, radius = 4 }: { lh: number; width: number | string; height: number; radius?: number }) {
  return <div style={{ height: lh, display: 'flex', alignItems: 'center' }}><SkeletonBlock width={width} height={height} radius={radius} /></div>
}

const ROW_BORDER = '1px solid var(--neutral-100)'

export function MembersPageSkeleton() {
  return (
    <>
      <style>{`@keyframes membersSkeletonShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <div style={{ width: '100%', maxWidth: 908, padding: '0 var(--space-6)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

        {/* Page header: h1 (32px line) + subtitle (4px gap, 22px line) left, "Roles & Permissions" button right */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Line lh={32} width={112} height={26} radius={6} />
            <div style={{ marginTop: 'var(--space-1)' }}><Line lh={22} width={423} height={14} /></div>
          </div>
          <SkeletonBlock width={172} height={32} radius={8} />
        </div>

        {/* Stats row */}
        <div style={{ border: '1px solid var(--border-default)', borderRadius: 'var(--radius-2xl)', boxShadow: SHADOW_CARD, padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)' }}>
          {[90, 50, 100].map((w, i) => (
            <div key={i} style={{ flex: '1 0 0', minWidth: 0, backgroundColor: 'var(--neutral-white)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1-5)', boxShadow: SHADOW_STAT_CARD }}>
              <Line lh={20} width={w} height={13} />
              <Line lh={36} width={20} height={28} radius={6} />
              <Line lh={16} width={w + 20} height={11} />
            </div>
          ))}
        </div>

        {/* Team Members table card */}
        <div style={{ borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border-default)', backgroundColor: 'var(--legacy-f9f5f1)', boxShadow: SHADOW_CARD, overflow: 'hidden', width: '100%', padding: 'var(--space-3) 0' }}>
          {/* Toolbar: title left, search icon + "Invite members" right */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', height: 69, padding: 'var(--members-toolbar-padding)', boxSizing: 'border-box', borderBottom: ROW_BORDER }}>
            <Line lh={32} width={114} height={15} />
            <div style={{ flex: '1 0 0' }} />
            <SkeletonBlock width={32} height={32} radius={8} />
            <SkeletonBlock width={151} height={32} radius={8} />
          </div>
          {/* Column headers: Member / Role / Actions */}
          <div style={{ display: 'flex', alignItems: 'center', height: 47, marginTop: 'var(--space-3)', padding: '0 var(--space-6)', boxSizing: 'border-box', borderBottom: ROW_BORDER }}>
            <div style={{ flex: '1 0 0', minWidth: 0 }}><SkeletonBlock width={54} height={13} radius={4} /></div>
            <div style={{ width: 150, display: 'flex' }}><SkeletonBlock width={30} height={13} radius={4} /></div>
            <div style={{ width: 240, display: 'flex', justifyContent: 'flex-end' }}><SkeletonBlock width={50} height={13} radius={4} /></div>
          </div>
          {/* Member rows (72px each) */}
          {[0, 1].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', height: 72, padding: '0 var(--space-6)', boxSizing: 'border-box', borderBottom: ROW_BORDER }}>
              <div style={{ flex: '1 0 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <SkeletonBlock width={32} height={32} radius={16} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-0-5)' }}>
                  <Line lh={22} width={i ? 74 : 80} height={13} />
                  <Line lh={16} width={i ? 176 : 93} height={10} />
                </div>
              </div>
              <div style={{ width: 150, display: 'flex' }}><SkeletonBlock width={i ? 90 : 78} height={32} radius={8} /></div>
              <div style={{ width: 240, display: 'flex', justifyContent: 'flex-end' }}>{i > 0 && <SkeletonBlock width={97} height={32} radius={8} />}</div>
            </div>
          ))}
        </div>

      </div>
    </>
  )
}
