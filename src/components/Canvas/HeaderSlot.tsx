'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// The dashboard header is one row (6D, D39): the open page's own controls on the left (a board's tabs), the period,
// comparison and sync on the right. The header lives in the dashboard shell and the tabs in the board screen, so the
// shell marks its left side with `useHeaderSlotRef` and the board renders into it with `InHeader`.

const SlotContext = createContext<HTMLElement | null>(null)
const SetSlotContext = createContext<((element: HTMLElement | null) => void) | null>(null)

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <SetSlotContext.Provider value={setSlot}>
      <SlotContext.Provider value={slot}>{children}</SlotContext.Provider>
    </SetSlotContext.Provider>
  )
}

/** The ref for the header's left side. */
export function useHeaderSlotRef(): ((element: HTMLElement | null) => void) | undefined {
  return useContext(SetSlotContext) ?? undefined
}

/** Renders its children on the header's left side; nothing outside the dashboard shell. */
export function InHeader({ children }: { children: ReactNode }) {
  const slot = useContext(SlotContext)
  return slot ? createPortal(children, slot) : null
}
