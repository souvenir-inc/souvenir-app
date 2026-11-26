'use client'

import React, { useState } from 'react'
import { m, useReducedMotion } from 'framer-motion'
import { SettingsOneIcon } from '@strange-huge/icons'
import { UserAvatar, userAvatarRadius } from '@/components/Avatar'
import { SPRING } from "@/styles/tokens/motion"

// ── "Sidebar / Profile Row" (Figma 109:4650) ─────────────────────────────────
// "50px, avatar centred by counter-axis alignment rather than vertical
// padding. On selected the subtitle steps from text/secondary to
// text/primary — secondary only reaches 3.56:1 on that surface, below AA."
// This is the trigger visual only — passed as AccountMenu's `renderTrigger`
// (src/components/AccountMenu) so the dropdown panel/behavior is unchanged.

export interface FlatSidebarProfileRowProps {
  name: string
  sublabel?: string
  avatarSrc?: string
  planLabel?: string
  onOpenSettingsClick: () => void
  collapsed?: boolean
  /**
   * Own control rendered after the settings icon (expanded) or stacked above
   * the avatar (collapsed rail) — the notification bell. It must stop its own
   * click/key events from reaching this row (NotificationBell does), since
   * the row itself is the AccountMenu trigger.
   */
  trailing?: React.ReactNode
}

export function FlatSidebarProfileRow({ name, sublabel, avatarSrc, planLabel, onOpenSettingsClick, collapsed = false, trailing }: FlatSidebarProfileRowProps) {
  const [isHovered, setIsHovered] = useState(false)
  const isActive = isHovered
  const reduceMotion = useReducedMotion()

  if (collapsed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', width: '100%' }}>
      {trailing}
      <div
        role="button"
        tabIndex={0}
        onClick={onOpenSettingsClick}
        // Enter / Space bubble to the AccountMenu's Radix trigger, which toggles the menu.
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenSettingsClick() }}
        style={{ display: 'flex', justifyContent: 'center', width: '100%', cursor: 'pointer' }}
      >
        <div style={{ width: 32, height: 32, borderRadius: userAvatarRadius(32), overflow: 'hidden', flexShrink: 0, position: 'relative', boxShadow: 'var(--shadow-sidebar-item-avatar)' }}>
          <UserAvatar name={name} src={avatarSrc} size={32} />
        </div>
      </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenSettingsClick}
      // Enter / Space bubble to the AccountMenu's Radix trigger, which toggles the menu.
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenSettingsClick() }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-sidebar-active={isActive ? '' : undefined}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', width: '100%', height: 50,
        // The trailing bell is a 24 px button around a 16 px glyph — 8 px
        // right padding puts its glyph on the same 12 px inset the settings
        // icon sits on without it.
        padding: trailing ? '0 var(--space-2) 0 var(--space-3)' : '0 var(--space-3)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', boxSizing: 'border-box',
        backgroundColor: isActive ? 'var(--sidebar-menu-item-hover-bg)' : 'transparent',
        boxShadow: isActive ? 'var(--shadow-sidebar-item-hover)' : undefined,
        transition: 'background-color var(--duration-fast), box-shadow var(--duration-fast)',
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: userAvatarRadius(32), overflow: 'hidden', flexShrink: 0, position: 'relative', boxShadow: 'var(--shadow-sidebar-item-avatar)' }}>
        <UserAvatar name={name} src={avatarSrc} size={32} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 0 0', minWidth: 0, overflow: 'hidden' }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-body)',
          lineHeight: 'var(--line-height-body)', color: 'var(--sidebar-menu-item-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name}
        </p>
        {sublabel && (
          <p style={{
            margin: 0, fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-caption)',
            lineHeight: 'var(--line-height-caption)', color: isActive ? 'var(--sidebar-menu-item-text)' : 'var(--sidebar-menu-item-muted)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {sublabel}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        {planLabel && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: 'var(--space-0-5) var(--space-1-5)', borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--blue-100)', boxShadow: 'var(--shadow-chip-selected)',
            fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-caption)',
            lineHeight: 'var(--line-height-caption)', color: 'var(--blue-700)',
          }}>
            {planLabel}
          </span>
        )}
        {/* The icon itself does not animate, so the gear turns while the row is hovered. */}
        <m.span
          aria-hidden
          animate={isActive && !reduceMotion ? { rotate: 90, scale: 1.1 } : { rotate: 0, scale: 1 }}
          transition={{ type: 'spring', ...SPRING.bouncy }}
          style={{ display: 'inline-flex', color: 'var(--sidebar-icon, var(--sidebar-menu-item-text))' }}
        >
          <SettingsOneIcon size={16} />
        </m.span>
        {trailing}
      </div>
    </div>
  )
}

export default FlatSidebarProfileRow
