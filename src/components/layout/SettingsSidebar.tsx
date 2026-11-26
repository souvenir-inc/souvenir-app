'use client'

import React, { useEffect, useState } from 'react'
import { m } from 'framer-motion'
import { usePathname } from 'next/navigation'
import { ListFilter, Sigma, SlidersHorizontal } from 'lucide-react'
import { ArrowLeftOneIcon, BrainTwoIcon, SidebarLeftIcon } from '@strange-huge/icons'
import { useMobile } from '@/hooks/use-mobile'
import { SidebarMenuItem } from '@/components/SidebarMenuItem'
import { SidebarMenuSkeleton } from '@/components/SidebarMenuSkeleton'
import { IconButton } from '@/components/ui/button'
import { AccountMenu } from '@/components/AccountMenu'
import { Divider } from '@/components/Divider'
import { RoleBadge } from '@/components/RoleBadge'
import type { WorkspaceRole } from '@/components/RoleBadge'
import { Tooltip } from '@/components/Tooltip'
import { ThemeModeSwitcher } from '@/components/ThemeModeSwitcher'
import { useAuth } from '@/context/auth-context'
import { useOrg } from '@/context/org-context'
import type { CreditsDisplay } from '@/lib/api/plan'
import { formatCredits } from '@/lib/format-credits'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { SETTINGS_ACCOUNT_ROUTE, SETTINGS_USAGE_ROUTE, SETTINGS_MEMORY_ROUTE, SETTINGS_HELP_ROUTE, CHAT_ROUTE, ORG_GENERAL_ROUTE, ORG_MEMBERS_ROUTE, ORG_PLANS_ROUTE, ORG_ANALYTICS_ROUTE, SETTINGS_LIBRARY_ROUTE, ORG_LIBRARY_ROUTE, SETTINGS_METRICS_ROUTE, SETTINGS_DATA_PREFERENCES_ROUTE, SETTINGS_DATA_RULES_ROUTE } from '@/lib/routes'
import { LIBRARY_SETTINGS_ENABLED } from '@/lib/feature-flags'
import { Sheet, SheetContent } from '@/components/ui/sheet'

// ── Nav icons — Settings v1.5 sidebar ────────────────────────────────────────
// Figma: https://www.figma.com/design/EirgiIxJWDEeUNZnKwr3f8/Settings-v1.5?node-id=18-27780
// Exported as static assets (public/icons/settings-sidebar/) rather than
// mapped onto existing @strange-huge/icons glyphs — none of the existing set
// clearly matched these (e.g. General's monitor glyph vs. the gear-shaped
// SettingsOneIcon used elsewhere), and 1:1 fidelity was the ask. `triggered`
// is accepted-and-ignored so SidebarMenuItem's `cloneElement(icon, {
// triggered })` doesn't warn about an unknown prop landing on a plain <img>.
function SidebarAssetIcon({ src, triggered: _triggered }: { src: string; triggered?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static local icon, Next Image adds no value here
    <img src={src} width={20} height={20} alt="" aria-hidden style={{ display: 'block' }} />
  )
}

// -- Item stagger animation - same three-layer pattern as LeftSidebar/Sidebar --
const sectionStaggerVariants = {
  open: {
    transition: { staggerChildren: 0.04, delayChildren: 0.24 },
  },
  closed: {
    transition: {},
  },
}

const sectionItemVariants = {
  open:   { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' as const } },
  closed: { opacity: 0, y: 5, transition: { duration: 0.12, ease: 'easeIn'  as const } },
}

// ── Nav loading skeleton ──────────────────────────────────────────────────────
// Whether WORKSPACE renders at all depends on org/role data that resolves
// async (useOrg's orgReady) — rendering the real sections as that data trickles
// in would mean WORKSPACE popping in underneath PERSONAL after the fact. This
// bone stands in for the whole nav (PERSONAL + WORKSPACE + HELP shape) as one
// static block until orgReady, so the swap to the real, fully-resolved menu
// happens once, atomically, rather than assembling section by section.
function SettingsNavSkeleton() {
  const section = (labelWidth: number, rows: number) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ padding: '4px 6px' }}>
        <div className="kaya-skeleton" style={{ width: labelWidth, height: 10, borderRadius: 4 }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Array.from({ length: rows }).map((_, i) => (
          <SidebarMenuSkeleton key={i} index={i} fluid showIcon />
        ))}
      </div>
    </div>
  )
  return (
    <>
      {section(56, 2)}
      <Divider decorative style={GROUP_DIVIDER} />
      {section(36, 3)}
      <Divider decorative style={GROUP_DIVIDER} />
      {section(72, 3)}
    </>
  )
}

// ── Settings menu groups ──────────────────────────────────────────────────────
// Grouped by what you set up (Metric Library design, Settings section, option A, Dev 25 Nov):
// PERSONAL (you), DATA (what changes how numbers are counted and shown) and WORKSPACE (admins).
// Help & Legal sits at the foot, above the account. Log out, Report a bug and Feature request
// aren't settings: they live in the account menu and on the Help page.
type NavItem = {
  id: string
  label: string
  href: string
  icon: React.ReactElement<{ triggered?: boolean }>
  /** Other routes that light this item (the workspace view of Usage lights Usage). */
  also?: string[]
}

// Lucide glyphs drawn at the asset icons' optical weight (20 px, 1.75 stroke).
function LucideNavIcon({ icon: Icon, triggered: _triggered }: { icon: typeof Sigma; triggered?: boolean }) {
  return <Icon size={20} strokeWidth={1.75} aria-hidden style={{ display: 'block' }} />
}

const PERSONAL_ITEMS: NavItem[] = [
  { id: 'account', label: 'Account', href: SETTINGS_ACCOUNT_ROUTE, icon: <SidebarAssetIcon src="/icons/settings-sidebar/account.svg" /> },
  // One Usage page: your credits, and for admins a Workspace tab (the analytics page) on top.
  { id: 'usage',   label: 'Usage',   href: SETTINGS_USAGE_ROUTE,   icon: <SidebarAssetIcon src="/icons/settings-sidebar/usage-workspace.svg" />, also: [ORG_ANALYTICS_ROUTE] },
]

// DATA: what every metric means, what counts, what Souvenir remembers, and how numbers show.
// Metrics needs a workspace (the warehouse), so it shows only when there is one.
const metricsItem: NavItem = { id: 'metrics', label: 'Metrics', href: SETTINGS_METRICS_ROUTE, icon: <LucideNavIcon icon={Sigma} /> }
const dataRulesItem: NavItem = { id: 'data-rules', label: 'Data rules', href: SETTINGS_DATA_RULES_ROUTE, icon: <LucideNavIcon icon={ListFilter} /> }
const DATA_ITEMS: NavItem[] = [
  { id: 'memory',      label: 'Memory',      href: SETTINGS_MEMORY_ROUTE,           icon: <BrainTwoIcon size={20} /> },
  { id: 'preferences', label: 'Preferences', href: SETTINGS_DATA_PREFERENCES_ROUTE, icon: <LucideNavIcon icon={SlidersHorizontal} /> },
  // Library: auto-save, AI use of files, storage. Off until NEXT_PUBLIC_ENABLE_LIBRARY_SETTINGS=true.
  ...(LIBRARY_SETTINGS_ENABLED ? [{ id: 'library', label: 'Library', href: SETTINGS_LIBRARY_ROUTE, icon: <SidebarAssetIcon src="/icons/settings-sidebar/library.svg" /> }] : []),
]

// WORKSPACE: admins only. Audit log and Inventory (phase 2 placeholders) stay hidden; their pages
// still exist at ORG_AUDIT_LOG_ROUTE / ORG_INVENTORY_ROUTE.
const WORKSPACE_ITEMS: NavItem[] = [
  { id: 'general', label: 'General',         href: ORG_GENERAL_ROUTE, icon: <SidebarAssetIcon src="/icons/settings-sidebar/general.svg" /> },
  { id: 'members', label: 'Members',         href: ORG_MEMBERS_ROUTE, icon: <SidebarAssetIcon src="/icons/settings-sidebar/members.svg" /> },
  { id: 'plans',   label: 'Plans & Billing', href: ORG_PLANS_ROUTE,   icon: <SidebarAssetIcon src="/icons/settings-sidebar/plans-billing.svg" /> },
  // Workspace Library settings (Admin): auto-save default, AI use, file limits.
  ...(LIBRARY_SETTINGS_ENABLED ? [{ id: 'workspace-library', label: 'Library', href: ORG_LIBRARY_ROUTE, icon: <SidebarAssetIcon src="/icons/settings-sidebar/library.svg" /> }] : []),
]

const HELP_ITEM: NavItem = { id: 'help', label: 'Help & Legal', href: SETTINGS_HELP_ROUTE, icon: <SidebarAssetIcon src="/icons/settings-sidebar/help-legal.svg" /> }

// Group headers read as labels, not pages: small, spaced capitals in a lighter grey, with a line
// above every group but the first (Dev, 25 Nov: "better design to distinguish between group headers
// and sections").
const GROUP_DIVIDER: React.CSSProperties = { margin: '10px 0 8px' }

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily:    'var(--font-body)',
      fontWeight:    500,
      fontSize:      11,
      lineHeight:    '16px',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color:         'var(--neutral-500)',
      margin:        0,
      padding:       '4px 6px',
      whiteSpace:    'nowrap',
    }}>
      {children}
    </p>
  )
}

function isOn(item: NavItem, pathname: string): boolean {
  return [item.href, ...(item.also ?? [])].some(href => pathname === href || pathname.startsWith(`${href}/`))
}

// Narrow screens: the settings nav opens as a left-side Sheet (Radix Dialog) with a scrim —
// Escape / scrim click close it, focus is trapped inside and returns to the menu button.
// Wide screens: the nav renders inline.
function NarrowDrawer({ narrow, open, onOpenChange, children }: {
  narrow: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  if (!narrow) return <>{children}</>
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" title="Settings menu" data-testid="settings-sidebar-drawer" style={{ display: 'flex' }}>
        {children}
      </SheetContent>
    </Sheet>
  )
}

export function SettingsSidebar() {
  // Guarded push — same app-wide "unsaved changes" system LeftSidebar uses
  // (nav-guard-context), so leaving a dirty Settings page shows the shared
  // confirmation modal (rendered once in (app)/layout.tsx) regardless of
  // whether the user clicks a Settings nav item or the main app sidebar.
  const { push } = useGuardedRouter()
  const pathname = usePathname()
  const isNarrow = useMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)
  // Choosing a page closes the narrow-screen drawer.
  const [drawerPath, setDrawerPath] = useState(pathname)
  if (drawerPath !== pathname) { setDrawerPath(pathname); setDrawerOpen(false) }
  // Escape, scrim click, focus trap and focus return are handled by the Radix Sheet below.
  const { user } = useAuth()
  const { orgId, org, plan, orgRole, currentUserRole, orgReady } = useOrg()

  // No-op for a click on the already-active nav item — avoids re-triggering
  // the guard (or a pointless re-navigation) for a same-page click.
  const safeNavigate = (href: string) => {
    if (pathname === href) return
    push(href)
  }

  const displayName = user
    ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.name || ''
    : ''

  // `window` doesn't exist during SSR/hook-init — reading it directly here
  // (as this used to, via an inline IIFE evaluated every render) throws a
  // ReferenceError on the server, not just a hydration *mismatch*, since the
  // bare `window` identifier reference itself fails before optional chaining
  // ever gets a chance to short-circuit. Same bug class, same fix shape, as
  // Chats' `chat/page.tsx` (`selectedPersona`): the value starts `null` on both the server
  // and the client's first (hydration) render — identical output, no
  // mismatch possible — then populates for real via an effect a tick after
  // mount. `isTeamUser`'s other OR'd signals (orgId, user.orgId, roleFit)
  // already cover the common case immediately; this cache is only a
  // same-tick-faster fallback for team accounts that haven't resolved
  // `orgId` yet, so the one-render-tick delay is the same accepted,
  // imperceptible trade-off those prior fixes made.
  const [billingSnap, setBillingSnap] = useState<{ isTeamAccount?: boolean } | null>(null)
  useEffect(() => {
    try {
      const r = window.sessionStorage.getItem('kaya:billing:snapshot:v2')
      setBillingSnap(r ? JSON.parse(r) : null)
    } catch {
      setBillingSnap(null)
    }
  }, [])
  const isTeamUser = Boolean(
    orgId ||
    user?.orgId ||
    user?.roleFit === 'small_team' ||
    user?.roleFit === 'large_team' ||
    billingSnap?.isTeamAccount
  )

  const orgHasPlan = orgId ? (plan?.isFunded ?? false) : false

  // Workspace identity line — just the org name, independent of plan/billing
  // status, which now surfaces only via the status tag below. Individuals
  // have no named workspace, so they get no second line at all.
  const planLabel = isTeamUser
    ? (orgId ? (org?.name ?? 'Workspace') : 'Workspace')
    : undefined

  const planWarning = isTeamUser ? !orgHasPlan : (!user?.planType && !user?.isTrial)

  // The status tag: the org's plan chip from the Plan, else the individual's plan.
  const planTypeLabel = isTeamUser
    ? (plan?.chipLabel ?? 'Free Plan')
    : user?.planType
      ? user.planType.charAt(0).toUpperCase() + user.planType.slice(1)
      : user?.isTrial
        ? 'Free Trial'
        : undefined

  // Blue tag for "Free Plan" (running on starting credits, no plan selected
  // yet); default color once a real plan is selected, and always for
  // individuals.
  const planStatusVariant: 'neutral' | 'blue' = (isTeamUser && orgHasPlan && !plan?.hasSelectedPlan) ? 'blue' : 'neutral'

  const accountCredits: CreditsDisplay | undefined = orgId
    ? (orgHasPlan && plan && (orgRole === 'admin' || plan.isEnterprise) ? plan.credits : undefined)
    : (planWarning || user?.creditsTotal == null
        ? undefined
        : { value: formatCredits(user.creditsTotal), caption: 'total credits' })

  // Role badge with tooltip — mirrors LeftSidebar's displayRole hierarchy.
  // Gated on `orgReady`, not just `orgId`: `orgId` resolves before the role
  // fetch settles, and the old fallback (`currentUserRole ?? (orgId ?
  // 'member' : undefined)`) guessed 'member' the instant orgId was known —
  // showing that guess, then correcting to 'admin' once the real role
  // arrived, is exactly the Member-then-Admin flash this exists to prevent.
  // `undefined` here means no badge at all until the real role is in.
  const displayRole = orgReady && orgId
    ? (orgRole === 'admin' ? orgRole : currentUserRole)
    : undefined
  const roleTooltip = displayRole
    ? displayRole.charAt(0).toUpperCase() + displayRole.slice(1)
    : undefined
  const roleBadge = orgId && displayRole ? (
    <Tooltip content={roleTooltip} side="top" delayDuration={300}>
      <span style={{ display: 'inline-flex' }}>
        <RoleBadge role={displayRole as WorkspaceRole} showLabel={false} mode="solar" />
      </span>
    </Tooltip>
  ) : undefined

  const isAdmin = orgRole === 'admin'
  const groups: { id: string; label: string; items: NavItem[] }[] = [
    { id: 'personal', label: 'Personal', items: PERSONAL_ITEMS },
    { id: 'data', label: 'Data', items: orgId ? [metricsItem, dataRulesItem, ...DATA_ITEMS] : DATA_ITEMS },
    ...(orgId && isAdmin ? [{ id: 'workspace', label: 'Workspace', items: WORKSPACE_ITEMS }] : []),
  ]

  return (
    <>
    {/* Narrow screens: a 48px rail with a menu button; the full nav opens as an
        overlay drawer (same pattern as the app LeftSidebar). */}
    {isNarrow && (
      <div style={{ width: 48, flexShrink: 0, height: '100%', backgroundColor: 'var(--neutral-50)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 24 }}>
        <IconButton variant="ghost" size="sm" aria-label="Go back" icon={<ArrowLeftOneIcon size={20} />} onClick={() => safeNavigate(CHAT_ROUTE)} />
        <IconButton variant="ghost" size="sm" aria-label="Open settings menu" aria-haspopup="dialog" aria-expanded={drawerOpen} icon={<SidebarLeftIcon size={20} variant="open" />} onClick={() => setDrawerOpen(true)} />
      </div>
    )}
    <NarrowDrawer narrow={isNarrow} open={drawerOpen} onOpenChange={setDrawerOpen}>
    <div
      style={{
        display:         'flex',
        flexDirection:   'column',
        width:           294,
        maxWidth:        isNarrow ? 'calc(100vw - 48px)' : undefined,
        height:          '100%',
        backgroundColor: 'var(--neutral-50)',
        flexShrink:      0,
        overflow:        'hidden',
        ...(isNarrow ? { boxShadow: '4px 0 24px rgba(0, 0, 0, 0.16)' } : null),
      }}
    >
      {/* ── Title row — fixed ── */}
      <div style={{
        flexShrink:  0,
        display:     'flex',
        gap:         4,
        alignItems:  'center',
        padding:     '24px 16px 8px',
      }}>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Go back"
          icon={<ArrowLeftOneIcon size={20} />}
          onClick={() => safeNavigate(CHAT_ROUTE)}
        />
        <p style={{
          fontFamily:   'var(--font-title)',
          fontWeight:   400,
          fontSize:     24,
          lineHeight:   '32px',
          color:        'var(--neutral-900)',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
          flex:         '1 0 0',
          minWidth:     0,
          margin:       0,
        }}>
          Settings
        </p>
        {/* Screen mode: the same Light / Dark / System control as the account menu, at the row's end. */}
        <ThemeModeSwitcher size="lg" />
      </div>

      {/* ── Scrollable nav ── */}
      <div
        className="kaya-scrollbar"
        style={{
          flex:          '1 0 0',
          minHeight:     0,
          overflowY:     'auto',
          overflowX:     'hidden',
          paddingTop:    8,
          paddingBottom: 16,
        }}
      >
        {/* Horizontal padding lives on this inner wrapper, not the scrolling
            element above — keeps the scrollbar flush with the sidebar's edge. */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 16px' }}>

        {!orgReady ? <SettingsNavSkeleton /> : (
          groups.map((group, index) => (
            <React.Fragment key={group.id}>
              {index > 0 && <Divider decorative style={GROUP_DIVIDER} />}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <GroupLabel>{group.label}</GroupLabel>
                <m.div
                  animate="open"
                  initial="closed"
                  variants={sectionStaggerVariants}
                  style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                >
                  {group.items.map(item => (
                    <m.div key={item.id} variants={sectionItemVariants}>
                      <SidebarMenuItem
                        fluid
                        variant="default"
                        icon={item.icon}
                        label={item.label}
                        selected={isOn(item, pathname)}
                        onClick={() => safeNavigate(item.href)}
                      />
                    </m.div>
                  ))}
                </m.div>
              </div>
            </React.Fragment>
          ))
        )}

        </div>

      </div>

      {/* ── Help & Legal, then the account — fixed at the foot ── */}
      <div style={{
        flexShrink:      0,
        backgroundColor: 'var(--neutral-50)',
        paddingLeft:     10,
        paddingRight:    10,
        paddingTop:      8,
        paddingBottom:   12,
        boxShadow:       '0px -34px 33.5px 0px var(--neutral-50)',
      }}>
        <div style={{ padding: '0 6px 8px' }}>
          <SidebarMenuItem
            fluid
            variant="default"
            icon={HELP_ITEM.icon}
            label={HELP_ITEM.label}
            selected={isOn(HELP_ITEM, pathname)}
            onClick={() => safeNavigate(HELP_ITEM.href)}
          />
        </div>
        {!user ? (
          <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="kaya-skeleton" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ flex: '1 0 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div className="kaya-skeleton" style={{ height: 14, width: '60%', borderRadius: 4 }} />
              <div className="kaya-skeleton" style={{ height: 11, width: '42%', borderRadius: 4 }} />
            </div>
          </div>
        ) : (
          // Static — no dropdown. Profile/Upgrade Plan/Settings/Organization/
          // Help/Report a bug would just repeat this same sidebar's own nav
          // (and "Settings" makes no sense to offer while already here).
          <AccountMenu
            interactive={false}
            name={displayName || 'Account'}
            plan={planLabel}
            planWarning={planWarning}
            planType={planTypeLabel}
            credits={accountCredits}
            planStatusVariant={planStatusVariant}
            avatarSrc={user?.profilePicture ?? undefined}
            collapsed={false}
            roleBadge={roleBadge}
          />
        )}
      </div>
    </div>
    </NarrowDrawer>

    {/* Unsaved-changes confirmation is now the shared NavGuardModal (mounted
        once app-wide in (app)/layout.tsx) — see useGuardedRouter() above. */}

    </>
  )
}
