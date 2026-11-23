// Sharing (docs-v2/dashboard/09-share-export-rules.md): the dummy workspace, who can do what, matches as
// you type, and what a board's link opens on. Pure, so the rules are testable.

import { COMPARISONS } from '../mock-data'
import { periodName } from '../period'

export type Role = 'view' | 'edit'
export type General = { to: 'none' } | { to: 'workspace'; role: Role }

export interface Person { kind: 'person'; id: string; name: string; email: string; initials: string; color: string; admin?: boolean; cantSee?: string[] }
export interface Team { kind: 'team'; id: string; name: string; members: string[] }
export type Member = Person | Team

/** Someone with access to a board (the owner is the board's, not in this list). */
export interface Grant { id: string; role: Role }

export interface Share { owner: string; grants: Grant[]; general: General }

export const WORKSPACE = 'Lumen & Co'
/** Members of the workspace, for "12 people lose access" (SH-19). */
export const WORKSPACE_SIZE = 14
/** Metrics only some people can see; Slack images lock them for everyone (SH-26). */
export const RESTRICTED = ['contribution-margin']

const avatar = (n: number) => `var(--dashboard-avatar-${n})`
export const PEOPLE: Person[] = [
  { kind: 'person', id: 'dev', name: 'Dev Shah', email: 'dev@lumenco.com', initials: 'DS', color: avatar(1), admin: true },
  { kind: 'person', id: 'sam', name: 'Sam Lee', email: 'sam@lumenco.com', initials: 'SL', color: avatar(2) },
  { kind: 'person', id: 'priya', name: 'Priya Nair', email: 'priya@lumenco.com', initials: 'PN', color: avatar(3), cantSee: ['contribution-margin'] },
  { kind: 'person', id: 'grace', name: 'Grace Kim', email: 'grace@lumenco.com', initials: 'GK', color: avatar(4) },
  { kind: 'person', id: 'greg', name: 'Greg Alvarez', email: 'greg@lumenco.com', initials: 'GA', color: avatar(5) },
  { kind: 'person', id: 'maya', name: 'Maya Patel', email: 'maya@lumenco.com', initials: 'MP', color: avatar(6) },
  { kind: 'person', id: 'omar', name: 'Omar Haddad', email: 'omar@lumenco.com', initials: 'OH', color: avatar(1) },
]
export const TEAMS: Team[] = [
  { kind: 'team', id: 'growth-team', name: 'Growth team', members: ['grace', 'greg', 'sam', 'omar'] },
  { kind: 'team', id: 'finance-team', name: 'Finance team', members: ['maya', 'omar', 'priya'] },
]
/** You, in the dummy workspace (SH-38). */
export const ME = 'dev'

export const memberById = (id: string): Member | undefined => TEAMS.find((t) => t.id === id) ?? PEOPLE.find((p) => p.id === id)
export const personById = (id: string): Person | undefined => PEOPLE.find((p) => p.id === id)
export const nameOf = (id: string) => memberById(id)?.name ?? id

/** "Dev Shah (you)". */
export const displayName = (id: string) => `${nameOf(id)}${id === ME ? ' (you)' : ''}`

// ── Matching (SH-10, SH-13) ─────────────────────────────────────────────────────

export type Match = { member: Member; has?: Role | 'owner' }

/** Teams first, then people; by the start of any word of the name, or of the email. */
export function matches(query: string, share: Share, picked: string[]): Match[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hit = (m: Member) =>
    m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)) || m.name.toLowerCase().startsWith(q) || (m.kind === 'person' && m.email.startsWith(q))
  const roleOf = (id: string): Role | 'owner' | undefined => (id === share.owner ? 'owner' : share.grants.find((g) => g.id === id)?.role)
  const list = [...TEAMS, ...PEOPLE].filter((m) => hit(m) && !picked.includes(m.id))
  return list.map((member) => ({ member, has: roleOf(member.id) }))
}

/** An email typed in full that isn't a member (SH-13). */
export const outsideEmail = (query: string): string | null => {
  const q = query.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && !PEOPLE.some((p) => p.email === q) ? q : null
}

// ── Access (SH-1, SH-3, SH-12, SH-16) ─────────────────────────────────────────────

/** People among `ids` (teams opened up) who can't see a metric among `metricIds`, with the first one. */
export function cantSeeOn(ids: string[], metricIds: string[]): { person: Person; metricId: string }[] {
  const people = new Set<string>()
  for (const id of ids) {
    const m = memberById(id)
    if (m?.kind === 'team') m.members.forEach((p) => people.add(p))
    else if (m) people.add(m.id)
  }
  const out: { person: Person; metricId: string }[] = []
  for (const id of people) {
    const p = personById(id)
    const metricId = p?.cantSee?.find((x) => metricIds.includes(x))
    if (p && metricId) out.push({ person: p, metricId })
  }
  return out
}

/** Someone's role: the highest of their own, their team's and the workspace's (SH-1). */
export function roleFor(share: Share, personId: string): Role | 'owner' | null {
  if (personId === share.owner) return 'owner'
  const roles: Role[] = []
  for (const g of share.grants) {
    const m = memberById(g.id)
    if (g.id === personId || (m?.kind === 'team' && m.members.includes(personId))) roles.push(g.role)
  }
  if (share.general.to === 'workspace') roles.push(share.general.role)
  return roles.includes('edit') ? 'edit' : roles.length ? 'view' : null
}

/** People who'd lose access going back to Only people added (SH-19). */
export function loseCount(share: Share): number {
  const keep = new Set<string>([share.owner])
  for (const g of share.grants) {
    const m = memberById(g.id)
    if (m?.kind === 'team') m.members.forEach((p) => keep.add(p))
    else keep.add(g.id)
  }
  return Math.max(0, WORKSPACE_SIZE - keep.size)
}

/** Teams first, then people by name (SH-14). */
export const sortGrants = (grants: Grant[]) =>
  [...grants].sort((a, b) => {
    const ta = memberById(a.id)?.kind === 'team' ? 0 : 1
    const tb = memberById(b.id)?.kind === 'team' ? 0 : 1
    return ta - tb || nameOf(a.id).localeCompare(nameOf(b.id))
  })

// ── The link (SH-20 – SH-23) ───────────────────────────────────────────────────────

export function boardLink(origin: string, boardId: string, period: string, compare: string): string {
  const q = new URLSearchParams({ board: boardId, period })
  if (compare !== 'previous') q.set('compare', compare)
  return `${origin}/dashboard?${q.toString()}`
}

export const periodLabel = periodName
/** "Last 7 days • Previous period"; "Last 7 days" with no comparison. */
export function datesLabel(period: string, compare: string): string {
  const c = COMPARISONS.find((x) => x.id === compare)
  return compare === 'none' || !c ? periodLabel(period) : `${periodLabel(period)} • ${c.menuLabel ?? c.label}`
}
export const linkCaption = (period: string, compare: string) => `Opens on ${datesLabel(period, compare)}, for people who can see this board.`

// ── Boards you can't open (SH-24, stand-in) ──────────────────────────────────────────

export const NO_ACCESS_BOARDS: Record<string, { label: string; owner: string }> = {
  'pricing-tests': { label: 'Pricing tests', owner: 'maya' },
}
