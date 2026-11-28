'use client'

import { LazyMotion, MotionConfig, domMax } from 'framer-motion'

// reducedMotion="user": with the system's "reduce motion" setting on, framer-motion skips movement
// (position, scale, layout) and keeps fades. The CSS @media rules only covered CSS animations.
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domMax}>{children}</LazyMotion>
    </MotionConfig>
  )
}
