import { redirect } from 'next/navigation'
import { DASHBOARD_ROUTE } from '@/lib/routes'

// Boards became the dashboard itself. Old links (and `?focus=`) land on /dashboard.
export default async function BoardsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }): Promise<never> {
  const { focus } = await searchParams
  redirect(typeof focus === 'string' ? `${DASHBOARD_ROUTE}?focus=${encodeURIComponent(focus)}` : DASHBOARD_ROUTE)
}
