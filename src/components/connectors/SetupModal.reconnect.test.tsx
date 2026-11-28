// @vitest-environment jsdom
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectorCatalog } from '@/lib/api/connectors'
import { SetupModal } from './SetupModal'

// Reconnecting a Shopify store fills in its shop (the account is named by its shop domain), so the
// person isn't asked for it again; a secret never is.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const account = (over: Record<string, unknown> = {}) => ({
  id: '2b0b8f8e-0000-4000-8000-0000000000aa', nickname: 'Main store', shared: false, connector_slug: 'shopify_app',
  account_identifier: 'main-store.myshopify.com', connected: false, status: 'expired', version: 1, owner_id: 'auth0|me', owned: true,
  permissions: [], created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...over,
})
const shopify = ConnectorCatalog.parse({
  slug: 'shopify_app', display_name: 'Shopify', auth_mode: 'oauth2', provider: 'native', description: '', logo_url: null,
  categories: [], catalog_metadata: {}, tools: [], linked: true, connections: [account()],
  api_key_fields: [
    { name: 'shop', label: 'Shop Domain', help: '', secret: false, required: true },
    { name: 'client_secret', label: 'Client secret', help: '', secret: true, required: true },
  ],
})

let root: ReturnType<typeof createRoot> | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

function render(mode: 'connect' | 'reconnect') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(
    <SetupModal catalog={shopify} orgId="org-1" mode={mode} initialAccount={mode === 'reconnect' ? shopify.connections[0] : undefined} cancel={vi.fn()} onConnected={vi.fn()} />,
  ))
  const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[]
  const labelled = (i: HTMLInputElement, text: string) =>
    [i.closest('label')?.textContent, i.getAttribute('aria-label'), i.id ? document.querySelector(`label[for="${i.id}"]`)?.textContent : null]
      .some((t) => t?.includes(text))
  return { shop: inputs.find((i) => labelled(i, 'Shop Domain')), secret: inputs.find((i) => i.type === 'password') }
}

describe('SetupModal, reconnecting a Shopify store', () => {
  it('fills in the store’s shop and leaves the secret empty', () => {
    const { shop, secret } = render('reconnect')
    expect(shop?.value).toBe('main-store.myshopify.com')
    expect(secret?.value ?? '').toBe('')
  })

  it('asks for the shop when connecting a new store', () => {
    const { shop } = render('connect')
    expect(shop?.value ?? '').toBe('')
  })
})
