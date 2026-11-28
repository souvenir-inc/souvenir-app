import { Frame, Skeleton } from '@/components/Dashboard/DashboardStates'

// The same frame and card skeletons the screen shows while it loads, so nothing shifts when it takes over.
export default function Loading() {
  return <Frame><Skeleton /></Frame>
}
