'use client'

/**
 * The board's menus, drawn to the Tabs row and 6D-5 frames ("menu · board options", "submenu · all boards",
 * "menu · tab (right-click)", "menu · more tabs", "menu · board (from ⋯)"): a 240 card, 28 rows 4 apart with a 16
 * icon, Medium 14/22 labels. They sit inside a `Dropdown.Float`, whose Radix menu gives them roving focus,
 * typeahead, Escape and outside-click; only the rows and the card are drawn here, since the design system's rows
 * are 32 with 20 icons.
 */

import type { ComponentType, HTMLAttributes, ReactNode } from 'react'
import { ChevronRight, type LucideProps } from 'lucide-react'
import {
  DropdownMenuLabel, DropdownMenuPortal, DropdownMenuPrimitiveItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import styles from './Canvas.module.css'

type Icon = ComponentType<LucideProps>

/** The menus' layer: the design system's dropdown layer, one below its tooltips. */
const MENU_Z = 9998

/** The card. 240 wide unless a frame hugs its rows (the ⋯ menu in Manage tabs). */
export function BoardMenu({ width = 240, children }: { width?: number; children: ReactNode }) {
  return <div className={styles.bMenu} style={{ width }}>{children}</div>
}

interface BoardMenuItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  icon?: Icon
  label: string
  onSelect: () => void
  disabled?: boolean
  /** Delete and Leave: red. */
  danger?: boolean
  /** The board you're on, in All boards: filled. */
  current?: boolean
  /** A hidden board, in All boards: greyed. */
  muted?: boolean
  /** After the label: a key hint, or a button of its own. */
  end?: ReactNode
}

export function BoardMenuItem({ icon: Icon, label, onSelect, disabled, danger, current, muted, end, className, ...rest }: BoardMenuItemProps) {
  return (
    <DropdownMenuPrimitiveItem
      {...rest}
      className={className ? `${styles.bItem} ${className}` : styles.bItem}
      disabled={disabled}
      data-danger={danger || undefined}
      data-current={current || undefined}
      data-muted={muted || undefined}
      onSelect={onSelect}
    >
      {Icon && <Icon size={16} strokeWidth={1.75} className={styles.bIcon} aria-hidden />}
      <span className={styles.bLabel}>{label}</span>
      {end}
    </DropdownMenuPrimitiveItem>
  )
}

export function BoardMenuSeparator() {
  return <DropdownMenuSeparator className={styles.bSeparator} />
}

/** A small caps heading over a list ("ALL BOARDS"). */
export function BoardMenuHeading({ children }: { children: ReactNode }) {
  return <DropdownMenuLabel className={styles.bHeading}>{children}</DropdownMenuLabel>
}

/**
 * A row that opens a second card beside the menu: 6 from the menu's edge, its heading level with the row, as
 * "submenu · all boards" sits. It opens on the side with room (left of a menu at the screen's right edge).
 */
export function BoardSubmenu({ icon: Icon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className={styles.bItem}>
        <Icon size={16} strokeWidth={1.75} className={styles.bIcon} aria-hidden />
        <span className={styles.bLabel}>{label}</span>
        <ChevronRight size={14} strokeWidth={1.75} className={styles.bChevron} aria-hidden />
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          className={`${styles.bMenu} ${styles.bSub}`}
          // The row sits 8 inside the menu (7 padding, 1 border): 8 + 6 clears the menu's edge by 6.
          sideOffset={14}
          // The card's 8 (padding and border) above the heading, so the heading lines up with the row.
          alignOffset={-8}
          collisionPadding={8}
          data-kds-dropdown-panel=""
          style={{ width: 240, zIndex: MENU_Z }}
        >
          {children}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
