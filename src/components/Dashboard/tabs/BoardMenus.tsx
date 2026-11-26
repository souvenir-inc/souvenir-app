'use client'

import {
  ArchiveRestore, ArrowLeft, ArrowRight, ChevronRight, Copy, Download, EyeOff, History, House,
  LayoutGrid, Link2, LogOut, Pencil, Plus, RotateCcw, SlidersHorizontal, Trash2,
} from 'lucide-react'
import { Dropdown } from '@/components/Dropdown'
import { Tooltip } from '@/components/Tooltip'
import { cn } from '@/lib/utils'
import { canDelete, canLeave, canRename, type Board } from './board-state'

// The board menus (docs-v2/dashboard/01-tabs-rules.md §6, §11, MT-5):
//   TabMenuContent    a tab's right-click menu (TAB-27), and a Manage tabs row's ⋯ (MT-5)
//   MoreMenuContent   More, behind the + button (TAB-28), with All boards › (TAB-29)
// Every item does the same thing wherever it appears; the screen passes the handlers.

export interface BoardMenuHandlers {
  onRename: (id: string) => void
  onDuplicate: (id: string) => void
  onCopyLink: (id: string) => void
  onMove: (id: string, by: -1 | 1) => void
  onManage: (tab?: 'tabs' | 'hidden' | 'deleted') => void
  onHide: (id: string) => void
  onDelete: (id: string) => void
  onLeave: (id: string) => void
}

/** Keyboard hint at the end of a row ("⌥←"). Takes and ignores the slot's `size`. */
function Shortcut({ keys }: { keys: string; size?: number }) {
  return <span aria-hidden className="text-[length:var(--font-size-small)] leading-4 text-[var(--neutral-400)]">{keys}</span>
}

/** "Shared by <name>" with the sharer's avatar, at the foot of a shared board's menu (TAB-52). */
export function SharedByFooter({ board }: { board: Board }) {
  if (!board.sharedBy) return null
  return (
    // The owner at the foot (Figma 402:65680): a 16 px avatar, then “Shared by” and the name in Medium.
    <div className="mt-1 flex items-center gap-2.5 border-0 border-t border-solid border-[var(--neutral-100)] px-2 pb-1 pt-2">
      <PersonAvatar initials={board.sharedBy.initials} color={board.sharedBy.color} size={16} />
      <span className="text-[length:var(--font-size-small)] leading-[var(--dashboard-line-height-sm)] text-[var(--dashboard-muted)]">
        Shared by <span className="font-medium text-[var(--neutral-700)]">{board.sharedBy.name}</span>
      </span>
    </div>
  )
}

export function PersonAvatar({ initials, color, size = 24, className }: { initials: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[var(--static-white)]', className)}
      style={{ width: size, height: size, fontSize: Math.max(7, Math.round(size * 0.44)), background: color ?? 'var(--neutral-700)' }}
    >
      {initials}
    </span>
  )
}

interface TabMenuProps extends BoardMenuHandlers {
  board: Board
  /** 'tab': right-click on the tab row. 'manage': ⋯ on a Manage tabs row (no Move items, no Manage tabs). */
  variant: 'tab' | 'manage'
  index: number
  count: number
  close: () => void
}

export function TabMenuContent({ board, variant, index, count, close, ...h }: TabMenuProps) {
  const run = (fn: () => void) => () => { close(); fn() }
  const onlyOne = count <= 1 // TAB-45
  const owner = canRename(board)
  return (
    // Figma widths: a tab's menu 240, a shared tab's 272; a Manage tabs row's ⋯ 176, or 200 when shared (MT-5, MT-17).
    <Dropdown style={{ width: variant === 'manage' ? (board.sharedBy ? 200 : 176) : board.sharedBy ? 272 : 240 }} maxHeight={false}>
      <Dropdown.Section fluid>
        {owner && <Dropdown.Item icon={<Pencil />} label="Rename" onClick={run(() => h.onRename(board.id))} fluid />}
        <Dropdown.Item icon={<Copy />} label="Duplicate" onClick={run(() => h.onDuplicate(board.id))} fluid />
        <Dropdown.Item icon={<Link2 />} label="Copy link" onClick={run(() => h.onCopyLink(board.id))} fluid />
      </Dropdown.Section>
      {variant === 'tab' && (
        <Dropdown.Section divider fluid>
          <Dropdown.Item icon={<ArrowLeft />} label="Move left" rightIcon={<Shortcut keys="⌥←" />} disabled={index <= 0} onClick={run(() => h.onMove(board.id, -1))} fluid />
          <Dropdown.Item icon={<ArrowRight />} label="Move right" rightIcon={<Shortcut keys="⌥→" />} disabled={index >= count - 1} onClick={run(() => h.onMove(board.id, 1))} fluid />
          <Dropdown.Item icon={<SlidersHorizontal />} label="Manage tabs" onClick={run(() => h.onManage('tabs'))} fluid />
        </Dropdown.Section>
      )}
      <Dropdown.Section divider fluid>
        <Dropdown.Item icon={<EyeOff />} label="Hide tab" disabled={onlyOne} onClick={run(() => h.onHide(board.id))} fluid />
        {canDelete(board) && (
          <Dropdown.Item variant="danger" icon={<Trash2 />} label="Delete board" disabled={onlyOne} onClick={run(() => h.onDelete(board.id))} fluid />
        )}
        {canLeave(board) && (
          <Dropdown.Item variant="danger" icon={<LogOut />} label="Leave board" disabled={onlyOne} onClick={run(() => h.onLeave(board.id))} fluid />
        )}
      </Dropdown.Section>
      <SharedByFooter board={board} />
    </Dropdown>
  )
}

interface MoreMenuProps extends BoardMenuHandlers {
  board: Board
  /** Your tabs then hidden boards, in order (TAB-29). */
  tabs: Board[]
  hidden: Board[]
  deletedCount: number
  onlyOne: boolean
  onOpen: (id: string) => void
  onShow: (id: string) => void
  onNewBoard: () => void
  onStartOver: (id: string) => void
  onNotReady: (what: string) => void
  /** One Download dialog for everyone (09 SH-31). */
  onDownload?: () => void
  /** Admins only: the workspace's default board for new members (11 DT-8). */
  onDefaultBoard?: () => void
  close: () => void
}

/** More (TAB-28): the open board's menu. A view-only board keeps only what doesn't change it (TAB-53). */
export function MoreMenuContent({ board, tabs, hidden, deletedCount, onlyOne, close, ...h }: MoreMenuProps) {
  const run = (fn: () => void) => () => { close(); fn() }
  const view = board.access === 'view'
  const owner = canRename(board)
  return (
    <Dropdown size="md" maxHeight={false}>
      <Dropdown.Section fluid>
        <Dropdown.Submenu trigger={<Dropdown.Item icon={<LayoutGrid />} label="All boards" rightIcon={<ChevronRight />} fluid />}>
          <AllBoardsList tabs={tabs} hidden={hidden} onOpen={(id) => run(() => h.onOpen(id))()} onShow={(id) => run(() => h.onShow(id))()}

            onNewBoard={run(h.onNewBoard)} onManage={run(() => h.onManage('tabs'))} />
        </Dropdown.Submenu>
        {deletedCount > 0 && (
          <Dropdown.Item icon={<ArchiveRestore />} label={`Recently deleted (${deletedCount})`} onClick={run(() => h.onManage('deleted'))} fluid />
        )}
      </Dropdown.Section>
      <Dropdown.Section divider fluid>
        {owner && <Dropdown.Item icon={<Pencil />} label="Rename" onClick={run(() => h.onRename(board.id))} fluid />}
        <Dropdown.Item icon={<Copy />} label="Duplicate" onClick={run(() => h.onDuplicate(board.id))} fluid />
        <Dropdown.Item icon={<Link2 />} label="Copy link" onClick={run(() => h.onCopyLink(board.id))} fluid />
        <Dropdown.Item icon={<Download />} label="Download…" onClick={run(() => (h.onDownload ? h.onDownload() : h.onNotReady('Download')))} fluid />
        {h.onDefaultBoard && <Dropdown.Item icon={<House />} label="Default board for new members…" onClick={run(() => h.onDefaultBoard?.())} fluid />}
        {!view && <Dropdown.Item icon={<History />} label="Version history" onClick={run(() => h.onNotReady('Version history'))} fluid />}
      </Dropdown.Section>
      <Dropdown.Section divider fluid>
        <Dropdown.Item icon={<EyeOff />} label="Hide tab" disabled={onlyOne} onClick={run(() => h.onHide(board.id))} fluid />
        {!view && <Dropdown.Item icon={<RotateCcw />} label="Start over" onClick={run(() => h.onStartOver(board.id))} fluid />}
      </Dropdown.Section>
      {canDelete(board) && (
        <Dropdown.Section divider fluid>
          <Dropdown.Item variant="danger" icon={<Trash2 />} label="Delete board" disabled={onlyOne} onClick={run(() => h.onDelete(board.id))} fluid />
        </Dropdown.Section>
      )}
      {!view && canLeave(board) && (
        <Dropdown.Section divider fluid>
          <Dropdown.Item variant="danger" icon={<LogOut />} label="Leave board" disabled={onlyOne} onClick={run(() => h.onLeave(board.id))} fluid />
        </Dropdown.Section>
      )}
    </Dropdown>
  )
}

interface AllBoardsListProps {
  tabs: Board[]
  hidden: Board[]
  onOpen: (id: string) => void
  onShow: (id: string) => void
  onNewBoard: () => void
  onManage: () => void
}

/** All boards › (TAB-29): your tabs, then hidden boards greyed with an eye-off ("Show tab", TAB-39). */
function AllBoardsList({ tabs, hidden, onOpen, onShow, onNewBoard, onManage }: AllBoardsListProps) {
  return (
    <Dropdown size="md">
      <Dropdown.Section label="ALL BOARDS" fluid>
        {tabs.map((b) => (
          <Dropdown.Item key={b.id} icon={<LayoutGrid />} label={b.label} onClick={() => onOpen(b.id)} fluid />
        ))}
        {hidden.map((b) => (
          <Dropdown.Item
            key={b.id}
            icon={<LayoutGrid />}
            label={b.label}
            className="[&_*]:!text-[var(--neutral-400)]"
            // Opening a hidden board and its eye-off do the same: back as the last tab, open (TAB-39).
            onClick={() => onShow(b.id)}
            rightIcon={<ShowTabIcon />}
            aria-label={`${b.label}, hidden. Show tab`}
            fluid
          />
        ))}
      </Dropdown.Section>
      <Dropdown.Section divider fluid>
        <Dropdown.Item icon={<Plus />} label="New board" onClick={onNewBoard} fluid />
        <Dropdown.Item icon={<SlidersHorizontal />} label="Manage tabs" onClick={onManage} fluid />
      </Dropdown.Section>
    </Dropdown>
  )
}

/** The eye-off on a hidden board's row (tooltip "Show tab"); the whole row shows the board. */
function ShowTabIcon() {
  return (
    <Tooltip content="Show tab" side="top">
      <span className="inline-flex size-5 items-center justify-center text-[var(--neutral-400)]">
        <EyeOff size={16} aria-hidden />
      </span>
    </Tooltip>
  )
}
