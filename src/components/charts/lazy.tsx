'use client'

import { lazy, Suspense } from 'react'
import { useIsClient } from '@/hooks/use-is-client'
import type { TrendChartProps } from './TrendChartImpl'
import type { WeeklyBarsProps } from './WeeklyBarsImpl'
import styles from './charts.module.css'

// The Recharts charts load the first time one renders, not with the page (Recharts is ~290 KB). Until
// then, and during server rendering, a quiet box of the same height holds the space so nothing shifts.

const TrendChartImpl = lazy(() => import('./TrendChartImpl').then(m => ({ default: m.TrendChart })))
const WeeklyBarsImpl = lazy(() => import('./WeeklyBarsImpl').then(m => ({ default: m.WeeklyBars })))

function Placeholder({ height }: { height: number }) {
  return <div className={styles.placeholder} style={{ height }} aria-hidden />
}

export function TrendChart(props: TrendChartProps) {
  const isClient = useIsClient()
  const placeholder = <Placeholder height={props.height ?? 200} />
  if (!isClient) return placeholder
  return <Suspense fallback={placeholder}><TrendChartImpl {...props} /></Suspense>
}

export function WeeklyBars(props: WeeklyBarsProps) {
  const isClient = useIsClient()
  const placeholder = <Placeholder height={props.height ?? 180} />
  if (!isClient) return placeholder
  return <Suspense fallback={placeholder}><WeeklyBarsImpl {...props} /></Suspense>
}
