'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import type { MetricEntry } from '@/lib/api/warehouse'
import { categoryName } from '@/lib/metrics/display'
import { ORG_CONNECTORS_ROUTE } from '@/lib/routes'
import { Button } from '@/components/Button'
import { InputField } from '@/components/InputField'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { Board } from './board'
import type { Unavailable } from './metrics'
import { TEMPLATES, templateBoard, type TemplateId } from './templates'
import { BOARD_NAME_MAX } from './useBoards'
import styles from './Canvas.module.css'

type Choice = { kind: 'empty' } | { kind: 'template'; id: TemplateId } | { kind: 'copy'; id: string }

export interface NewBoardDialogProps {
  catalog: ReadonlyMap<string, MetricEntry>
  /** Areas this workspace syncs (its connected apps). */
  synced: ReadonlySet<string>
  unavailable: Unavailable | undefined
  /** Every board you can see, to copy one. */
  boards: Board[]
  /** Draws a board with your own numbers on the dates in the header, for a template's preview. */
  renderPreview: (board: Board) => ReactNode
  onEmpty: (name: string) => void
  onTemplate: (board: Board) => void
  onCopy: (id: string) => void
  onClose: () => void
}

/**
 * Make a board: empty, from a template by role (seen with your own numbers first, cards your apps can't fill left
 * out), or as a private copy of a board you can see. New boards are private and land in your tabs.
 */
export function NewBoardDialog({
  catalog, synced, unavailable, boards, renderPreview, onEmpty, onTemplate, onCopy, onClose,
}: NewBoardDialogProps) {
  const [choice, setChoice] = useState<Choice>({ kind: 'template', id: TEMPLATES[0].id })
  const [name, setName] = useState('')
  const template = choice.kind === 'template' ? TEMPLATES.find(t => t.id === choice.id) ?? null : null
  const made = template ? templateBoard(template, catalog, synced, unavailable, `template-${template.id}`) : null
  const copying = choice.kind === 'copy' ? boards.find(b => b.id === choice.id) ?? null : null

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="lg" style={{ width: 'min(1080px, 94vw)', display: 'flex', flexDirection: 'column', height: 'min(88vh, 760px)' }}>
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
        </DialogHeader>
        <DialogBody className={styles.newBoard}>
          <nav className={styles.newBoardList} aria-label="Ways to make a board">
            <button type="button" className={styles.newBoardChoice} aria-pressed={choice.kind === 'empty'}
              onClick={() => setChoice({ kind: 'empty' })}>
              <span className={styles.newBoardName}>Empty board</span>
              <span className={styles.newBoardMeta}>Add the cards yourself</span>
            </button>
            <h4 className={styles.pickGroupTitle}>Templates</h4>
            {TEMPLATES.map(t => (
              <button key={t.id} type="button" className={styles.newBoardChoice}
                aria-pressed={choice.kind === 'template' && choice.id === t.id}
                onClick={() => setChoice({ kind: 'template', id: t.id })}>
                <span className={styles.newBoardName}>{t.name}</span>
                <span className={styles.newBoardMeta}>{t.forWho}</span>
              </button>
            ))}
            <h4 className={styles.pickGroupTitle}>Copy a board</h4>
            {boards.map(b => (
              <button key={b.id} type="button" className={styles.newBoardChoice}
                aria-pressed={choice.kind === 'copy' && choice.id === b.id}
                onClick={() => setChoice({ kind: 'copy', id: b.id })}>
                <span className={styles.newBoardName}>{b.name}</span>
                <span className={styles.newBoardMeta}>{b.cards.length === 1 ? '1 card' : `${b.cards.length} cards`}</span>
              </button>
            ))}
          </nav>

          <section className={styles.newBoardPane} aria-live="polite">
            {choice.kind === 'empty' && (
              <form className={styles.newBoardForm} onSubmit={event => {
                event.preventDefault()
                onEmpty(name.trim() || 'Untitled board')
                onClose()
              }}>
                <InputField fluid label="Name" showSubtitle={false} placeholder="Untitled board" value={name} onChange={setName} maxLength={BOARD_NAME_MAX} autoFocus />
                <div><Button type="submit">Make board</Button></div>
              </form>
            )}

            {template && made && (
              <>
                <header className={styles.newBoardHead}>
                  <div>
                    <h3 className={styles.newBoardTitle}>{template.name}</h3>
                    <p className={styles.newBoardMeta}>For {template.forWho.toLowerCase()}</p>
                  </div>
                  <Button disabled={made.board.cards.length === 0} onClick={() => { onTemplate(made.board); onClose() }}>
                    Use this template
                  </Button>
                </header>
                {made.missingApps.length > 0 && (
                  <p className={styles.newBoardMissing}>
                    {made.missingApps.map(categoryName).join(' and ')} {made.missingApps.length === 1 ? 'isn’t' : 'aren’t'} connected, so {made.missingApps.length === 1 ? 'its cards are' : 'their cards are'} left out.{' '}
                    <Link href={ORG_CONNECTORS_ROUTE} className={styles.linkButton}>Connect</Link>
                  </p>
                )}
                {made.board.cards.length === 0
                  ? <p className={styles.noMatch}>Nothing in this template can be shown for this store yet.</p>
                  : <div className={styles.newBoardPreview}>{renderPreview(made.board)}</div>}
              </>
            )}

            {copying && (
              <div className={styles.newBoardForm}>
                <h3 className={styles.newBoardTitle}>A copy of “{copying.name}”</h3>
                <p className={styles.newBoardMeta}>A private copy that’s yours to change. The original stays as it is.</p>
                <div><Button onClick={() => { onCopy(copying.id); onClose() }}>Make a copy</Button></div>
              </div>
            )}
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
