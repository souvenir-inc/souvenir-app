// Sharing (fe-handbook/features/dashboard/source-docs/09-share-export-rules.md): the workspace's members, who can do what
// with a board, matches as you type, and what a board's link opens on. Pure, so the rules are testable.

import type { General, Grant, Role } from '@/lib/api/warehouse'
import { DASHBOARD_ROUTE } from '@/lib/routes'
import { COMPARISONS, periodName } from '../period'

export type { General, Grant, Role }

export interface Person { id: string; name: string; email: string; initials: string; color: string }

/** Who has access to a board: its owner, the people added, and everyone in the workspace at the general role. */
export interface Share { ownerId: string; grants: Grant[]; general: General }

const AVATARS = 6
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

export type Match = { person: Person; has?: Role | 'owner' }

/** The workspace's members, as Share lists and finds them; the viewer is one of them. */
export class People {
  readonly list: Person[]

  constructor(members: { id: string; name: string; email: string }[], readonly viewer: string, readonly workspace: string) {
    this.list = members.map((m, i) => ({
      id: m.id, name: m.name || m.email, email: m.email, initials: initialsOf(m.name || m.email), color: `var(--dashboard-avatar-${(i % AVATARS) + 1})`,
    }))
  }

  get(id: string): Person | undefined {
    return this.list.find((p) => p.id === id)
  }

  name(id: string): string {
    return this.get(id)?.name ?? 'A former member'
  }

  /** "<name> (you)" for the viewer. */
  displayName(id: string): string {
    return `${this.name(id)}${id === this.viewer ? ' (you)' : ''}`
  }

  /** By the start of any word of the name, or of the email; people already picked are left out (SH-10). */
  matches(query: string, share: Share, picked: string[]): Match[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const hit = (p: Person) => p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || p.name.toLowerCase().startsWith(q) || p.email.toLowerCase().startsWith(q)
    const has = (id: string): Role | 'owner' | undefined => (id === share.ownerId ? 'owner' : share.grants.find((g) => g.userId === id)?.role)
    return this.list.filter((p) => hit(p) && !picked.includes(p.id)).map((person) => ({ person, has: has(person.id) }))
  }

  /** An email typed in full that isn't a member's (SH-13). */
  outsideEmail(query: string): string | null {
    const q = query.trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && !this.list.some((p) => p.email.toLowerCase() === q) ? q : null
  }

  /** Members who'd lose access going back to Only people added (SH-19). */
  loseCount(share: Share): number {
    const keep = new Set([share.ownerId, ...share.grants.map((g) => g.userId)])
    return this.list.filter((p) => !keep.has(p.id)).length
  }

  /** People by name (SH-14). */
  sortGrants(grants: Grant[]): Grant[] {
    return [...grants].sort((a, b) => this.name(a.userId).localeCompare(this.name(b.userId)))
  }
}

/** Someone's role: the higher of their own and the workspace's (SH-1); the server decides, this reads the same rule for the list. */
export function roleFor(share: Share, personId: string): Role | 'owner' | null {
  if (personId === share.ownerId) return 'owner'
  const roles = [...share.grants.filter((g) => g.userId === personId).map((g) => g.role), ...(share.general === 'none' ? [] : [share.general])]
  return roles.includes('edit') ? 'edit' : roles.length ? 'view' : null
}

// ── The link (SH-20 – SH-23) ───────────────────────────────────────────────────────

/**
 * The one link to a board (copy link, Slack posts, the board's own menu): it opens on the given dates
 * (SH-21); without them it opens on the board's own. `compare` is left out when it's the default.
 */
export function boardLink(origin: string, boardId: string, period?: string, compare?: string): string {
  const q = new URLSearchParams({ board: boardId })
  if (period) q.set('period', period)
  if (compare && compare !== 'previous') q.set('compare', compare)
  return `${origin}${DASHBOARD_ROUTE}?${q.toString()}`
}

export const periodLabel = periodName
/** "Last 7 days • Previous period"; "Last 7 days" with no comparison. */
export function datesLabel(period: string, compare: string): string {
  const c = COMPARISONS.find((x) => x.id === compare)
  return compare === 'none' || !c ? periodLabel(period) : `${periodLabel(period)} • ${c.menuLabel ?? c.label}`
}
export const linkCaption = (period: string, compare: string) => `Opens on ${datesLabel(period, compare)}, for people who can see this board.`

/** Copies the text; false when the browser refuses (SH-22). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
