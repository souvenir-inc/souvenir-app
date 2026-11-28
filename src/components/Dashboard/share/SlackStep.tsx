'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Hash, TriangleAlert, X } from 'lucide-react'
import { Button, IconButton, Select } from '@/components/ui'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { useOrgIdentity } from '@/context/org-context'
import { ApiError } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import { orgScope } from '@/lib/query-keys'
import { ORG_SOUVENIR_SLACK_ROUTE } from '@/lib/routes'
import type { CardView } from '../MetricCard'
import { dims } from '../grid-layout'
import { useDashboardData } from '../live/dashboard-data'
import { postBoardToSlackOptions } from '../live/warehouse-mutations'
import { warehouseQueries } from '../live/warehouse-queries'
import type { Board } from '../tabs/board-state'
import { BoardSnapshot, SNAPSHOT_WIDTH } from './BoardSnapshot'
import { fileBase, nodeToPng } from './export'
import { datesLabel, type People } from './share-model'

// Post to Slack, the Share dialog's second step (Figma 171:94068; SH-25 – SH-28).

/** Why a post didn't go, as the person reads it (API-ER-06: never the server's message). */
function postFailure(error: unknown, channel: string): string {
  const status = error instanceof ApiError ? error.status : 0
  // 403: the person or Souvenir has left that channel since the list was read. 409: Slack was
  // disconnected from the organization.
  return status === 403 ? `You or Souvenir are no longer in #${channel}. Pick another channel.`
    : status === 409 ? 'Slack is no longer connected to your organization.'
    : `Couldn’t post to #${channel}. Try again.`
}

export function SlackStep({ board, period, compare, cardView, stamp, link, people, onBack, onPosted }: {
  board: Board; period: string; compare: string; cardView: (id: string) => CardView | undefined; stamp: string; link: string; people: People
  onBack: () => void; onPosted: (channel: string) => void
}) {
  const { warehouse, today } = useDashboardData()
  const { orgId } = useOrgIdentity()
  const org = orgScope(orgId)
  // The channels Souvenir is in; none listed means Slack isn't installed for the workspace (SH-27).
  const slack = useQuery(warehouseQueries.slackChannels(org))
  const post = useMutation(postBoardToSlackOptions(org))
  const channels = slack.data?.channels ?? []
  const [picked, setPicked] = useState<string | null>(null)
  const channel = channels.find((c) => c.id === picked) ?? channels[0]
  /** Why the last post didn't go; null when it did (or none was tried). */
  const [failed, setFailed] = useState<string | null>(null)
  // The picture that's posted: the board at full size, drawn off screen.
  const shotRef = useRef<HTMLDivElement>(null)
  const sharer = people.name(people.viewer)
  const rows = board.cards.reduce((h, c) => Math.max(h, c.y + dims(c.size).h), 1)
  const fullHeight = 32 + rows * 156 + (rows - 1) * 16 + 28
  const width = 444
  const scale = width / SNAPSHOT_WIDTH

  const send = () => {
    const node = shotRef.current
    if (!channel || !node || post.isPending) return
    setFailed(null)
    post.mutate({
      warehouse, boardId: board.id, picture: () => nodeToPng(node), filename: `${fileBase(board.label, period, today)}.png`,
      channelId: channel.id, text: `${sharer} shared *${board.label}* · ${datesLabel(period, compare)}\n${link}`,
    }, {
      onSuccess: () => onPosted(channel.name),
      onError: (error) => {
        const status = error instanceof ApiError ? error.status : 0
        logger.event('dashboard.slack_post_failed', { status })
        // Either way the channel list is read again.
        if (status === 403 || status === 409) void slack.refetch()
        setFailed(postFailure(error, channel.name))
      },
    })
  }

  return (
    <>
      <div className="relative flex shrink-0 items-center gap-1.5 px-4 pb-3 pt-5">
        <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Back to people" onClick={onBack} className="size-7 rounded-md" icon={<ArrowLeft strokeWidth={1.5} absoluteStrokeWidth />} />
        <DialogTitle className="text-[length:var(--font-size-body-lg)] font-semibold leading-6 text-[var(--dashboard-figure)]">Post to Slack</DialogTitle>
        <DialogClose asChild>
          <IconButton variant="ghost" size="sm" iconSize={14} aria-label="Close" className="absolute right-3.5 top-4 size-7 rounded-md" icon={<X strokeWidth={1.5} absoluteStrokeWidth />} />
        </DialogClose>
      </div>

      {slack.isLoading ? (
        <p role="status" className="m-0 px-5 pb-5 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">Looking for your Slack channels…</p>
      ) : slack.isError ? (
        <div data-slack-failed className="flex flex-col items-start gap-1 px-5 pb-5">
          <p role="alert" className="m-0 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-error)]">Couldn’t reach Slack.</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => { void slack.refetch() }}>Try again</Button>
        </div>
      ) : !slack.data?.connected || !channel ? (
        // Slack isn't installed, or there's no channel both the person and Souvenir are in (SH-27).
        // The second also covers a person whose Slack account isn't linked to Souvenir yet: the
        // warehouse lists no channels for them either, and can't say which of the two it is.
        <div data-slack-off className="flex flex-col items-start gap-1 px-5 pb-5">
          <p className="m-0 text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">
            {slack.data?.connected ? 'No Slack channel you and Souvenir are both in' : 'Connect Slack to post boards to a channel'}
          </p>
          <p className="m-0 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-label)]">
            {slack.data?.connected
              ? 'Boards go only to channels you’re both in. Invite Souvenir to one of yours, or link your Slack account to Souvenir if you haven’t.'
              : 'You’ll pick the channel each time you post.'}
          </p>
          {slack.data?.connected ? (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => { void slack.refetch() }}>Check again</Button>
          ) : (
            <Button size="sm" className="mt-3" onClick={() => { window.location.assign(ORG_SOUVENIR_SLACK_ROUTE) }}>Connect Slack</Button>
          )}
        </div>
      ) : (
        <>
          <div className="kaya-scrollbar min-h-0 flex-1 overflow-y-auto px-5">
            <p className="m-0 pb-1.5 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">Channel</p>
            <div data-channel={channel.name}>
              <Select
                aria-label="Channel"
                value={channel.id}
                onValueChange={(id) => setPicked(id)}
                options={channels.map((c) => ({ value: c.id, label: `#${c.name}`, icon: <Hash aria-hidden size={13} strokeWidth={1.5} absoluteStrokeWidth /> }))}
                variant="outline"
                menuSize="lg"
                className="h-10 min-h-10 w-full justify-between rounded-lg border-[var(--dashboard-list-border)] bg-[var(--dashboard-card-bg)] px-3 [font-family:inherit] font-normal text-[var(--dashboard-figure)]"
              />
            </div>

            <p className="m-0 pb-1.5 pt-4 text-[length:var(--font-size-small)] font-medium leading-4 text-[var(--dashboard-label)]">Preview</p>
            <div data-slack-preview className="flex flex-col gap-2 rounded-xl border border-solid border-[var(--neutral-200)] bg-[var(--dashboard-slack-preview)] p-3">
              <p className="m-0 flex items-center gap-2 text-[length:var(--font-size-body-sm)] leading-5">
                <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-[var(--neutral-900)] text-[length:var(--font-size-caption)] font-semibold text-[var(--dashboard-tab-active-text)]">S</span>
                <span className="font-semibold text-[var(--dashboard-figure)]">Souvenir</span>
                <span className="text-[length:var(--font-size-small)] text-[var(--dashboard-label)]">now</span>
              </p>
              <p className="m-0 text-[length:var(--font-size-body-sm)] leading-5 text-[var(--dashboard-figure)]">
                {sharer} shared <strong className="font-semibold">{board.label}</strong> · {datesLabel(period, compare)}
              </p>
              <div aria-label="Board image" role="img" className="overflow-hidden rounded-lg border border-solid border-[var(--neutral-200)]" style={{ width, height: fullHeight * scale }}>
                <div aria-hidden className="pointer-events-none origin-top-left" style={{ transform: `scale(${scale})` }}>
                  <BoardSnapshot cards={board.cards} cardView={cardView} stamp={stamp} />
                </div>
              </div>
              <span className="w-fit max-w-full truncate text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)] underline">{link}</span>
            </div>
            {/* The picture itself, at full size and off screen (the preview above is scaled down). */}
            <div aria-hidden style={{ position: 'fixed', left: 0, top: 0, transform: 'translateX(-200vw)', pointerEvents: 'none' }}>
              <BoardSnapshot ref={shotRef} cards={board.cards} cardView={cardView} stamp={stamp} />
            </div>
            {failed && (
              <p role="alert" data-slack-failed className="m-0 flex items-center gap-1.5 pt-2.5 text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-error)]">
                <TriangleAlert aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />{failed}
              </p>
            )}
          </div>
          <div className="mt-4 flex shrink-0 items-center justify-end gap-2 border-t border-solid border-[var(--neutral-200)] px-5 py-4">
            <Button variant="outline" size="sm" onClick={onBack}>Cancel</Button>
            <Button size="sm" data-slack-post loading={post.isPending} onClick={send}>Post to #{channel.name}</Button>
          </div>
        </>
      )}
    </>
  )
}
