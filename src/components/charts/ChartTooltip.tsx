import type { ReactNode } from 'react'
import styles from './charts.module.css'

export interface ChartTooltipRow {
  key: string
  /** Left side: what the row is ("Nov 4", "Previous"). */
  label: ReactNode
  /** Right side: the figure. */
  value: ReactNode
  /** A small swatch in the series' colour; omitted for rows that aren't a series. */
  swatch?: string
  /** Fades the row (the comparison line). */
  muted?: boolean
}

/** The one tooltip surface every chart in the kit uses: a title line, then label · value rows. */
export function ChartTooltip({ title, rows, footer }: { title?: ReactNode; rows: ChartTooltipRow[]; footer?: ReactNode }) {
  return (
    <div className={styles.tooltip}>
      {title && <div className={styles.tooltipTitle}>{title}</div>}
      {rows.map(row => (
        <div key={row.key} className={styles.tooltipRow} data-muted={row.muted || undefined}>
          <span className={styles.tooltipLabel}>
            {row.swatch && <span className={styles.tooltipSwatch} style={{ background: row.swatch }} aria-hidden />}
            {row.label}
          </span>
          <span className={styles.tooltipValue}>{row.value}</span>
        </div>
      ))}
      {footer && <div className={styles.tooltipFooter}>{footer}</div>}
    </div>
  )
}
