import type { BoardCard, CardSize, Metric, Period } from './types'
import type { Board, DashboardState, Person } from './tabs/board-state'
import { flowCards } from './grid-layout'

// Dummy data until the backend has dashboard endpoints. "Store overview" is the Figma board
// (node 17:889) value for value; the other boards reuse the same shapes.

const WEEKS = ['13 Oct', '20 Oct', '27 Oct', '3 Nov', '10 Nov'] as const

/** Five weekly totals; the last week is still in progress. */
function weekly(values: [number, number, number, number, number]) {
  return values.map((value, i) => ({ week: WEEKS[i], value, inProgress: i === WEEKS.length - 1 }))
}

// The Figma sparklines (Revenue, Net sales), as values on a 0–82 scale.
const RISING = {
  current: [13.7, 23.5, 17, 39.8, 33.3, 52.7, 46.2, 69, 62.5, 82],
  previous: [7.2, 10.5, 4, 17, 13.7, 23.5, 20.2, 30, 26.7, 36.5],
}
const RISING_2 = {
  current: [16.3, 24.5, 20.4, 40.9, 32.7, 53.3, 49.2, 69.7, 61.5, 82],
  previous: [8.1, 12.2, 4, 20.4, 16.3, 28.6, 24.5, 36.8, 32.7, 45.1],
}
const FALLING = {
  current: [...RISING.current].reverse(),
  previous: [...RISING.previous].reverse(),
}
const FLAT = {
  current: [40, 46, 38, 49, 44, 52, 47, 55, 50, 56],
  previous: [36, 40, 34, 42, 39, 45, 41, 47, 44, 48],
}

const up = (label: string, sentiment: 'positive' | 'negative' = 'positive') => ({ label, direction: 'up' as const, sentiment })
const down = (label: string, sentiment: 'positive' | 'negative' = 'positive') => ({ label, direction: 'down' as const, sentiment })

export const METRICS: Record<string, Metric> = Object.fromEntries(
  ([
    { id: 'aov', label: 'Average order value', source: 'shopify', value: '$86.40', change: up('1.9%'), trend: FLAT, weekly: weekly([84.1, 85.2, 86.9, 85.7, 86.4]), format: 'currency' },
    { id: 'orders', label: 'Orders', source: 'shopify', value: '558', change: up('6.1%'), trend: RISING, weekly: weekly([165, 152, 156, 160, 84]), format: 'number' },
    { id: 'new-customers', label: 'New customers', source: 'shopify', value: '312', change: up('8.0%'), trend: RISING_2, weekly: weekly([88, 79, 84, 92, 41]), format: 'number' },
    { id: 'roas', label: 'Platform ROAS', source: 'meta', value: '2.6x', change: up('3.0%'), trend: FLAT, weekly: weekly([2.4, 2.5, 2.5, 2.6, 2.6]), format: 'ratio' },
    { id: 'ad-spend', label: 'Ad spend', source: 'meta', value: '$15.6k', change: up('5.0%'), trend: RISING, weekly: weekly([4400, 4100, 4300, 4600, 2200]), format: 'currency' },
    { id: 'revenue', label: 'Revenue', source: 'shopify', value: '$48.2k', change: up('12.4%'), trend: RISING, weekly: weekly([13800, 12900, 13300, 14100, 7200]), format: 'currency' },
    { id: 'cpa', label: 'Platform CPA', source: 'meta', value: '$24.10', change: down('2.2%'), trend: FALLING, weekly: weekly([26.2, 25.4, 24.9, 24.1, 24.3]), format: 'currency' },
    { id: 'ctr', label: 'CTR', source: 'meta', value: '1.42%', change: down('0.8%', 'negative'), trend: FALLING, weekly: weekly([1.51, 1.48, 1.45, 1.42, 1.4]), format: 'percent' },
    { id: 'net-sales', label: 'Net sales', source: 'shopify', value: '$41.9k', change: up('10.8%'), trend: RISING_2, weekly: weekly([12000, 11200, 11600, 12300, 6300]), format: 'currency' },
    { id: 'discount-rate', label: 'Discount rate', source: 'shopify', value: '13.1%', change: up('1.4%', 'negative'), trend: FLAT, weekly: weekly([12.2, 12.6, 12.9, 13.1, 13.4]), format: 'percent' },
    { id: 'refund-rate', label: 'Refund rate', source: 'shopify', value: '4.32%', change: down('0.3%'), trend: FALLING, weekly: weekly([4.6, 4.5, 4.4, 4.32, 4.3]), format: 'percent' },
    // Growth
    { id: 'sessions', label: 'Sessions', source: 'shopify', value: '24.8k', change: up('9.2%'), trend: RISING, weekly: weekly([6900, 6400, 6700, 7100, 3500]), format: 'number' },
    { id: 'conversion-rate', label: 'Conversion rate', source: 'shopify', value: '2.25%', change: up('0.4%'), trend: FLAT, weekly: weekly([2.1, 2.2, 2.2, 2.3, 2.25]), format: 'percent' },
    { id: 'returning-rate', label: 'Returning customer rate', source: 'shopify', value: '31.4%', change: up('2.1%'), trend: RISING_2, weekly: weekly([29.8, 30.4, 30.9, 31.4, 31.6]), format: 'percent' },
    { id: 'cac', label: 'Customer acquisition cost', source: 'meta', value: '$50.00', change: down('3.6%'), trend: FALLING, weekly: weekly([54, 52.5, 51.2, 50, 49.6]), format: 'currency' },
    // Ads
    { id: 'impressions', label: 'Impressions', source: 'meta', value: '1.1M', change: up('7.7%'), trend: RISING, weekly: weekly([310000, 290000, 300000, 320000, 160000]), format: 'number' },
    { id: 'clicks', label: 'Link clicks', source: 'meta', value: '15.6k', change: up('4.9%'), trend: RISING_2, weekly: weekly([4300, 4100, 4200, 4500, 2300]), format: 'number' },
    { id: 'cpm', label: 'CPM', source: 'meta', value: '$14.18', change: down('1.1%'), trend: FALLING, weekly: weekly([14.6, 14.4, 14.3, 14.2, 14.1]), format: 'currency' },
    // Contribution margin
    { id: 'contribution-margin', label: 'Contribution margin', source: 'shopify', value: '$11.3k', change: up('14.6%'), trend: RISING, weekly: weekly([3200, 2900, 3100, 3400, 1600]), format: 'currency' },
    { id: 'gross-profit', label: 'Gross profit', source: 'shopify', value: '$26.9k', change: up('11.0%'), trend: RISING_2, weekly: weekly([7600, 7100, 7400, 7900, 4000]), format: 'currency' },
    { id: 'cogs', label: 'Cost of goods', source: 'shopify', value: '$15.0k', change: up('9.4%', 'negative'), trend: RISING, weekly: weekly([4300, 4000, 4100, 4400, 2200]), format: 'currency' },
    { id: 'shipping', label: 'Shipping costs', source: 'shopify', value: '$3.4k', change: down('2.8%'), trend: FALLING, weekly: weekly([980, 940, 950, 930, 470]), format: 'currency' },
  ] satisfies Metric[]).map((m) => [m.id, m]),
)

// ── Boards ──────────────────────────────────────────────────────────────────────
// Twelve tabs, so the row folds into "6 more" as in the Figma (141:21681); Q4 plan is shared
// with you by Maya Patel, view only; two hidden boards and two in Recently deleted.

type Spec = [string, CardSize][]
// Positions as the grid lays the cards out in this order (grid-layout.ts flow).
const cards = (spec: Spec): BoardCard[] => flowCards(spec.map(([metricId, size]) => ({ metricId, size })))

const MAYA: Person = { name: "Maya Patel", initials: "MP", color: "var(--dashboard-avatar-violet)" }

const BOARD_SPECS: Array<{ id: string; label: string; period?: string; access?: Board["access"]; sharedBy?: Person; cards: Spec }> = [
  { id: "store-overview", label: "Store overview", cards: [["aov", "sm"], ["orders", "lg"], ["new-customers", "sm"], ["roas", "sm"], ["ad-spend", "sm"], ["revenue", "md"], ["cpa", "sm"], ["ctr", "sm"], ["net-sales", "md"], ["discount-rate", "sm"], ["refund-rate", "sm"]] },
  { id: "growth", label: "Growth", period: "30d", cards: [["sessions", "md"], ["conversion-rate", "sm"], ["returning-rate", "sm"], ["new-customers", "lg"], ["cac", "sm"], ["aov", "sm"], ["orders", "sm"], ["revenue", "sm"]] },
  { id: "ads", label: "Ads", cards: [["ad-spend", "lg"], ["roas", "sm"], ["cpa", "sm"], ["ctr", "sm"], ["cpm", "sm"], ["impressions", "md"], ["clicks", "md"]] },
  { id: "contribution-margin", label: "Contribution margin", cards: [["contribution-margin", "lg"], ["gross-profit", "sm"], ["net-sales", "sm"], ["cogs", "sm"], ["shipping", "sm"], ["revenue", "md"], ["discount-rate", "sm"], ["refund-rate", "sm"]] },
  { id: "weekly-check-in", label: "Weekly check-in", cards: [["revenue", "md"], ["orders", "sm"], ["aov", "sm"], ["net-sales", "md"], ["roas", "sm"], ["ad-spend", "sm"]] },
  { id: "retention", label: "Retention", period: "90d", cards: [["returning-rate", "lg"], ["refund-rate", "sm"], ["orders", "sm"], ["new-customers", "sm"], ["aov", "sm"]] },
  { id: "email-sms", label: "Email & SMS", cards: [["sessions", "md"], ["conversion-rate", "sm"], ["clicks", "sm"], ["revenue", "md"]] },
  { id: "wholesale", label: "Wholesale", cards: [["orders", "lg"], ["aov", "sm"], ["gross-profit", "sm"], ["shipping", "sm"], ["cogs", "sm"]] },
  { id: "q4-plan", label: "Q4 plan", access: "view", sharedBy: MAYA, cards: [["revenue", "lg"], ["ad-spend", "sm"], ["roas", "sm"], ["new-customers", "sm"], ["net-sales", "sm"]] },
  { id: "returns", label: "Returns", cards: [["refund-rate", "md"], ["orders", "sm"], ["shipping", "sm"]] },
  { id: "inventory", label: "Inventory", cards: [["cogs", "md"], ["orders", "sm"], ["gross-profit", "sm"]] },
  { id: "founder-overview", label: "Founder overview", cards: [["revenue", "md"], ["contribution-margin", "md"], ["orders", "sm"], ["new-customers", "sm"], ["roas", "sm"], ["cac", "sm"]] },
  // Hidden
  { id: "holiday-2025", label: "Holiday 2025", cards: [["revenue", "lg"], ["orders", "sm"], ["discount-rate", "sm"]] },
  { id: "creative-tests", label: "Creative tests", cards: [["ctr", "md"], ["cpm", "sm"], ["impressions", "sm"]] },
  // Recently deleted
  { id: "q3-review", label: "Q3 review", cards: [["revenue", "md"], ["orders", "sm"], ["aov", "sm"]] },
  { id: "spring-sale", label: "Spring sale", cards: [["revenue", "md"], ["discount-rate", "sm"], ["orders", "sm"]] },
]

const DAY = 86_400_000

/** The starting state. `now` dates the Recently deleted boards (4 and 18 days ago). */
export function initialDashboardState(now: number): DashboardState {
  const boards = Object.fromEntries(BOARD_SPECS.map((b) => {
    const c = cards(b.cards)
    return [b.id, { id: b.id, label: b.label, cards: c, initialCards: c, period: b.period ?? "7d", compare: "previous", access: b.access ?? "owner", sharedBy: b.sharedBy } satisfies Board]
  }))
  const tabs = BOARD_SPECS.slice(0, 12).map((b) => b.id)
  return {
    boards,
    tabs,
    hidden: ["holiday-2025", "creative-tests"],
    deleted: [
      { id: "q3-review", deletedAt: now - 4 * DAY },
      { id: "spring-sale", deletedAt: now - 18 * DAY },
    ],
    // The dashboard opens on your home board, the first tab (TAB-2).
    openId: tabs[0],
  }
}

export const PERIODS: Period[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
]

export const COMPARISONS: Period[] = [
  { id: 'previous', label: 'vs previous', menuLabel: 'Previous period' },
  { id: 'last-year', label: 'vs last year', menuLabel: 'Same period last year' },
  { id: 'none', label: 'No comparison' },
]

// ── Data sources (Figma 6D-3) ────────────────────────────────────────────────
// The apps cards read from, with when each last synced. All fresh in the dummy data.

export type SyncStatus = 'fresh' | 'behind' | 'failed'

export const SOURCE_SYNC: Record<'shopify' | 'meta', { minutesAgo: number; status: SyncStatus }> = {
  shopify: { minutesAgo: 2, status: 'fresh' },
  meta: { minutesAgo: 3, status: 'fresh' },
}
