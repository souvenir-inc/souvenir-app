import { MetricDefinitionsScreen } from '@/components/MetricLibrary'

export const metadata = { title: 'Metrics' }

// Settings → Metrics: what every metric means and how it's calculated. Outside (org) on purpose: every member reads definitions.
export default function SettingsMetricsPage() {
  return <MetricDefinitionsScreen />
}
