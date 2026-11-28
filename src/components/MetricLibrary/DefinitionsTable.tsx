'use client'

import { Fragment } from 'react'
import { listNames } from '@/components/Dashboard/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TextLink } from '@/components/ui/link'
import type { TableGroup } from '@/lib/metrics/library-table'
import { DASHBOARD_METRIC_ROUTE } from '@/lib/routes'
import { OriginTag, StatusTag } from './bits'

const COLUMNS = 5

/**
 * Every metric shown, in groups: its name (a link to its page), what it means, whether it's confirmed, whose it
 * is and the apps it reads. A real table, so screen readers announce rows and columns. A metric reading two apps
 * sits under each app when grouped by app, so row keys carry the group.
 */
export function DefinitionsTable({ groups, grouped }: { groups: readonly TableGroup[]; grouped: boolean }) {
  return (
    <Table aria-label="Metrics">
      <TableHeader>
        <TableRow>
          <TableHead>Metric</TableHead>
          <TableHead>Definition</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead>Apps</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map(group => (
          <Fragment key={group.id}>
            {grouped && (
              <TableRow>
                <TableHead scope="rowgroup" colSpan={COLUMNS} className="bg-[var(--neutral-50)] text-[var(--neutral-600)]">
                  {group.title}
                  <span className="ml-2 text-[var(--neutral-400)]">{group.rows.length}</span>
                </TableHead>
              </TableRow>
            )}
            {group.rows.map(row => (
              <TableRow key={`${group.id}:${row.name}`}>
                <TableCell className="min-w-[180px]">
                  <div className="flex flex-col items-start gap-1">
                    <TextLink href={DASHBOARD_METRIC_ROUTE(row.name)} variant="standalone">{row.label}</TextLink>
                    {row.origin !== 'builtin' && <OriginTag origin={row.origin} />}
                  </div>
                </TableCell>
                <TableCell className="max-w-[420px] text-[var(--neutral-600)]">
                  <span className="line-clamp-2">{row.description || '—'}</span>
                </TableCell>
                <TableCell><StatusTag status={row.status} /></TableCell>
                <TableCell className="whitespace-nowrap">{row.creator.name}</TableCell>
                <TableCell className="text-[var(--neutral-600)]">{row.apps.length > 0 ? listNames(row.apps.map(app => app.name)) : '—'}</TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  )
}
