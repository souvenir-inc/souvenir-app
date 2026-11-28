'use client'

import { createElement, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useOrg } from '@/context/org-context'
import { ApiError } from '@/lib/api/client'
import type { Warehouse } from '@/lib/api/warehouse'
import { logger } from '@/lib/logger'
import { orgScope, queryKeys } from '@/lib/query-keys'
import { fileBase, numbersCsv, saveFile } from '../share/export'
import { setViewDates, useLinkView } from '../share/link-view'
import type { ShareStart } from '../share/ShareDialog'
import { boardLink, copyText, periodLabel } from '../share/share-model'
import { Spinner } from '../sync/Spinner'
import type { Metrics } from '../live/metrics'
import type { DashboardApi } from '../tabs/use-dashboard'
import type { Metric } from '../types'
import { ACTION_COPY } from './copy'

// Share and export (09-share-export-rules.md), and the workspace's default board (11 DT-8).

const preparing = () => toast('Preparing image…', { id: 'dashboard-image', duration: Infinity, icon: createElement(Spinner, { size: 14 }) })

export function useShareFlows(warehouse: Warehouse, api: DashboardApi) {
  const queryClient = useQueryClient()
  const { orgId } = useOrg()
  const linkView = useLinkView()
  const [share, setShare] = useState<{ open: boolean; start: ShareStart }>({ open: false, start: 'people' })
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [defaultOpen, setDefaultOpen] = useState(false)
  // The image: the board drawn off screen, then a PNG (SH-33 – SH-35). Each try is a new BoardShot.
  const [shot, setShot] = useState(0)

  const saveDefaultBoard = async (id: string) => {
    setDefaultOpen(false)
    try {
      const saved = await warehouse.setDefaultBoard(id)
      queryClient.setQueryData<Warehouse[]>(queryKeys.warehouse.list(orgScope(orgId)), (list) => list?.map((w) => (w.id === saved.id ? saved : w)))
      toast(`New members start on ${api.current().boards[id]?.label ?? 'this board'}`, { duration: 6000 })
    } catch (error) {
      logger.error('[dashboard] saving the default board failed', { status: error instanceof ApiError ? error.status : undefined, code: error instanceof ApiError ? error.code : undefined })
      // 422: the board isn't open to the whole workspace (made private since the list was shown).
      const refused = error instanceof ApiError && error.status === 422
      toast.error(refused ? ACTION_COPY.defaultBoardRefused : ACTION_COPY.defaultBoardFailed, { id: 'dashboard-default' })
    }
  }

  /** The dates a board is looked at on: a link's, or a viewer's own, else the board's (SH-2, SH-23). */
  const datesFor = (id: string) => {
    const d = linkView.dates?.boardId === id ? linkView.dates : api.current().boards[id]
    return { period: d?.period ?? '7d', compare: d?.compare ?? 'previous' }
  }

  /** More → Copy link: a toast says what it opens on; a refusal offers Show link (SH-22). */
  const copyBoardLink = async (id: string) => {
    const d = datesFor(id)
    const ok = await copyText(boardLink(window.location.origin, id, d.period, d.compare))
    if (ok) toast(`Link copied. It opens on ${periodLabel(d.period)}.`, { id: 'dashboard-link' })
    else toast(ACTION_COPY.copyFailed, { id: 'dashboard-link', action: { label: 'Show link', onClick: () => { api.open(id); setShare({ open: true, start: 'link' }) } } })
  }

  const prepareImage = () => {
    setDownloadOpen(false)
    preparing()
    setShot((n) => n + 1)
  }
  const imageDone = (blob: Blob | null, name: string) => {
    if (blob) { saveFile(blob, `${name}.png`); toast.dismiss('dashboard-image'); setShot(0); return }
    setShot(0)
    toast(ACTION_COPY.imageFailed, {
      id: 'dashboard-image', duration: Infinity,
      icon: createElement(TriangleAlert, { 'aria-hidden': true, size: 16, strokeWidth: 1.5, absoluteStrokeWidth: true, className: 'text-[var(--dashboard-sync-failed)]' }),
      action: { label: 'Try again', onClick: () => { preparing(); setShot(1) } },
    })
  }

  /** Numbers: one CSV, then the dialog closes; no toast, the file is the confirmation (SH-36, SH-37). */
  const downloadNumbers = async (ids: string[], metrics: Metrics, opts: { board: string; period: string; compare: string; by: string; on?: Date }) => {
    const title = ids.length === 1 ? metrics.get(ids[0])?.label ?? opts.board : opts.board
    const csv = numbersCsv({ title, metrics: ids.map((id) => metrics.get(id)).filter((x): x is Metric => !!x), period: opts.period, compare: opts.compare, by: opts.by, on: opts.on })
    saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${fileBase(title, opts.period, opts.on)}.csv`)
    setDownloadOpen(false)
  }

  return {
    linkView, share, openShare: (start: ShareStart = 'people') => setShare({ open: true, start }), closeShare: () => setShare((s) => ({ ...s, open: false })),
    downloadOpen, openDownload: () => setDownloadOpen(true), closeDownload: () => setDownloadOpen(false),
    defaultOpen, openDefault: () => setDefaultOpen(true), closeDefault: () => setDefaultOpen(false), saveDefaultBoard,
    copyBoardLink, shot, prepareImage, imageDone, downloadNumbers,
    resetDates: () => setViewDates(null), setViewDates,
  }
}
