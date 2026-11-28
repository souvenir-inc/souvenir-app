import { notFound } from 'next/navigation'
import { MetricPageScreen } from '@/components/MetricLibrary'
import { isMetricName } from '@/lib/metrics/formula'

export const metadata = { title: 'Metric' }

/** The segment as a metric name: decoded once, and only a name the warehouse could hold (^[a-z][a-z0-9_]*$, ≤ 64). */
function metricNameFrom(segment: string): string | null {
  let name: string
  try {
    name = decodeURIComponent(segment)
  } catch {
    return null // A malformed escape ("%E0%A4%A") is no metric's name.
  }
  return isMetricName(name) ? name : null
}

// A server shell: the name is checked here, so a URL that can't name a metric is a 404, never a page that loads
// forever. A well-formed name the catalog doesn't have gets the screen's own "no metric" state.
export default async function MetricPage({ params }: { params: Promise<{ name: string }> }) {
  const name = metricNameFrom((await params).name)
  if (name === null) notFound()
  return <MetricPageScreen name={name} />
}
