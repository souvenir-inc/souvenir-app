// The dashboard's error and empty-state copy (API-EM-09): every string the board screen shows for a
// failure, in one place. No imports, so the route's server files can use it. How a failure is read
// is in errors.ts.

export const LOAD_COPY = {
  notEnabled: {
    title: 'The dashboard isn’t turned on for your workspace',
    description: 'Ask a workspace admin to turn it on.',
  },
  noAccess: {
    title: 'You don’t have access to this dashboard',
    description: 'Ask a workspace admin for access.',
  },
  dashboard: 'Couldn’t load the dashboard.',
  boards: 'Couldn’t load your boards.',
  board: 'Couldn’t load this board.',
  render: 'Couldn’t show the dashboard.',
  /** Under a failure that trying again won't fix. */
  notRetryable: 'Reload the page, and contact support if it keeps happening.',
  noBoards: {
    title: 'No boards yet',
    description: 'Boards you make or that are shared with you show up here.',
  },
} as const

export const SAVE_COPY = {
  gone: (many: boolean) => ({
    title: many ? 'Some boards were deleted or are no longer shared with you.' : 'This board was deleted or is no longer shared with you.',
    description: 'Your last change to it wasn’t saved.',
  }),
  conflict: {
    title: 'Someone else changed this board since you opened it, so your last change wasn’t saved.',
    description: 'Their change is on screen now. Keep editing to save yours on top, or discard it.',
    action: 'Discard my change',
  },
  defaultBoard: {
    title: 'The default board stays open to the workspace. Pick another default first.',
    description: 'Your change was undone.',
  },
  forbidden: {
    title: 'You can’t change this board any more.',
    description: 'Your change was undone. Ask the board’s owner for edit access.',
  },
  refused: {
    title: 'Couldn’t save your last change.',
    description: 'It was undone, and the boards show what’s saved.',
  },
  retry: {
    title: 'Couldn’t save your boards.',
    description: 'Your changes are kept on this page. Check your connection and try again.',
    action: 'Try again',
  },
} as const

/** Other failures on the board screen. */
export const ACTION_COPY = {
  defaultBoardRefused: 'Only a board everyone in the workspace can open can be the default.',
  defaultBoardFailed: 'Couldn’t save the default board.',
  imageFailed: 'Couldn’t download the image.',
  copyFailed: 'Couldn’t copy the link.',
} as const
