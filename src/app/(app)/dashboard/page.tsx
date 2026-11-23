import { DashboardScreen } from '@/components/Dashboard/DashboardScreen'

export const metadata = { title: 'Dashboard' }

// A server shell only: no request data, so the route stays static. The board is a client island
// (drag, menus, charts) running on dummy data until the backend has dashboard endpoints.
export default function DashboardPage() {
  return <DashboardScreen />
}
