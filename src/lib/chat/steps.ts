import { z } from "zod"
import { toolNameToType, webSearchResults } from "@/lib/activity"
import { deriveActivityDetail } from "@/lib/activity-detail"
import type { ReasoningTimelineItem } from "@/lib/reasoning"
import type { ActivityItem } from "@/types/chat"

// A saved turn in the order it happened, as the backend keeps it on the
// message (services/chat/schemas.py Step). Times are epoch ms.

const writtenStepSchema = z.object({
  kind: z.enum(["reasoning", "text"]),
  text: z.string(),
  at: z.number(),
  endAt: z.number(),
})

const toolStepSchema = z.object({
  kind: z.literal("tool"),
  id: z.string(),
  tool: z.string(),
  at: z.number(),
  args: z.unknown(),
  endAt: z.number().nullable(),
  failed: z.boolean(),
  results: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string() })),
})

const stepsSchema = z.array(z.discriminatedUnion("kind", [writtenStepSchema, toolStepSchema]))

export type Step = z.infer<typeof stepsSchema>[number]

export function parseSteps(raw: unknown): Step[] {
  if (raw == null) return []
  const parsed = stepsSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  console.warn("[chat] a message's steps failed schema validation", parsed.error.issues)
  return []
}

/** Saved steps as the activity rows and timeline the live stream builds from
 *  its events, so a reloaded turn renders as it did while it ran. */
export function stepsToTrace(steps: Step[], content: string): { activities: ActivityItem[]; reasoningTimeline: ReasoningTimelineItem[] } {
  const activities: ActivityItem[] = []
  const reasoningTimeline: ReasoningTimelineItem[] = []
  let cursor = 0
  steps.forEach((step, index) => {
    if (step.kind !== "tool") {
      if (step.kind === "reasoning") {
        reasoningTimeline.push({ kind: "reasoning", id: `reasoning-${index}`, content: step.text, at: step.at, endAt: step.endAt })
        return
      }
      const found = content.indexOf(step.text.trim(), cursor)
      const start = found < 0 ? cursor : found
      cursor = start + step.text.trim().length
      reasoningTimeline.push({ kind: "text", id: `text-${index}`, start })
      return
    }
    const results = webSearchResults(undefined, step.results)
    activities.push({
      id: step.id,
      type: toolNameToType(step.tool),
      toolName: step.tool,
      detail: deriveActivityDetail(step.tool, step.args),
      status: step.endAt === null ? "stopped" : step.failed ? "error" : "done",
      ...(step.endAt === null ? {} : { durationS: (step.endAt - step.at) / 1000 }),
      ...(results.length > 0 ? { results } : {}),
    })
    reasoningTimeline.push({
      kind: "activity",
      id: `activity-${index}`,
      activityId: step.id,
      at: step.at,
      ...(step.endAt === null ? {} : { endAt: step.endAt }),
    })
  })
  return { activities, reasoningTimeline }
}
