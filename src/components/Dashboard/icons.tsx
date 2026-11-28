import Image from 'next/image'
import { createLucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { App } from './types'

// Lucide "rotate-cw-clock" (the data sync icon in the Figma, node 82:18719). The installed
// lucide-react predates it, so it is built from Lucide's own path data with Lucide's factory.
export const RotateCwClockIcon = createLucideIcon('rotate-cw-clock', [
  ['path', { d: 'M12 7v5l4 2', key: 'hands' }],
  ['path', { d: 'M21 3v5h-5', key: 'arrow' }],
  ['path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', key: 'arc' }],
])

// The connectors that have a drawn logo, by connector slug. Shopify and Meta have mono marks too;
// the rest show their colour logo in grey until each gets its own mono mark. Any other app gets a
// letter tile (Figma "source (letter tile)", CR-22).
const LOGO: Record<string, string> = {
  shopify: 'shopify', shopify_app: 'shopify', metaads: 'meta', google_ads: 'google-ads', google_analytics: 'google-analytics',
  tiktok_ads_manager: 'tiktok', hubspot: 'hubspot', paypal: 'paypal', stripe: 'stripe',
}
const MONO = new Set(['shopify', 'meta'])

function LetterTile({ app, size, className }: { app: App; size: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={app.name}
      title={app.name}
      style={{ width: size, height: size, fontSize: size * 0.64 }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[var(--dashboard-sync-icon-radius)] bg-[var(--dashboard-sync-bg)] font-medium leading-none text-[var(--dashboard-label)]', className)}
    >
      {app.name[0]?.toUpperCase()}
    </span>
  )
}

/** The data-source mark in a card's top-right corner (Figma "source (mono)", 14px). */
export function SourceMark({ app, className }: { app: App; className?: string }) {
  const logo = LOGO[app.slug]
  if (!logo) return <LetterTile app={app} size={14} className={className} />
  const mono = MONO.has(logo)
  return (
    <Image
      src={mono ? `/dashboard/sources/${logo}.svg` : `/dashboard/sources/${logo}-color.svg`}
      alt={app.name} title={app.name} width={14} height={14} unoptimized draggable={false}
      className={cn(className, !mono && 'opacity-60 grayscale')}
    />
  )
}

/** The app's brand logo in colour (16px), as in Data sources (Figma 75:21037). */
export function SourceLogo({ app, className }: { app: App; className?: string }) {
  const logo = LOGO[app.slug]
  if (!logo) return <LetterTile app={app} size={16} className={className} />
  return <Image src={`/dashboard/sources/${logo}-color.svg`} alt="" width={16} height={16} unoptimized className={className} draggable={false} />
}
