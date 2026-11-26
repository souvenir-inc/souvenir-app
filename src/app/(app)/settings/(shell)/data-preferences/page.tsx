'use client'

import React from 'react'
import { toast } from 'sonner'
import { useNumberStyle, type NumberStyle } from '@/lib/number-style'
import { PERIOD_OPTIONS, useDefaultPeriod, type QuickPeriod } from '@/lib/warehouse/period'
import styles from '../account/account.module.css'
import { PillSelect } from '../account/_components/PillSelect'

const STYLE_LABELS = ['Rounded', 'Exact'] as const
type StyleLabel = (typeof STYLE_LABELS)[number]
const STYLE_OF: Record<StyleLabel, NumberStyle> = { Rounded: 'rounded', Exact: 'exact' }
const STYLE_LABEL: Record<NumberStyle, StyleLabel> = { rounded: 'Rounded', exact: 'Exact' }
const STYLE_EXAMPLES: Record<StyleLabel, string> = { Rounded: '$48.2k', Exact: '$48,213.07' }

const PERIOD_LABELS = PERIOD_OPTIONS.map(option => option.label)
type PeriodLabel = (typeof PERIOD_LABELS)[number]
const PERIOD_OF = Object.fromEntries(PERIOD_OPTIONS.map(option => [option.label, option.value])) as Record<PeriodLabel, QuickPeriod>
const PERIOD_LABEL = Object.fromEntries(PERIOD_OPTIONS.map(option => [option.value, option.label])) as Record<QuickPeriod, PeriodLabel>

/**
 * Settings → Data → Preferences: how numbers show and the period every board opens on. Only for this person; other
 * people in the workspace keep their own. Both save as soon as they're picked.
 */
export default function DataPreferencesPage() {
  const { numberStyle, setNumberStyle } = useNumberStyle()
  const { defaultPeriod, setDefaultPeriod } = useDefaultPeriod()

  return (
    <div
      className="kaya-scrollbar"
      style={{ flex: '1 0 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '64px 24px 48px' }}
    >
      <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ paddingLeft: 4, marginBottom: 4 }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 400, fontSize: 24, lineHeight: '32px', color: 'var(--neutral-900)', margin: 0 }}>Preferences</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 14, lineHeight: '22px', color: 'var(--neutral-600)', margin: 0 }}>
            Only for you • Other people in the workspace keep their own
          </p>
        </div>

        <section className={styles.card} aria-label="Preferences">
          <dl className={styles.details}>
            <div className={styles.detailRow}>
              <dt>
                <span className={styles.detailLabel}>How numbers show</span>
                <span className={styles.detailHint}>Exports & Souvenir AI always use exact figures</span>
              </dt>
              <dd className={styles.detailControl}>
                <PillSelect
                  label="How numbers show"
                  value={STYLE_LABEL[numberStyle]}
                  options={STYLE_LABELS}
                  descriptions={STYLE_EXAMPLES}
                  onChange={label => {
                    if (STYLE_OF[label] === numberStyle) return
                    setNumberStyle(STYLE_OF[label])
                    toast.success(label === 'Exact' ? 'Numbers now show exact figures' : 'Numbers now show rounded')
                  }}
                />
              </dd>
            </div>
            <div className={styles.detailRow}>
              <dt>
                <span className={styles.detailLabel}>Default period</span>
                <span className={styles.detailHint}>Every board opens on this period</span>
              </dt>
              <dd className={styles.detailControl}>
                <PillSelect
                  label="Default period"
                  value={PERIOD_LABEL[defaultPeriod]}
                  options={PERIOD_LABELS}
                  onChange={label => {
                    if (PERIOD_OF[label] === defaultPeriod) return
                    setDefaultPeriod(PERIOD_OF[label])
                    toast.success(`Every board now opens on ${label === 'Today' ? 'today' : label.toLowerCase()}`)
                  }}
                />
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}
