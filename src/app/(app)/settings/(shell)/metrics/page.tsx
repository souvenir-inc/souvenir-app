import { MetricDefinitionsScreen } from '@/components/MetricLibrary'

export const metadata = { title: 'Metrics' }

// Settings → Metrics: what every metric means and how it's calculated. Outside (org) on purpose: every workspace
// member reads definitions; the warehouse answers 403 when it isn't turned on, and the screen says so.
export default function SettingsMetricsPage() {
  return <MetricDefinitionsScreen />
}
