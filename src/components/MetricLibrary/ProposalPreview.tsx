'use client'

import { useMemo } from 'react'
import type { CustomMetric, Measurement, MetricAggregate } from '@/lib/api/warehouse'
import { describeSource, DISPLAY_NAMES } from '@/lib/metrics/display'
import { printFormula } from '@/lib/metrics/formula'
import { buildTreeFromValue, displayOfMetric, isAggregate, namesIn } from '@/lib/metrics/tree'
import { afterData, periodPhrase } from '@/lib/metrics/windows'
import { usePeriod } from '@/lib/warehouse/period'
import { CalculationTree } from './CalculationTree'
import { useLibrary, useWindowTotals } from './useLibrary'
import styles from './MetricLibrary.module.css'

function valuesOf(measurement: Measurement | undefined): Record<string, number | null> | undefined {
  return measurement?.periods[0]?.values
}

/**
 * A proposed metric before it's saved: its words, its formula and its tree with live numbers. Its inputs are
 * measured for real and the arithmetic is done here, so nothing is written to the warehouse to preview it.
 */
export function ProposalPreview({ proposal }: { proposal: CustomMetric }) {
  const library = useLibrary()
  const tree = useMemo(() => buildTreeFromValue(proposal.name, proposal.value, library.lookup), [proposal, library.lookup])
  // The proposal's own name may already exist (a replace): measuring it would show the old number, so leave it out.
  const names = useMemo(() => namesIn(tree, library.known).filter(name => name !== proposal.name), [tree, library.known, proposal.name])
  const timeZone = library.workspace.data?.timezone
  const until = library.untilOf(names)
  const period = usePeriod()
  const totals = useWindowTotals(names, period, timeZone, true, until)
  const display = displayOfMetric(proposal.name, proposal.unit, proposal.value, library.unitOf)
  const root = isAggregate(proposal.value)
  const labelOf = (name: string) => (name === proposal.name ? proposal.label : library.labelOf(name))
  const lookup = (name: string) => (name === proposal.name ? proposal.value : library.lookup(name))
  const waiting = names.length > 0 && totals.current.data === undefined && !totals.current.isError

  return (
    <div className={styles.proposal}>
      <div className={styles.proposalHead}>
        <div>
          <h3 className={styles.proposalTitle}>{proposal.label}</h3>
          {proposal.description && <p className={styles.proposalText}>{proposal.description}</p>}
        </div>
        <span className={styles.tag}>{DISPLAY_NAMES[display]}</span>
      </div>
      <CalculationTree
        tree={tree}
        lookup={lookup}
        unitOf={name => (name === proposal.name ? proposal.unit : library.unitOf(name))}
        labelOf={labelOf}
        current={root || afterData(totals.span, until) || library.neverSyncedOf(names) ? {} : waiting ? undefined : valuesOf(totals.current.data) ?? {}}
        previous={root ? {} : valuesOf(totals.previous.data)}
        unavailable={totals.current.data?.unavailable ?? {}}
        linkable={new Set()}
        isCustom={library.isCustom}
        fill={n => library.fill(n, totals.span.end)}
        rootDisplay={display}
        openDepth={3}
      />
      <p className={styles.treeFooter}>
        {root
          ? <>{describeSource(proposal.value as MetricAggregate).sentence}.</>
          : <>Numbers for {periodPhrase(period, totals.span)}: {printFormula(proposal.value, { pretty: true, labelOf })}.</>}
      </p>
    </div>
  )
}
