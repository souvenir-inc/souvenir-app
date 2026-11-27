'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { landingSize } from '../catalog'
import { Metrics } from '../live/metrics'
import { cardIdsFor, type Board } from '../tabs/board-state'
import type { DashboardApi } from '../tabs/use-dashboard'
import type { Metric } from '../types'

// Adding cards (06), the metric window's Add to board (AC-22 – AC-25) and card settings (10 CS-1 –
// CS-9) on the open board.

export function useCardFlows(api: DashboardApi, openBoard: Board, metrics: Metrics, editing: boolean) {
  const [pickerOpen, setPickerOpen] = useState(false)
  // New cards, ringed for 2 s and scrolled into view (AC-17). Added from the metric window to the
  // board on screen, the ring waits until the window closes (AC-24).
  const [landed, setLanded] = useState<{ boardId: string; ids: string[]; n: number } | null>(null)
  const [landLater, setLandLater] = useState<{ boardId: string; ids: string[] } | null>(null)
  const land = (boardId: string, ids: string[]) => setLanded((l) => ({ boardId, ids, n: (l?.n ?? 0) + 1 }))
  // The metric window: the card it was opened from, or a Needs attention row (CR-15, CR-33).
  const [windowFor, setWindowFor] = useState<string | null>(null)
  // Card settings: the card id it's open for (10 CS-1); only while editing, for a card still on the board.
  const [settingsFor, setSettingsFor] = useState<string | null>(null)
  const settingsCard = editing && settingsFor ? openBoard.cards.find((c) => c.metricId === settingsFor) ?? null : null
  const cards = api.cardActions(openBoard.id)
  const undoToast = (message: string, undo: () => void) => toast(message, { duration: 6000, action: { label: 'Undo', onClick: undo } })

  /** The picker's Add: at the end, in the order picked, each at the size that suits it (AC-16 – AC-18). */
  const addPicked = (metricIds: string[]) => {
    setPickerOpen(false)
    const picked = metricIds.map((id) => metrics.get(id)).filter((x): x is Metric => !!x)
    const result = api.addCards(openBoard.id, picked.map((x) => ({ metricId: x.id, size: landingSize(x) })))
    if (!result) return
    land(openBoard.id, result.ids)
    undoToast(picked.length === 1 ? `Added ${picked[0].label}` : `Added ${picked.length} cards`, result.undo)
  }

  /** Add to board from a metric's window (AC-22 – AC-25). */
  const addToBoard = (metricId: string, boardId: string) => {
    const board = api.current().boards[boardId]
    const metric = metrics.get(metricId)
    if (!board || !metric) return
    const result = api.addCards(boardId, [{ metricId: metric.id, size: landingSize(metric) }])
    if (!result) return
    if (boardId === openBoard.id) {
      setLandLater({ boardId, ids: result.ids })
      undoToast(`Added ${metric.label} to ${board.label}`, result.undo)
      return
    }
    toast(`Added ${metric.label} to ${board.label}`, {
      duration: 6000,
      action: { label: 'Undo', onClick: result.undo },
      // View: close the window and open that board on the new card (AC-24).
      cancel: { label: 'View', onClick: () => { setWindowFor(null); api.open(boardId); land(boardId, result.ids) } },
    })
  }

  const closeWindow = () => {
    setWindowFor(null)
    if (landLater) { land(landLater.boardId, landLater.ids); setLandLater(null) }
  }

  const removeWithUndo = (metricId: string) => cards.removeWithUndo(metricId, metrics.get(metricId)?.label ?? 'Card')
  const setCards = (next: Board['cards']) => api.change([{ type: 'set-cards', id: openBoard.id, cards: next }], [{ type: 'set-cards', id: openBoard.id, cards: openBoard.cards }])

  const settings = {
    card: settingsCard,
    open: setSettingsFor,
    close: () => setSettingsFor(null),
    /** Another metric, same size and place; a chart it doesn't suit goes back to Trend (CS-5). */
    swap: (metricId: string) => {
      if (!settingsCard) return
      const others = openBoard.cards.filter((c) => c.metricId !== settingsCard.metricId).map((c) => c.metricId)
      const [cardId] = cardIdsFor(others, [metricId])
      setCards(openBoard.cards.map((c) => (c.metricId === settingsCard.metricId ? { ...c, metricId: cardId, chart: settingsCard.chart } : c)))
      setSettingsFor(cardId)
    },
    chart: (chart: 'trend' | 'bars') => {
      if (!settingsCard) return
      setCards(openBoard.cards.map((c) => (c.metricId === settingsCard.metricId ? { ...c, chart } : c)))
    },
    /** Duplicate: a copy at the end, same size and chart, ringed, with Undo (CS-7). */
    duplicate: () => {
      if (!settingsCard) return
      const label = metrics.get(settingsCard.metricId)?.label ?? 'Card'
      setSettingsFor(null)
      const result = api.addCards(openBoard.id, [{ metricId: Metrics.base(settingsCard.metricId), size: settingsCard.size, chart: settingsCard.chart }])
      if (!result) return
      land(openBoard.id, result.ids)
      undoToast(`Duplicated ${label}`, result.undo)
    },
    /** Remove card (CS-8). */
    remove: () => {
      if (!settingsCard) return
      setSettingsFor(null)
      removeWithUndo(settingsCard.metricId)
    },
  }

  return {
    pickerOpen, openPicker: () => setPickerOpen(true), closePicker: () => setPickerOpen(false), addPicked,
    landed: landed?.boardId === openBoard.id ? landed : null,
    windowFor, openWindow: setWindowFor, closeWindow, addToBoard,
    removeWithUndo, cards, settings,
  }
}
