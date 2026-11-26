import { CanvasScreen } from '@/components/Canvas'

export const metadata = { title: 'Dashboard' }

// The dashboard: one tab per use case, each a canvas of metric cards. Clicking a card opens that metric's modal.
// `?focus=<metric name>` (from "Open in Boards" on a metric page) opens the diagnose view for that metric.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { focus } = await searchParams
  return <CanvasScreen focus={typeof focus === 'string' ? focus : undefined} />
}
