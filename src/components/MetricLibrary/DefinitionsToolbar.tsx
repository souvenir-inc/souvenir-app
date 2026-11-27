'use client'

import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, type SelectOption } from '@/components/ui/select'
import {
  FILTER_NAMES, GROUP_NAMES, MAX_QUERY_LENGTH, optionsOf, type FilterKind, type GroupBy, type TableFilter, type TableRow,
} from '@/lib/metrics/library-table'

const ALL = '__all__'
const PICKABLE: readonly FilterKind[] = ['status', 'area', 'creator', 'app']
const GROUPS: ReadonlyArray<SelectOption<GroupBy>> = (['area', 'creator', 'app', 'none'] as const).map(value => ({ value, label: GROUP_NAMES.get(value) ?? value }))

export interface DefinitionsToolbarProps {
  rows: readonly TableRow[]
  filter: TableFilter
  onFilter: (filter: TableFilter) => void
  groupBy: GroupBy
  onGroupBy: (by: GroupBy) => void
  /** "64 metrics • 9 custom", announced as it changes. */
  count: string
}

/** Search, one pick per filter (each option counted against the others), and grouping. */
export function DefinitionsToolbar({ rows, filter, onFilter, groupBy, onGroupBy, count }: DefinitionsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search metrics"
          placeholder="Search metrics"
          type="search"
          size="small"
          leftIcon={<Search size={16} aria-hidden />}
          maxLength={MAX_QUERY_LENGTH}
          value={filter.query}
          onChange={query => onFilter({ ...filter, query })}
          onKeyDown={event => { if (event.key === 'Escape' && filter.query !== '') { event.preventDefault(); onFilter({ ...filter, query: '' }) } }}
          className="w-full max-w-[280px]"
        />
        {PICKABLE.map(kind => {
          const name = FILTER_NAMES.get(kind) ?? kind
          const options: Array<SelectOption<string>> = [
            { value: ALL, label: `Any ${name.toLowerCase()}` },
            ...optionsOf(rows, filter, kind).map(option => ({ value: option.value, label: `${option.label} (${option.count})` })),
          ]
          if (options.length <= 2 && kind !== 'status') return null
          return (
            <Select
              key={kind}
              aria-label={name}
              options={options}
              value={filter[kind][0] ?? ALL}
              onValueChange={value => onFilter({ ...filter, [kind]: value === ALL ? [] : [value] })}
              variant={filter[kind].length > 0 ? 'secondary' : 'outline'}
            />
          )
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-small text-[var(--neutral-500)]" aria-live="polite">{count}</span>
          <Select aria-label="Group by" options={GROUPS} value={groupBy} onValueChange={onGroupBy} variant="ghost" />
        </div>
      </div>
    </div>
  )
}
