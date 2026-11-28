import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RouteState } from '@/components/RouteState'
import { ROOT_ROUTE } from '@/lib/routes'

// A link to a page that doesn't exist: said plainly, with the way back, instead of Next's bare 404.
export default function NotFound() {
  return (
    <main className="flex min-h-screen bg-[var(--neutral-50)]">
      <RouteState
        fill
        heading="This page doesn’t exist"
        body="The link may be old, or the page may have moved."
        actions={<Button variant="default" asChild><Link href={ROOT_ROUTE}>Go to Souvenir</Link></Button>}
      />
    </main>
  )
}
