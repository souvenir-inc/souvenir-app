import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import { cn } from '@/lib/utils'

// The screen's frame and its states (loading, problem, no store, no boards): shared by the screen
// and the route's loading.tsx and error.tsx, so the first paint and the board line up.

/** The panel every state of the screen sits in (Figma base 17:889). */
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--neutral-50)] py-2.5 pr-2.5">
      <section aria-label="Dashboard" className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--layout-radius)] border border-solid border-[var(--border-default)] bg-[var(--dashboard-panel-bg)]">
        <div className="mx-auto box-border w-full max-w-[1232px] px-4 pt-[15px]">{children}</div>
      </section>
    </div>
  )
}

const QUIET_BUTTON = 'h-8 cursor-pointer rounded-lg border border-solid border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3.5 text-[13px] text-[var(--dashboard-figure)] no-underline outline-none hover:bg-[var(--neutral-100)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]'

/** Something the warehouse didn't answer, with Try again (CR-21). */
export function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div data-board-failed className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-xl text-[13px] leading-[17px] text-[var(--dashboard-figure)]">
      <p className="m-0">{text}</p>
      {/* eslint-disable-next-line no-restricted-syntax -- ds-allow: the white Try again of Figma 170:47131 (1px #D3CEC8, 8px radius, 32px) */}
      <button type="button" onClick={onRetry} className={QUIET_BUTTON}>Try again</button>
    </div>
  )
}

/** No warehouse yet: one is made when the organization connects its store. */
export function NoStore() {
  return (
    <div data-no-store className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-[13px] leading-5 text-[var(--dashboard-figure)]">
      <p className="m-0 text-[15px] font-medium">Connect your store to see its numbers</p>
      <p className="m-0 max-w-[360px] text-[var(--dashboard-label)]">Your dashboard builds itself once Shopify or another store is connected. The first sync takes a few minutes.</p>
      { }
      <a href={ORG_CONNECTORS_ROUTE} className={cn(QUIET_BUTTON, 'flex items-center')}>Connect an app</a>
    </div>
  )
}

/** Every board was deleted or left. */
export function EmptyBoardList() {
  return <div className="flex min-h-[240px] items-center justify-center text-[13px] text-[var(--dashboard-label)]">No boards yet.</div>
}

/** Plain card skeletons, no names or numbers (08 NB-21, NB-31). */
export function Skeleton() {
  return (
    <div className="@container" data-skeleton aria-hidden>
      <ul className="m-0 grid list-none auto-rows-[156px] grid-cols-1 gap-4 p-0 @lg:grid-cols-2 @min-[60rem]:grid-cols-4">
        {[4, 1, 1, 1, 1].map((span, i) => (
          <li key={i} className="relative rounded-xl bg-[var(--dashboard-card-bg)] shadow-[var(--dashboard-card-shadow)]" style={{ gridColumn: span === 4 ? '1 / -1' : undefined }}>
            <span className="dashboard-shape-shimmer absolute left-4 top-4 h-4 w-24 rounded-md" />
            <span className="dashboard-shape-shimmer absolute bottom-[18px] left-4 h-7 w-28 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  )
}
