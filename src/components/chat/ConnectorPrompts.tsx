"use client"

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { ConnectorConnectPrompt } from '@/types/chat'
import { ConnectorPromptShell } from '@/components/shared/ConnectorHeading'
import { Button } from '@/components/ui/button'
import {
  getConnector,
  initiateLink,
  completeZapierLink,
  pollConnectorUntilActive,
  oauthNeedsInitFields,
  DEFAULT_API_KEY_FIELD,
  type ApiKeyField,
} from '@/lib/api/connectors'
import { respondToChatPrompt } from '@/lib/api/chat'
import { isApiProviderConnector, isZapierProviderConnector, onLinkResult, waitForZapierAuthId, zapierConnectHref } from '@/lib/connectorProvider'

// ── ConnectPromptCard ─────────────────────────────────────────────────────────

const SIGN_IN_WAIT_MS = 300_000

type ConnectDecision = 'connected' | 'cancel'

interface ConnectPromptCardProps {
  prompt:       ConnectorConnectPrompt
  /** Records the answer in message state, so the card stays gone across remounts. */
  onDecided?:   (decision: ConnectDecision) => void
  /** The answer reached the backend: the turn's run may have been taken back up. */
  onAnswered?:  () => void
}

// Answers on their way to the backend, by the prompt's respond URL (unique to that prompt; a
// request id can repeat across messages): the decision sent and how it ends (null, or
// the failure). Module-level: it outlives a card that leaves the virtual list and remounts,
// which must neither send the answer again nor lose its outcome (a failure, with Try again).
const answersInFlight = new Map<string, { decision: ConnectDecision; outcome: Promise<Error | null> }>()

export function ConnectPromptCard({ prompt, onDecided, onAnswered }: ConnectPromptCardProps) {
  const [state,        setState]        = useState<'idle' | 'connecting' | 'polling' | 'error'>('idle')
  const [decided,      setDecided]      = useState(false)
  const [errorMsg,     setErrorMsg]     = useState('')
  // The answer was given but the chat was not told: retrying resends that answer alone,
  // not the whole sign-in.
  const [respondFailed, setRespondFailed] = useState<ConnectDecision | null>(null)
  // The answer is on its way: Try again shows it, and the last failure is not shown meanwhile.
  // An answer already in flight for this prompt (this card remounted while it was being sent),
  // read once when the card mounts: it seeds the state and refs below.
  const [pendingAtMount] = useState(() => answersInFlight.get(prompt.respond_url))
  const [responding, setResponding] = useState(pendingAtMount !== undefined)
  // api_key flow
  const [apiKeyFields, setApiKeyFields] = useState<Record<string, string>>({})
  const [fieldDefs,    setFieldDefs]    = useState<ApiKeyField[] | null>(
    prompt.api_key_fields && prompt.api_key_fields.length > 0 ? prompt.api_key_fields : null,
  )
  const [showApiForm,  setShowApiForm]  = useState(false)
  const abortedRef  = useRef(false)
  const answeredRef = useRef(false)
  // The "already connected" check and the sign-in poll can both call finish; only
  // one answer may be in flight, or the backend gets it twice.
  const respondingRef = useRef(pendingAtMount !== undefined)
  // The person said "Not now": that stays the card's answer until the backend has it (a
  // failed send keeps it for Try again). A connection found afterwards doesn't overrule it.
  const declinedRef = useRef(pendingAtMount?.decision === 'cancel')
  // This card sent the answer in flight itself (Strict Mode remounts the same card): it settles
  // it where it sent it, and does not also take it over.
  const sentHereRef = useRef(false)

  // A failed answer: the card says so and Try again resends that answer alone.
  const showFailure = useCallback((decision: ConnectDecision, failure: Error) => {
    setState('error')
    setRespondFailed(decision)
    setErrorMsg(failure.message)
    toast.error(decision === 'connected'
      ? `Connected ${prompt.connector.name}, but the chat was not told. Try again.`
      : 'Could not tell the chat. Try again.')
  }, [prompt.connector.name])

  // The turn that asked is waiting on this answer, or has left and takes its run back up on it.
  // "cancel" is "not now" for this one ask: the next request that needs the app asks again.
  const answer = useCallback(async (decision: ConnectDecision) => {
    if (answeredRef.current || abortedRef.current || respondingRef.current) return
    // Kept outside the card: a card that left the screen and came back mid-answer is a new
    // instance with empty refs, and must not send the same answer again.
    if (answersInFlight.has(prompt.respond_url)) return
    if (decision === 'cancel') declinedRef.current = true
    else if (declinedRef.current) return
    // The answer is only "given" once the backend has it. Marking it beforehand and
    // swallowing the failure left the run waiting for a reply that never came, with
    // this guard refusing every retry; so the flag is set after the POST resolves.
    respondingRef.current = true
    setResponding(true)
    // The outcome as a value rather than try/catch/finally: React Compiler cannot
    // compile a `finally`, and leaves the whole component unoptimised when it meets one.
    const outcome = respondToChatPrompt(decision, prompt.respond_url).then(
      () => null,
      (err: unknown) => (err instanceof Error ? err : new Error('Could not tell the chat your answer.')),
    )
    answersInFlight.set(prompt.respond_url, { decision, outcome })
    sentHereRef.current = true
    const failure = await outcome
    answersInFlight.delete(prompt.respond_url)
    respondingRef.current = false
    setResponding(false)
    if (failure) {
      // Gone meanwhile: a card mounted since has taken this answer over and shows the failure.
      if (abortedRef.current) return
      showFailure(decision, failure)
      return
    }
    answeredRef.current = true
    setRespondFailed(null)
    if (decision === 'connected') toast.success(`${prompt.connector.name} connected — continuing your request.`)
    onDecided?.(decision)
    onAnswered?.()
    if (!abortedRef.current) setDecided(true)
  }, [prompt.respond_url, prompt.connector.name, onDecided, onAnswered, showFailure])
  const finish = useCallback(() => answer('connected'), [answer])

  // The app may already be connected (from Connectors, or another tab) by the time this card shows.
  useEffect(() => {
    if (prompt.decision) return
    // Cleared on every mount, not only the first: StrictMode (and anything else that
    // re-runs effects) mounts again with the same refs after the cleanup below set it,
    // and a card left "aborted" never answers its turn or shows a failed sign-in.
    abortedRef.current = false
    // An answer already on its way (sent by this card before it left the screen): this card
    // takes it over instead of answering again. On success the card that sent it has told
    // the chat; on failure this one shows it, with Try again.
    // The one seen at render first: if it settled before this effect ran, its entry is gone
    // from the map, but the card was rendered as waiting on it and must still see how it ended.
    const pending = pendingAtMount ?? answersInFlight.get(prompt.respond_url)
    if (pending && !sentHereRef.current) {
      void pending.outcome.then((failure) => {
        if (abortedRef.current) return
        respondingRef.current = false
        setResponding(false)
        if (failure) showFailure(pending.decision, failure)
        else { answeredRef.current = true; setDecided(true) }
      })
      return () => { abortedRef.current = true }
    }
    if (pending) return () => { abortedRef.current = true }
    getConnector(prompt.connector.slug)
      .then((entry) => {
        if (entry.ownedConnections.some((row) => row.connected && !row.needsReconnect)) void finish()
        else if (prompt.auth_mode === 'api_key' && !abortedRef.current) {
          setFieldDefs((current) => current ?? (entry.apiKeyFields.length > 0 ? entry.apiKeyFields : [DEFAULT_API_KEY_FIELD]))
        }
      })
      .catch(() => {})
    return () => { abortedRef.current = true }
    // Checked once, when the card shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOAuth = useCallback((initData?: Record<string, string>) => {
    const isApi = isApiProviderConnector(prompt.provider)

    // The sign-in always runs in a popup, so the chat and its running turn stay where they are.
    // Opened without the noopener feature so the reference survives to be navigated and closed;
    // clearing popup.opener closes off reverse tabnabbing instead.
    const popup = isApi ? null : window.open('', '_blank', 'width=900,height=700')
    if (popup) { try { popup.opener = null } catch { /* best-effort */ } }
    setState('connecting')
    setErrorMsg('')

    // Our own sign-in landing page reports how the sign-in ended, sooner than the status poll would see it.
    const waiting = new AbortController()
    let ended = ''
    const stopListening = onLinkResult(prompt.connector.slug, (link) => {
      if (link === 'connected') void finish()
      else ended = link
      waiting.abort()
    })

    // initData carries per-tenant OAuth credentials (Shopify client_id/secret);
    // undefined for plain OAuth.
    initiateLink(prompt.connector.slug, initData)
      .then((link) => {
        if (abortedRef.current) return
        const status = { signal: waiting.signal, timeoutMs: SIGN_IN_WAIT_MS }
        if (isApi) return pollConnectorUntilActive(prompt.connector.slug, status)
        if (!link.redirectUrl) throw new Error('No redirect URL returned by server')
        const openUrl = isZapierProviderConnector(prompt.provider, link.redirectUrl)
          ? zapierConnectHref(link.redirectUrl)
          : link.redirectUrl
        if (popup && !popup.closed) {
          popup.location.href = openUrl
        } else {
          // Popup was blocked: a new tab instead. Its return value is never read, so noopener is safe here.
          window.open(openUrl, '_blank', 'noopener')
        }
        setState('polling')
        if (isZapierProviderConnector(prompt.provider, link.redirectUrl)) {
          return waitForZapierAuthId(waiting.signal).then(id => completeZapierLink(prompt.connector.slug, id))
        }
        return pollConnectorUntilActive(prompt.connector.slug, status)
      })
      .then((entry) => { if (entry) return finish() })
      .catch((err: unknown) => {
        // Also while an answer is on its way: the app is connected (the "already
        // connected" check found it), and a sign-in error now would be stale.
        if (abortedRef.current || answeredRef.current || respondingRef.current) return
        setState('error')
        setErrorMsg(
          ended === 'cancelled' ? 'The sign-in was cancelled.'
            : ended ? 'The sign-in did not go through.'
            : err instanceof Error ? err.message : 'Connection failed',
        )
        toast.error(`Failed to connect ${prompt.connector.name}`)
      })
      .finally(() => {
        stopListening()
        popup?.close()
      })
  }, [prompt, finish])

  // API-key connectors are linked through the same hosted Connect flow as
  // OAuth ones — the fields ride along as init_data. There is no separate
  // credential endpoint to post them to.
  const handleApiKey = useCallback(() => {
    handleOAuth(apiKeyFields as Record<string, string>)
  }, [handleOAuth, apiKeyFields])

  // Per-tenant OAuth (Shopify BYOA) declares required init fields in the connect
  // prompt; render the same credential form as api_key, but submit via the OAuth
  // path (posts init_data, then opens the hosted connect popup).
  const needsInitFields = oauthNeedsInitFields(prompt)
  const showCredentialForm = !isZapierProviderConnector(prompt.provider)
    && (prompt.auth_mode === 'api_key' || needsInitFields)

  if (decided || prompt.decision) return null

  const busy = state === 'connecting' || state === 'polling'
  const fields = fieldDefs ?? [DEFAULT_API_KEY_FIELD]
  const allFilled = fields.filter((field) => field.required).every((field) => (apiKeyFields[field.name] ?? '').trim())
  const connectLabel = state === 'polling' ? 'Waiting for connection…' : `Connect ${prompt.connector.name}`

  return (
    <ConnectorPromptShell
      connector={prompt.connector}
      title={<>Connect {prompt.connector.name} to continue</>}
      caption={prompt.tool_name
        ? <>Task needs <code style={{ fontFamily: 'var(--font-code)', fontSize: 'inherit' }}>{prompt.tool_name}</code> from {prompt.connector.name}.</>
        : <>Task needs access to {prompt.connector.name} to keep going.</>}
    >

      {state === 'error' && !responding && (
        <span role="alert" style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-caption)', color: 'var(--red-600)' }}>
          {errorMsg || 'Connection failed.'} Try again.
        </span>
      )}

      {state === 'polling' && (
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-caption)', color: 'var(--neutral-600)' }}>
          Finish the sign-in in the window that opened. This card checks {prompt.connector.name} until it is connected.
        </span>
      )}

      {showCredentialForm && showApiForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {fields.map((field) => (
            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label
                htmlFor={`cf-${prompt.connector.slug}-${field.name}`}
                style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-caption)', fontWeight: 'var(--font-weight-medium)', color: 'var(--neutral-600)' }}
              >
                {field.label}
              </label>
              <input
                id={`cf-${prompt.connector.slug}-${field.name}`}
                type={field.secret ? 'password' : 'text'}
                autoComplete="off"
                placeholder={field.help || field.label}
                value={apiKeyFields[field.name] ?? ''}
                disabled={busy}
                onChange={(e) => setApiKeyFields((prev) => ({ ...prev, [field.name]: e.target.value }))}
                style={{
                  padding:         'var(--space-1-5) var(--space-2-5)',
                  borderRadius:    'var(--radius-md)',
                  border:          '1px solid var(--neutral-300)',
                  fontFamily:      'var(--font-body)',
                  fontSize:        'var(--font-size-caption)',
                  outline:         'none',
                  width:           '100%',
                  boxSizing:       'border-box',
                  backgroundColor: 'var(--field-surface)',
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* While an answer is being sent (Not now, or the connected notice), the sign-in
          actions wait: starting a sign-in then would race the answer. A failed answer
          shows Try again instead, which stays available. And while a sign-in is under way,
          Not now waits: declining then would leave the sign-in window going. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
        {respondFailed !== 'connected' && (
          <Button size="sm" variant="outline" disabled={responding || busy} onClick={() => void answer('cancel')}>
            Not now
          </Button>
        )}
        {respondFailed ? (
          <Button size="sm" variant="approve" attention={!responding} loading={responding} onClick={() => void answer(respondFailed)}>
            Try again
          </Button>
        ) : showCredentialForm && !showApiForm ? (
          <Button size="sm" variant="approve" attention={!responding} disabled={responding} onClick={() => setShowApiForm(true)}>
            Enter credentials
          </Button>
        ) : showCredentialForm ? (
          <>
            <Button size="sm" variant="outline" disabled={busy || responding} onClick={() => setShowApiForm(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="approve"
              loading={busy}
              disabled={!allFilled || responding}
              onClick={prompt.auth_mode === 'api_key' ? handleApiKey : () => handleOAuth(apiKeyFields)}
            >
              {connectLabel}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="approve" attention={!busy && !responding} loading={busy} disabled={responding} onClick={() => handleOAuth()}>
            {connectLabel}
          </Button>
        )}
      </div>
    </ConnectorPromptShell>
  )
}

// The permission card lives in components/shared/PermissionPromptCard —
// one implementation for chat, persona, agent configure, and compare.
