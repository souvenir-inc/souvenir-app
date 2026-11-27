'use client'

import type React from 'react'
import { Check, ChevronDown, Globe, Lock } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuPrimitiveItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { General, People, Role, Share } from './share-model'
import { FOCUS, MENU_ITEM, MENU_STYLE, MENU_SURFACE, ROLE_TEXT } from './share-ui'

// The role and general access menus of the Share dialog (Figma 170:77629, 170:58430; SH-15 – SH-19).
// Radix menus: arrow keys, Home/End, typeahead and Escape (closing the menu, not the dialog) come
// with them (A11Y-KB-03). They render in place, inside the dialog, above it.

const TRIGGER = cn(
  'h-7 min-h-7 gap-1 rounded-md border-0 bg-transparent px-1.5 [font-family:inherit] text-[length:var(--font-size-body-sm)] font-normal leading-5 text-[var(--neutral-700)]',
  '[--hv:var(--dashboard-sync-bg)] hover:border-transparent active:scale-100 data-[state=open]:bg-[var(--dashboard-sync-bg)]',
  FOCUS,
)

const ItemTitle = ({ children }: { children: React.ReactNode }) => (
  <span className="flex w-full items-center text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-figure)]">{children}</span>
)
const Tick = () => <Check aria-hidden size={14} strokeWidth={1.5} absoluteStrokeWidth className="ml-auto" />

/** Someone's role (or the role for new people, or everyone's): view or edit, and Remove access for a person. */
export function RoleMenu({ value, label, onChange, onRemove, compact = false }: { value: Role; label: string; onChange: (r: Role) => void; onRemove?: () => void; compact?: boolean }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="xs" data-role-trigger aria-label={`${label}: ${ROLE_TEXT[value].label}`}
          rightIcon={<ChevronDown aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />} iconSize={12}
          className={cn(TRIGGER, compact && 'h-6 min-h-6')}
        >
          {ROLE_TEXT[value].label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" sideOffset={4} collisionPadding={8} aria-label={label} data-role-menu className={MENU_SURFACE} style={{ ...MENU_STYLE, width: 220 }}>
        {(['view', 'edit'] as const).map((r) => (
          // Radix item with radio semantics: the choice is announced, not only drawn.
          <DropdownMenuPrimitiveItem key={r} role="menuitemradio" aria-checked={value === r} onSelect={() => { if (r !== value) onChange(r) }} className={MENU_ITEM}>
            <ItemTitle>{ROLE_TEXT[r].label}{value === r && <Tick />}</ItemTitle>
            <span className="text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{ROLE_TEXT[r].line}</span>
          </DropdownMenuPrimitiveItem>
        ))}
        {onRemove && (
          <>
            <DropdownMenuSeparator className="mx-1 my-1 h-px bg-[var(--neutral-200)]" />
            <DropdownMenuPrimitiveItem onSelect={onRemove} className={cn(MENU_ITEM, 'text-[length:var(--font-size-body-sm)] font-medium leading-5 text-[var(--dashboard-error)]')}>
              Remove access
            </DropdownMenuPrimitiveItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Who else may open the board: only the people added, or everyone in the workspace at a role (SH-16 – SH-19). */
export function GeneralAccess({ people, share, editable, isDefault, onChange }: { people: People; share: Share; editable: boolean; isDefault: boolean; onChange: (general: General) => void }) {
  const everyone = share.general !== 'none'
  const title = everyone ? `Everyone at ${people.workspace}` : 'Only people added'
  const line = everyone ? 'Anyone in the workspace can open this board' : 'Only the people above can open this board'
  const lose = people.loseCount(share)
  // The default board can't be made private: new members open on it (the warehouse refuses it too).
  const locked = everyone && isDefault
  return (
    <div data-general-access={share.general} className="flex items-center gap-2.5">
      <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--dashboard-sync-bg)] text-[var(--neutral-700)]">
        {everyone ? <Globe size={15} strokeWidth={1.5} absoluteStrokeWidth /> : <Lock size={15} strokeWidth={1.5} absoluteStrokeWidth />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start">
        {editable ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost" size="xs" data-general-trigger
                rightIcon={<ChevronDown aria-hidden size={12} strokeWidth={1.5} absoluteStrokeWidth />} iconSize={12}
                className={cn('h-auto min-h-0 gap-1 rounded-md border-0 bg-transparent p-0 [font-family:inherit] text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)] [--hv:transparent] hover:border-transparent active:scale-100', FOCUS)}
              >
                {title}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="start" sideOffset={4} collisionPadding={8} aria-label="General access" data-general-menu className={MENU_SURFACE} style={{ ...MENU_STYLE, width: 260 }}>
              <DropdownMenuPrimitiveItem
                role="menuitemradio" aria-checked={!everyone} disabled={locked} data-default-locked={locked ? '' : undefined}
                onSelect={() => { if (everyone) onChange('none') }} className={MENU_ITEM}
              >
                <ItemTitle>Only people added{!everyone && <Tick />}</ItemTitle>
                {/* Going back shows who loses access first (SH-19). */}
                <span data-lose-count={everyone && !isDefault ? lose : undefined} className={cn('text-[length:var(--font-size-small)] leading-4', everyone && !isDefault ? 'text-[var(--dashboard-error)]' : 'text-[var(--dashboard-label)]')}>
                  {locked ? 'New members open on this board. Pick another default board first.'
                    : everyone ? `${lose} ${lose === 1 ? 'person loses' : 'people lose'} access` : 'Only the people above can open this board'}
                </span>
              </DropdownMenuPrimitiveItem>
              <DropdownMenuPrimitiveItem role="menuitemradio" aria-checked={everyone} onSelect={() => { if (!everyone) onChange('view') }} className={MENU_ITEM}>
                <ItemTitle>Everyone at {people.workspace}{everyone && <Tick />}</ItemTitle>
                <span className="text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">Anyone in the workspace can open this board</span>
              </DropdownMenuPrimitiveItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="text-[length:var(--font-size-body)] font-medium leading-5 text-[var(--dashboard-figure)]">{title}</span>
        )}
        <span className="text-[length:var(--font-size-small)] leading-4 text-[var(--dashboard-label)]">{line}</span>
      </span>
      {share.general !== 'none' && (
        editable
          ? <RoleMenu value={share.general} label="Everyone’s role" onChange={onChange} />
          : <span className="pr-1 text-[length:var(--font-size-body-sm)] text-[var(--dashboard-label)]">{ROLE_TEXT[share.general].label}</span>
      )}
    </div>
  )
}
