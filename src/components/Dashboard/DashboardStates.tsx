import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ORG_CONNECTORS_ROUTE, ROOT_ROUTE } from '@/lib/routes'
import { LOAD_COPY } from './board/copy'
import type { LoadFailure } from './board/errors'

// The screen's frame and its states (loading, problem, not turned on, no access, no store, no
// boards): shared by the screen and the route's loading.tsx, so the first paint and the board line
// up. Copy comes from board/errors.ts.

/** The panel every state of the screen sits in (Figma base 17:889). */
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--neutral-50)] py-2.5 pr-2.5">
      <section aria-label="Dashboard" className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--layout-radius)] border border-solid border-[var(--border-default)] bg-[var(--dashboard-panel-bg)]">
        <div className="mx-auto box-border w-full max-w-[1232px] px-4 pt-[var(--dashboard-page-top)]">{children}</div>
      </section>
    </div>
  )
}

/**
 * Something the warehouse didn't answer (CR-21). Try again only when trying again can work
 * (API-EM-06); otherwise a way out, never a dead end (SD-EH-03).
 */
export function Problem({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <EmptyState
      data-board-failed
      role="alert"
      title={text}
      description={onRetry ? undefined : LOAD_COPY.notRetryable}
      action={onRetry
        ? <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>
        : <Button variant="outline" size="sm" asChild><Link href={ROOT_ROUTE}>Go home</Link></Button>}
    />
  )
}

/** Why the dashboard can't show: the warehouse is off, the viewer was refused, or a load failed. */
export function LoadProblem({ failure, text, onRetry }: { failure: LoadFailure; text: string; onRetry: () => void }) {
  if (failure.kind === 'not-enabled') return <NotEnabled />
  if (failure.kind === 'no-access') return <NoDashboardAccess />
  return <Problem text={text} onRetry={failure.retryable ? onRetry : undefined} />
}

/** The organization's warehouse isn't turned on: the dashboard isn't available (warehouseEnabled false). */
export function NotEnabled() {
  return <EmptyState data-not-enabled role="status" title={LOAD_COPY.notEnabled.title} description={LOAD_COPY.notEnabled.description} action={<HomeLink />} />
}

/** The warehouse refused the viewer (API-ER-14). */
export function NoDashboardAccess() {
  return <EmptyState data-no-access role="status" title={LOAD_COPY.noAccess.title} description={LOAD_COPY.noAccess.description} action={<HomeLink />} />
}

function HomeLink() {
  return <Button variant="outline" size="sm" asChild><Link href={ROOT_ROUTE}>Go home</Link></Button>
}

/** No warehouse yet: one is made when the organization connects its store. */
export function NoStore() {
  return (
    <EmptyState
      data-no-store
      title="Connect your store to see its numbers"
      description="Your dashboard builds itself once Shopify or another store is connected. The first sync takes a few minutes."
      action={<Button variant="outline" size="sm" asChild><Link href={ORG_CONNECTORS_ROUTE}>Connect an app</Link></Button>}
    />
  )
}

/** Every board was deleted or left: start a new one (SD-EH-07). */
export function EmptyBoardList({ onNewBoard }: { onNewBoard: () => void }) {
  return (
    <EmptyState
      data-no-boards
      title={LOAD_COPY.noBoards.title}
      description={LOAD_COPY.noBoards.description}
      action={<Button variant="outline" size="sm" onClick={onNewBoard}>New board</Button>}
    />
  )
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
