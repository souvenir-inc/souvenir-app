'use client'

import React, { Suspense } from 'react'
import { useIsClient } from '@/hooks/use-is-client'
import type { Metric } from './types'

// The card charts pull in Recharts (~290 KB raw), so they load after the board's text: same
// pattern as components/Sparkline. Until a chart arrives (and during server rendering) an empty
// box of the same size holds its place, so nothing shifts.

const SparklineChart = React.lazy(() => import('./Sparkline').then((m) => ({ default: m.Sparkline })))
const WeeklyBarsChart = React.lazy(() => import('./WeeklyBars').then((m) => ({ default: m.WeeklyBars })))

function Lazy({ className, children }: { className?: string; children: React.ReactNode }) {
  const isClient = useIsClient()
  const placeholder = <div aria-hidden className={className} />
  if (!isClient) return placeholder
  return <Suspense fallback={placeholder}>{children}</Suspense>
}

export function LazySparkline({ trend, className }: { trend: Metric['trend']; className?: string }) {
  return <Lazy className={className}><SparklineChart trend={trend} className={className} /></Lazy>
}

export function LazyWeeklyBars({ metric, className }: { metric: Metric; className?: string }) {
  return <Lazy className={className}><WeeklyBarsChart metric={metric} className={className} /></Lazy>
}
