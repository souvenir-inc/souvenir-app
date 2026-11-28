/**
 * A link from the backend the browser is about to open or navigate to (Stripe checkout, the
 * billing portal, an invoice): only an absolute https URL is accepted. A `javascript:`, `data:`
 * or plain-http value, or anything that isn't a URL, comes back as null rather than being followed.
 */
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

/** An https link on slack.com (Slack's sign-in and install screens), or null. */
export function slackUrl(value: unknown): string | null {
  const url = httpsUrl(value)
  if (!url) return null
  const host = new URL(url).hostname
  return host === 'slack.com' || host.endsWith('.slack.com') ? url : null
}
