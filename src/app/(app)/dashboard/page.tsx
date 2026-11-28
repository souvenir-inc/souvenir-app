import { DashboardScreen } from '@/components/Dashboard/DashboardScreen'

export const metadata = { title: 'Dashboard' }

// A server shell only: no request data, so the route stays static. The board is a client island
// (drag, menus, charts) that reads the warehouse API from the browser.
export default function DashboardPage() {
  return <DashboardScreen />
}
