"use client"

import type { CSSProperties, ReactNode } from "react"
import { m, type HTMLMotionProps } from "framer-motion"

const BASE_STYLE: CSSProperties = {
  minWidth: 0,
  margin: "var(--space-4) 0",
  padding: "var(--space-4) var(--space-4) var(--space-3)",
  border: "1px solid var(--neutral-100)",
  borderRadius: 'var(--radius-xl)',
  background: "var(--neutral-white)",
}

interface ChatChartShellProps extends Omit<HTMLMotionProps<"div">, "children"> {
  title?: string
  children: ReactNode
}

/** Shared surface and title treatment for charts rendered inside chat. */
export function ChatChartShell({ title, children, style, ...props }: ChatChartShellProps) {
  return (
    <m.div style={{ ...BASE_STYLE, ...style }} {...props}>
      {title && (
        <div
          style={{
            marginBottom: 'var(--space-3)',
            color: "var(--neutral-900)",
            fontFamily: "var(--font-body)",
            fontSize: 'var(--font-size-body-sm)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          {title}
        </div>
      )}
      {children}
    </m.div>
  )
}
