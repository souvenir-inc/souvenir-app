// Changes to who can open a board that need a confirmation first (AU-12, UX-CU-01/03/08): taking a
// person's access away, changing anyone's role, and closing the board to the workspace. Each prompt
// names the person (or how many people) and what changes. Pure, so the wording is testable.

import type { General, People, Role } from './share-model'

export type AccessChange =
  | { kind: 'remove'; userId: string }
  | { kind: 'role'; userId: string; role: Role }
  | { kind: 'general'; from: General; general: General }

export interface AccessPrompt {
  title: string
  description: string
  /** Repeats the verb (UX-CU-03). */
  confirm: string
  /** Someone loses access: the destructive look (UX-CU-04). */
  danger: boolean
}

const ROLE_GAIN: Record<Role, string> = {
  view: 'read every card, pick their own dates and download, but not change the board',
  edit: 'also change its cards and keep its dates',
}

export function accessChangePrompt(change: AccessChange, ctx: { board: string; people: Pick<People, 'name' | 'workspace'>; lose: number }): AccessPrompt {
  const board = `“${ctx.board}”`
  switch (change.kind) {
    case 'remove': {
      const name = ctx.people.name(change.userId)
      return {
        title: `Remove ${name}’s access?`,
        description: `${name} will no longer be able to open ${board}, unless everyone at ${ctx.people.workspace} can.`,
        confirm: 'Remove access',
        danger: true,
      }
    }
    case 'role': {
      const name = ctx.people.name(change.userId)
      return {
        title: change.role === 'edit' ? `Let ${name} edit ${board}?` : `Make ${name} a viewer of ${board}?`,
        description: `${name} will be able to ${ROLE_GAIN[change.role]}.`,
        confirm: 'Change role',
        danger: change.role === 'view',
      }
    }
    case 'general': {
      const everyone = `everyone at ${ctx.people.workspace}`
      if (change.general === 'none') {
        const who = ctx.lose === 1 ? '1 person loses' : `${ctx.lose} people lose`
        return {
          title: `Make ${board} private?`,
          description: `${who} access. Only you and the people added will be able to open it.`,
          confirm: 'Remove access',
          danger: true,
        }
      }
      return {
        title: change.general === 'edit' ? `Let ${everyone} edit ${board}?` : `Make ${everyone} viewers of ${board}?`,
        description: `Everyone at ${ctx.people.workspace} will be able to ${ROLE_GAIN[change.general]}.`,
        confirm: 'Change role',
        danger: change.general === 'view',
      }
    }
  }
}
