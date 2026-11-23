import type { MetricSource } from './types'

/** The apps' names as people see them (Figma 95:18703). */
export const SOURCE_NAMES: Record<MetricSource, string> = {
  shopify: 'Shopify',
  meta: 'Meta Ads',
  'google-ads': 'Google Ads',
  tiktok: 'TikTok Ads',
  'google-analytics': 'Google Analytics',
  pinterest: 'Pinterest Ads',
  stripe: 'Stripe',
  paypal: 'PayPal',
  zendesk: 'Zendesk',
  reddit: 'Reddit Ads',
  hubspot: 'HubSpot',
  shipstation: 'ShipStation',
}

/** The workspace's apps in the order the Figma lists them; ties in Data sources keep it. */
export const APP_ORDER: MetricSource[] = [
  'shopify', 'meta', 'google-ads', 'tiktok', 'google-analytics', 'pinterest',
  'stripe', 'paypal', 'zendesk', 'reddit', 'hubspot', 'shipstation',
]
