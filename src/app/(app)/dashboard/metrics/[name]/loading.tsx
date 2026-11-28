import { Frame } from '@/components/Dashboard/DashboardStates'
import { LoadingRows } from '@/components/MetricLibrary'

// The metric page's own first paint (the dashboard's board skeleton would shift when the page takes over).
export default function Loading() {
  return <Frame><LoadingRows rows={5} label="Loading metric" /></Frame>
}
