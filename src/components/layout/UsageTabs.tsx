'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { useGuardedRouter } from '@/context/nav-guard-context'
import { useOrg } from '@/context/org-context'
import { ORG_ANALYTICS_ROUTE, SETTINGS_USAGE_ROUTE } from '@/lib/routes'

const TABS = [
  { label: 'You', href: SETTINGS_USAGE_ROUTE },
  { label: 'Workspace', href: ORG_ANALYTICS_ROUTE },
] as const

/**
 * One Usage page in the settings menu: your credits, and for admins a Workspace tab with the whole workspace's
 * usage. Members see no tabs.
 */
export function UsageTabs() {
  const { orgId, orgRole, orgReady } = useOrg()
  const pathname = usePathname()
  const { push } = useGuardedRouter()
  if (!orgReady || !orgId || orgRole !== 'admin') return null
  return (
    <div role="tablist" aria-label="Usage" style={{ display: 'flex', gap: 24, borderBottom: '1px solid var(--neutral-200)', margin: '0 4px 8px' }}>
      {TABS.map(tab => {
        const on = pathname === tab.href
        return (
          <button
            key={tab.href}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => { if (!on) push(tab.href) }}
            style={{
              padding:      '0 0 8px',
              marginBottom: -1,
              border:       'none',
              borderBottom: `2px solid ${on ? 'var(--neutral-900)' : 'transparent'}`,
              background:   'none',
              cursor:       on ? 'default' : 'pointer',
              fontFamily:   'var(--font-body)',
              fontSize:     14,
              lineHeight:   '22px',
              fontWeight:   on ? 500 : 400,
              color:        on ? 'var(--neutral-900)' : 'var(--neutral-600)',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
