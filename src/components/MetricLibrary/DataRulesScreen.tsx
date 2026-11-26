'use client'

import React, { useMemo, useState } from 'react'
import { ChevronDown, Lock, RotateCw } from 'lucide-react'
import { ConnectorGlyph } from '@/components/ConnectorGlyph'
import { useConnectorIdentities } from '@/components/ContextPanel/identity'
import { Skeleton } from '@/components/Skeleton'
import { Tooltip } from '@/components/Tooltip'
import { appsByArea, dataRules, syncLine } from '@/lib/metrics/data-rules'
import { useLibrary } from './useLibrary'
import styles from './MetricTable.module.css'

/**
 * Settings → Data → Data rules: which orders count before any metric uses them, and which app feeds each kind of data.
 * Read from the definitions and the workspace as they are; the rules are built in, so each shows a lock and the
 * metrics it shapes.
 */
export function DataRulesScreen() {
  const library = useLibrary()
  const [tab, setTab] = useState<'rules' | 'apps'>('rules')
  const rules = useMemo(() => dataRules(library.entries), [library.entries])
  const areas = useMemo(() => appsByArea(library.workspace.data), [library.workspace.data])
  const logos = useConnectorIdentities(useMemo(() => [...new Set(areas.flatMap(area => area.apps.map(app => app.slug)))], [areas]))
  const loaded = library.catalog.data !== undefined && library.workspace.data !== undefined

  return (
    <div className={`kaya-scrollbar ${styles.page}`}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>Data rules</h1>
          <p className={styles.subtitle}>Which orders count before any metric uses them</p>
        </div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Data rules">
        <button type="button" role="tab" className={styles.tab} aria-selected={tab === 'rules'} onClick={() => setTab('rules')}>Rules</button>
        <button type="button" role="tab" className={styles.tab} aria-selected={tab === 'apps'} onClick={() => setTab('apps')}>Apps for each kind of data</button>
      </div>

      {library.catalog.isError || library.workspace.isError ? (
        <div className={styles.message}>
          <p className={styles.messageTitle}>Data rules failed to load</p>
          <p className={styles.messageHint}>Nothing changed</p>
          <button type="button" className={styles.ghost} onClick={() => { void library.catalog.refetch(); void library.workspace.refetch() }}>
            <RotateCw size={14} strokeWidth={1.75} aria-hidden />
            Try again
          </button>
        </div>
      ) : !loaded ? (
        <div className={styles.skeleton} aria-label="Loading data rules">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height="52px" radius="8px" />)}
        </div>
      ) : tab === 'rules' ? (
        rules.length === 0 ? (
          <div className={styles.message}>
            <p className={styles.messageTitle}>No order rules yet</p>
            <p className={styles.messageHint}>Rules show here once a definition leaves orders out</p>
          </div>
        ) : (
          <section className={styles.reviewCard} style={{ marginTop: 20 }} aria-label="Orders that don’t count">
            <div className={styles.reviewHead} style={{ cursor: 'default' }}>
              Orders that don’t count
              <span className={styles.bandCount}>{rules.length}</span>
            </div>
            {rules.map(rule => <RuleRow key={rule.id} rule={rule} />)}
          </section>
        )
      ) : areas.length === 0 ? (
        <div className={styles.message}>
          <p className={styles.messageTitle}>No apps connected</p>
          <p className={styles.messageHint}>Connect an app and the kinds of data it sends show here</p>
        </div>
      ) : (
        <section className={styles.reviewCard} style={{ marginTop: 20 }} aria-label="Apps for each kind of data">
          {areas.map(area => (
            <div key={area.category} className={styles.reviewRow}>
              <div className={styles.reviewText}>
                <span className={styles.ruleTitle}>{area.title}</span>
                <span className={styles.reviewLine}>{area.apps.length === 1 ? '1 app' : `${area.apps.length} apps`}</span>
              </div>
              <div className={styles.areaApps}>
                {area.apps.map(app => (
                  <span key={app.slug} className={styles.areaApp}>
                    <ConnectorGlyph slug={app.slug} name={app.name} logoUrl={logos.get(app.slug)?.logo ?? null} size={16} />
                    <span className={styles.appName}>{app.name}</span>
                    <span className={styles.reviewLine} data-tone={app.status === 'failed' ? 'bad' : undefined}>{syncLine(app.status, app.lastSyncedAt)}</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function RuleRow({ rule }: { rule: { id: string; title: string; hint: string; metrics: { name: string; label: string }[] } }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.ruleRow}>
      <button type="button" className={styles.ruleHead} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={styles.reviewText}>
          <span className={styles.ruleTitle}>{rule.title}</span>
          <span className={styles.reviewLine}>{rule.hint}</span>
        </span>
        <span className={styles.ruleMeta}>
          Left out of {rule.metrics.length === 1 ? '1 metric' : `${rule.metrics.length} metrics`}
          <ChevronDown size={12} strokeWidth={2} aria-hidden />
        </span>
        <Tooltip content="Built in" side="top" delayDuration={200}>
          <span className={styles.ruleLock}><Lock size={14} strokeWidth={1.75} aria-label="Built in" /></span>
        </Tooltip>
      </button>
      {open && (
        <ul className={styles.ruleMetrics}>
          {rule.metrics.map(metric => <li key={metric.name}>{metric.label}</li>)}
        </ul>
      )}
    </div>
  )
}
