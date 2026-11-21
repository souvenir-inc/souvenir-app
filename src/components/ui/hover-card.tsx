'use client'

import * as HoverCardPrimitive from '@radix-ui/react-hover-card'

// Hover card (preview on hover / focus) on Radix. Unstyled: the one caller today, SourceCitation,
// draws its own card. Feature code imports it from here rather than from Radix directly.

export const HoverCard        = HoverCardPrimitive.Root
export const HoverCardTrigger = HoverCardPrimitive.Trigger
export const HoverCardPortal  = HoverCardPrimitive.Portal
export const HoverCardContent = HoverCardPrimitive.Content
