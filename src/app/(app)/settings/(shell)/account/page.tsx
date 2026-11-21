'use client'

import React from 'react'
import { useAuth } from '@/context/auth-context'
import { roleDisplayLabel, toneDisplayLabel } from '@/lib/api/user'
import { AccountSkeleton } from '../SettingsSkeleton'
import { DangerZoneCard, PreferencesCard, SHOW_DANGER_ZONE } from './_components/AccountCards'
import { ProfileCard } from './_components/ProfileCard'
import { useProfileForm } from './_components/use-profile-form'

// ── Settings v1.5 — Account page ─────────────────────────────────────────────
// Figma: https://www.figma.com/design/EirgiIxJWDEeUNZnKwr3f8/Settings-v1.5?node-id=18-27466
// Profile (edited and saved together, guarded on leave), Appearance and Response style (each saves
// on pick). The cards live in ./_components.

export default function AccountPage() {
  const { user, refreshUser } = useAuth()
  if (!user) return <AccountSkeleton />
  return <AccountPageContent user={user} refreshUser={refreshUser} />
}

type AuthUser = NonNullable<ReturnType<typeof useAuth>['user']>

function AccountPageContent({ user, refreshUser }: { user: AuthUser; refreshUser: () => Promise<void> }) {
  const base = { firstName: user.firstName ?? '', lastName: user.lastName ?? '', avatar: user.profilePicture ?? null }
  const profile = useProfileForm(base)

  return (
    <div
      className="kaya-scrollbar"
      style={{ flex: '1 0 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 'var(--space-10) var(--space-6) var(--space-9)' }}
    >
      <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ paddingLeft: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)', margin: 0 }}>Account</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)', margin: 0 }}>
            Your profile, and how Souvenir looks and writes to you.
          </p>
        </div>

        <ProfileCard
          form={profile}
          role={roleDisplayLabel(user.onboardingRole)}
          email={user.email ?? ''}
          fallbackName={`${base.firstName} ${base.lastName}`.trim()}
        />
        <PreferencesCard savedTone={toneDisplayLabel(user.onboardingTone)} refreshUser={refreshUser} />
        {SHOW_DANGER_ZONE && <DangerZoneCard />}
      </div>
    </div>
  )
}
