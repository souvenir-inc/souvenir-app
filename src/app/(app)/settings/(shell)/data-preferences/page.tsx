'use client'

import { toast } from 'sonner'
import { DEFAULT_PERIOD_OPTIONS, useDefaultPeriod } from '@/components/Dashboard/default-period'
import { formatFigure } from '@/components/Dashboard/format'
import { Heading, Stack, Text } from '@/components/ui'
import { useNumberStyle, type NumberStyle } from '@/lib/number-style'
import { PillSelect } from '../account/_components/PillSelect'
import { SettingsCard, SettingsRow } from '../account/_components/SettingsCard'

// Settings → Data preferences (ported from front-end-test): how numbers show on dashboard cards, and
// the period a new board starts on. Both are this person's, kept in this browser (cleared on sign-out)
// until the account can hold them, and save as soon as they're picked. Exports always use exact
// figures; boards that exist keep their own dates.

const STYLE_LABEL: Record<NumberStyle, 'Rounded' | 'Exact'> = { rounded: 'Rounded', exact: 'Exact' }
const STYLE_OPTIONS = ['Rounded', 'Exact'] as const
type StyleLabel = (typeof STYLE_OPTIONS)[number]
const STYLE_OF: Record<StyleLabel, NumberStyle> = { Rounded: 'rounded', Exact: 'exact' }

// One amount in both styles, so the choice shows what it does: "$48.2k" and "$48,213.07".
const EXAMPLE = 48213.07
const STYLE_EXAMPLE: Record<StyleLabel, string> = {
  Rounded: formatFigure(EXAMPLE, 'currency', 'rounded'),
  Exact: formatFigure(EXAMPLE, 'currency', 'exact'),
}

const PERIOD_LABELS = DEFAULT_PERIOD_OPTIONS.map((p) => p.label)

export default function DataPreferencesPage() {
  const [numberStyle, setNumberStyle] = useNumberStyle()
  const [defaultPeriod, setDefaultPeriod] = useDefaultPeriod()
  const periodLabel = DEFAULT_PERIOD_OPTIONS.find((p) => p.id === defaultPeriod)?.label ?? PERIOD_LABELS[0]

  return (
    <div className="kaya-scrollbar flex min-h-0 flex-[1_0_0] items-start justify-center overflow-y-auto overflow-x-hidden px-[var(--space-6)] pb-[var(--space-9)] pt-[var(--space-10)]">
      <Stack gap="3" className="w-full max-w-[860px]">
        <Stack gap="0" className="mb-1 pl-1">
          <Heading level={1} variant="heading" weight="regular" className="m-0 [font-family:var(--font-title)]">Data preferences</Heading>
          <Text tone="tertiary" className="m-0">Only for you, in this browser. Other people in the workspace keep their own.</Text>
        </Stack>

        <SettingsCard>
          <SettingsRow title="How numbers show" subtitle="On dashboard cards. Downloads and exports always use exact figures." divider>
            <PillSelect
              label="How numbers show"
              value={STYLE_LABEL[numberStyle]}
              options={STYLE_OPTIONS}
              descriptions={STYLE_EXAMPLE}
              onChange={(label) => {
                if (STYLE_OF[label] === numberStyle) return
                setNumberStyle(STYLE_OF[label])
                toast.success(label === 'Exact' ? 'Cards now show exact figures' : 'Cards now show rounded figures')
              }}
            />
          </SettingsRow>
          <SettingsRow title="Default period" subtitle="The dates a new board starts on. Boards you already have keep their own.">
            <PillSelect
              label="Default period"
              value={periodLabel}
              options={PERIOD_LABELS}
              onChange={(label) => {
                const next = DEFAULT_PERIOD_OPTIONS.find((p) => p.label === label)
                if (!next || next.id === defaultPeriod) return
                setDefaultPeriod(next.id)
                toast.success(`New boards now start on ${label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label.replace(/^Last/, 'the last')}`)
              }}
            />
          </SettingsRow>
        </SettingsCard>
      </Stack>
    </div>
  )
}
