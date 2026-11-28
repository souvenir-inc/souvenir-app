'use client'

import React from 'react'
import { TickTwoIcon } from '@strange-huge/icons'
import { Button } from '@/components/ui/button'
import styles from './feedback.module.css'

export { styles as feedbackStyles }

/** The settings page frame shared by Report a bug and Request a feature: header, form card, side panel. */
export function FeedbackPage({ title, description, aside, children }: {
  title: string
  description: string
  aside: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className="kaya-scrollbar"
      style={{ flex: '1 0 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 'var(--space-10) var(--space-6) var(--space-9)' }}
    >
      <div style={{ width: '100%', maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ paddingLeft: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-heading)', lineHeight: 'var(--line-height-heading)', color: 'var(--neutral-900)', margin: 0 }}>{title}</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--font-size-body)', lineHeight: 'var(--line-height-body)', color: 'var(--neutral-600)', margin: 0 }}>{description}</p>
        </div>
        <div className={styles.layout}>
          {children}
          <aside className={styles.card} aria-label="About this form">
            <div className={styles.aside}>{aside}</div>
          </aside>
        </div>
      </div>
    </div>
  )
}

export function Field({ label, htmlFor, optional, hint, error, children }: {
  label: string
  htmlFor?: string
  optional?: boolean
  hint?: string
  error?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {optional && <span className={styles.optional}>Optional</span>}
      </label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
      {error}
    </div>
  )
}

export function ChoiceGroup<T extends string>({ label, options, value, onChange }: {
  label: string
  options: { value: T; title: string; hint: string; color?: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className={styles.choices} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={styles.choice}
          onClick={() => onChange(option.value)}
        >
          <span className={styles.choiceTitle}>
            {option.color && <span className={styles.dot} style={{ background: option.color }} aria-hidden="true" />}
            {option.title}
          </span>
          <span className={styles.choiceHint}>{option.hint}</span>
        </button>
      ))}
    </div>
  )
}

export function NextSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <>
      <p className={styles.asideTitle}>{title}</p>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step} className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </>
  )
}

export function SentState({ title, text, againLabel, onAgain, onBack, backLabel }: {
  title: string
  text: string
  againLabel: string
  onAgain: () => void
  backLabel: string
  onBack: () => void
}) {
  return (
    <section className={styles.card} role="status">
      <div className={styles.done}>
        <span className={styles.doneIcon} aria-hidden="true"><TickTwoIcon size={22} /></span>
        <p className={styles.doneTitle}>{title}</p>
        <p className={styles.doneText}>{text}</p>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" onClick={onBack}>{backLabel}</Button>
          <Button variant="default" size="sm" onClick={onAgain}>{againLabel}</Button>
        </div>
      </div>
    </section>
  )
}
