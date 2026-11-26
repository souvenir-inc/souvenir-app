import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Change } from '@/lib/metrics/display'
import type { FormulaKind } from '@/lib/metrics/tree'
import styles from './MetricLibrary.module.css'

/** The move against the period before. Neutral ink: whether up is good depends on the metric, and the library doesn't judge. */
export function ChangeText({ change, against }: { change: Change | null; against?: string }) {
  if (change === null) return null
  return (
    <span className={styles.change}>
      {change.direction === 'up' && <ArrowUp size={12} strokeWidth={1.75} aria-hidden />}
      {change.direction === 'down' && <ArrowDown size={12} strokeWidth={1.75} aria-hidden />}
      <span aria-hidden>{change.direction === 'flat' ? 'No change' : change.text}{against ? ` vs ${against}` : ''}</span>
      <span className="sr-only">{change.spoken}{against ? ` compared with ${against}` : ''}</span>
    </span>
  )
}

const KIND_TITLES: Record<FormulaKind, string> = {
  root: 'Counted or summed straight from a table',
  nested: 'Built from other metrics',
}

export function KindTag({ kind }: { kind: FormulaKind | null }) {
  if (kind === null) return null
  return <span className={styles.tag} title={KIND_TITLES[kind]}>{kind === 'root' ? 'Root' : 'Nested'}</span>
}

export function CustomTag() {
  return <span className={styles.tag} data-tone="custom" title="Made by your organization">Custom</span>
}
