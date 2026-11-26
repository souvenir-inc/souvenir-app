'use client'

import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/Button'
import { Dropdown } from '@/components/Dropdown'
import { useMetricCatalog, useWorkspace } from '@/lib/warehouse/queries'
import { addCard, createCard, sizeForMetric, type Board } from './board'
import { replaceBoard, tabBoards } from './doc'
import { starterBoards } from './metrics'
import { boardStore, withStarters, type BoardsDoc } from './store'

/**
 * "Add to board", for a metric's own window (Canvas PRD, flow 2): adds the metric to one of your tabs, at the end of
 * the board and at a size that suits it. An open board on the same page reads the change in at once.
 */
export function AddToBoard({ metric }: { metric: string }) {
  const workspace = useWorkspace()
  const catalog = useMetricCatalog(workspace.data !== undefined)
  const [open, setOpen] = useState(false)
  const [doc, setDoc] = useState<BoardsDoc | null>(null)
  const ws = workspace.data
  const entry = catalog.data?.find(m => m.name === metric)

  const load = async () => {
    if (!ws || !catalog.data) return null
    const saved = await boardStore.load(ws.id)
    return withStarters(saved, starterBoards(catalog.data, ws, undefined))
  }

  const toggle = (next: boolean) => {
    setOpen(next)
    if (next) void load().then(setDoc)
  }

  const add = async (board: Board) => {
    setOpen(false)
    const current = await load()
    if (!ws || !current) return
    const target = current.boards.find(b => b.id === board.id)
    if (!target) return
    const card = createCard(metric, 'number', { size: sizeForMetric(entry?.unit) })
    const ok = await boardStore.saveFrom(ws.id, replaceBoard(current, addCard(target, card)), 'metric-window')
    if (ok) toast(`Added ${entry?.label ?? metric} to ${board.name}`)
    else toast.error('Couldn’t add it to the board. Try again.')
  }

  if (!ws || !entry) return null
  return (
    <Dropdown.Float
      open={open}
      onOpenChange={toggle}
      placement="bottom-end"
      trigger={
        <Button variant="secondary" size="sm" leftIcon={<LayoutGrid size={15} strokeWidth={1.75} aria-hidden />}>
          Add to board
        </Button>
      }
    >
      <Dropdown size="md" maxHeight={false}>
        <Dropdown.Section label="Your boards">
          {(doc ? tabBoards(doc) : []).map(board => (
            <Dropdown.Item
              key={board.id}
              label={board.name}
              subLabel={board.cards.some(c => c.metric === metric) ? 'Already on it' : undefined}
              fluid
              onClick={() => { void add(board) }}
            />
          ))}
        </Dropdown.Section>
      </Dropdown>
    </Dropdown.Float>
  )
}
