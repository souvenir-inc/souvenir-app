import { MetricPageScreen } from '@/components/MetricLibrary'

export const metadata = { title: 'Metric' }

export default async function MetricPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  return <MetricPageScreen name={decodeURIComponent(name)} />
}
