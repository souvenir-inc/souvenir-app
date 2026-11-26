import type { ReactNode } from 'react'
import { DashboardShell } from './DashboardShell'

export const metadata = { title: 'Dashboard' }

// The shell (store name, data freshness, Scorecard / Boards / Metrics tabs) is shared by every dashboard page.
// Each page renders only its own screen inside it.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
