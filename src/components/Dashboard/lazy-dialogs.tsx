'use client'

import dynamic from 'next/dynamic'
import { useState, type ComponentProps, type ComponentType } from 'react'
import type { AddCardsDialog as AddCardsDialogT } from './AddCardsDialog'
import type { CardSettings as CardSettingsT } from './CardSettings'
import type { DefaultBoardDialog as DefaultBoardDialogT } from './DefaultBoardDialog'
import type { MetricWindow as MetricWindowT } from './MetricWindow'
import type { NewBoardLibrary as NewBoardLibraryT } from './NewBoardLibrary'
import type { DownloadDialog as DownloadDialogT } from './share/DownloadDialog'
import type { ShareDialog as ShareDialogT } from './share/ShareDialog'
import type { ManageTabsDialog as ManageTabsDialogT } from './tabs/ManageTabsDialog'

// The board's dialogs and windows only show on a click, so they stay out of the page's first
// JavaScript. Each loads when the browser is idle after the board appears (preloadDashboardDialogs),
// and mounts the first time it opens; from then on it stays mounted so it can animate closed.

const loaders: (() => Promise<unknown>)[] = []

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any component; its own props flow through
function whenOpen<C extends ComponentType<any>>(load: () => Promise<C>, isOpen: (props: ComponentProps<C>) => boolean) {
  loaders.push(load)
  const Lazy = dynamic(load, { ssr: false }) as unknown as ComponentType<ComponentProps<C>>
  return function Deferred(props: ComponentProps<C>) {
    const [opened, setOpened] = useState(false)
    if (!opened && isOpen(props)) setOpened(true)
    return opened ? <Lazy {...props} /> : null
  }
}

export const AddCardsDialog = whenOpen(() => import('./AddCardsDialog').then((m) => m.AddCardsDialog as typeof AddCardsDialogT), (p) => p.open)
export const CardSettings = whenOpen(() => import('./CardSettings').then((m) => m.CardSettings as typeof CardSettingsT), (p) => p.card != null)
export const DefaultBoardDialog = whenOpen(() => import('./DefaultBoardDialog').then((m) => m.DefaultBoardDialog as typeof DefaultBoardDialogT), (p) => p.open)
export const DownloadDialog = whenOpen(() => import('./share/DownloadDialog').then((m) => m.DownloadDialog as typeof DownloadDialogT), (p) => p.open)
export const ManageTabsDialog = whenOpen(() => import('./tabs/ManageTabsDialog').then((m) => m.ManageTabsDialog as typeof ManageTabsDialogT), (p) => p.open)
export const MetricWindow = whenOpen(() => import('./MetricWindow').then((m) => m.MetricWindow as typeof MetricWindowT), (p) => p.metric != null)
export const NewBoardLibrary = whenOpen(() => import('./NewBoardLibrary').then((m) => m.NewBoardLibrary as typeof NewBoardLibraryT), (p) => p.openOn != null)
export const ShareDialog = whenOpen(() => import('./share/ShareDialog').then((m) => m.ShareDialog as typeof ShareDialogT), (p) => p.open)

/** Fetch every dialog's code in the background, so the first open doesn't wait on the network. */
export function preloadDashboardDialogs() {
  const run = () => loaders.forEach((load) => { void load() })
  // Safari has no requestIdleCallback: a short timeout instead.
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 4000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(run, 1500)
  return () => clearTimeout(id)
}
