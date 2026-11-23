import Image from 'next/image'
import { createLucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SOURCE_NAMES } from './sources'
import type { MetricSource } from './types'

// Lucide "rotate-cw-clock" (the data sync icon in the Figma, node 82:18719). The installed
// lucide-react predates it, so it is built from Lucide's own path data with Lucide's factory.
export const RotateCwClockIcon = createLucideIcon('rotate-cw-clock', [
  ['path', { d: 'M12 7v5l4 2', key: 'hands' }],
  ['path', { d: 'M21 3v5h-5', key: 'arrow' }],
  ['path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', key: 'arc' }],
])

export { SOURCE_NAMES } from './sources'

// Shopify and Meta have drawn mono marks; the other apps' marks are their logos in grey until the
// build uses each app's own mono mark (the Figma's extra logos are Simple Icons, "for mock lists").
const MONO: Partial<Record<MetricSource, string>> = {
  shopify: '/dashboard/sources/shopify.svg',
  meta: '/dashboard/sources/meta.svg',
}

// Apps the catalog has no logo for show a letter tile (Figma "source (letter tile)", CR-22).
const NO_LOGO = new Set<MetricSource>(['shipstation'])

function LetterTile({ source, size, className }: { source: MetricSource; size: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={SOURCE_NAMES[source]}
      title={SOURCE_NAMES[source]}
      style={{ width: size, height: size, fontSize: size * 0.64 }}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[3px] bg-[var(--dashboard-sync-bg)] font-medium leading-none text-[var(--dashboard-label)]', className)}
    >
      {SOURCE_NAMES[source][0]}
    </span>
  )
}

/** The data-source mark in a card's top-right corner (Figma "source (mono)", 14px). */
export function SourceMark({ source, className }: { source: MetricSource; className?: string }) {
  if (NO_LOGO.has(source)) return <LetterTile source={source} size={14} className={className} />
  const mono = MONO[source]
  const label = SOURCE_NAMES[source]
  return (
    <Image
      src={mono ?? `/dashboard/sources/${source}-color.svg`}
      alt={label} title={label} width={14} height={14} unoptimized draggable={false}
      className={cn(className, !mono && 'opacity-60 grayscale')}
    />
  )
}

/** The app's brand logo in colour (16px), as in Data sources (Figma 75:21037). */
export function SourceLogo({ source, className }: { source: MetricSource; className?: string }) {
  if (NO_LOGO.has(source)) return <LetterTile source={source} size={16} className={className} />
  return <Image src={`/dashboard/sources/${source}-color.svg`} alt="" width={16} height={16} unoptimized className={className} draggable={false} />
}
