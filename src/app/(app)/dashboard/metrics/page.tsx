import { redirect } from 'next/navigation'
import { SETTINGS_METRICS_ROUTE } from '@/lib/routes'

// Metric definitions live in Settings → Metrics now. One metric's page stays at /dashboard/metrics/[name] for deep links.
export default function MetricsPage(): never {
  redirect(SETTINGS_METRICS_ROUTE)
}
