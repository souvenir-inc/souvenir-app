import Image from 'next/image'
import { createLucideIcon } from 'lucide-react'
import type { MetricSource } from './types'

// Lucide "rotate-cw-clock" (the data sync icon in the Figma, node 82:18719). The installed
// lucide-react predates it, so it is built from Lucide's own path data with Lucide's factory.
export const RotateCwClockIcon = createLucideIcon('rotate-cw-clock', [
  ['path', { d: 'M12 7v5l4 2', key: 'hands' }],
  ['path', { d: 'M21 3v5h-5', key: 'arrow' }],
  ['path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', key: 'arc' }],
])

const SOURCES: Record<MetricSource, { src: string; label: string }> = {
  shopify: { src: '/dashboard/sources/shopify.svg', label: 'Shopify' },
  meta:    { src: '/dashboard/sources/meta.svg',    label: 'Meta Ads' },
}

/** The data-source mark in a card's top-right corner (Figma "source (mono)", 14px). */
export function SourceMark({ source, className }: { source: MetricSource; className?: string }) {
  const { src, label } = SOURCES[source]
  return <Image src={src} alt={label} title={label} width={14} height={14} unoptimized className={className} draggable={false} />
}

const LOGOS: Record<MetricSource, string> = {
  shopify: '/dashboard/sources/shopify-color.svg',
  meta:    '/dashboard/sources/meta-color.svg',
}

/** The app's brand logo in colour (16px), as in Data sources (Figma 75:21037). */
export function SourceLogo({ source, className }: { source: MetricSource; className?: string }) {
  return <Image src={LOGOS[source]} alt="" width={16} height={16} unoptimized className={className} draggable={false} />
}

export const SOURCE_NAMES: Record<MetricSource, string> = { shopify: 'Shopify', meta: 'Meta Ads' }
