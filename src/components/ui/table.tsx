import React from 'react'
import { cn } from '@/lib/utils'

// Table: real <table> markup (so screen readers announce rows and columns) in the settings style —
// body text, a quiet small header row, hairline dividers between rows, 24px side padding to line up
// with Card sections. Put it inside a Card (variant="panel") for the bordered settings look.
//
//   <Table aria-label="Members">
//     <TableHeader><TableRow><TableHead>Name</TableHead><TableHead align="end">Role</TableHead></TableRow></TableHeader>
//     <TableBody>{rows.map(r => <TableRow key={r.id}><TableCell>{r.name}</TableCell>…</TableRow>)}</TableBody>
//   </Table>

type Align = 'start' | 'center' | 'end'
const ALIGN: Record<Align, string> = { start: 'text-start', center: 'text-center', end: 'text-end' }

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="kaya-scrollbar w-full min-w-0 overflow-x-auto">
      <table className={cn('w-full border-collapse text-body text-[var(--neutral-900)]', className)} {...props} />
    </div>
  )
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-solid [&_tr]:border-[var(--neutral-100)]', className)} {...props} />
}

export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-solid border-[var(--neutral-100)] transition-colors duration-fast data-[state=selected]:bg-[var(--neutral-50)]', className)}
      {...props}
    />
  )
}

export interface TableHeadProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: Align
}

export function TableHead({ align = 'start', className, ...props }: TableHeadProps) {
  return (
    <th
      scope="col"
      className={cn('px-6 py-2.5 text-small font-medium text-[var(--neutral-500)] whitespace-nowrap first:pl-6 last:pr-6', ALIGN[align], className)}
      {...props}
    />
  )
}

export interface TableCellProps extends Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: Align
}

export function TableCell({ align = 'start', className, ...props }: TableCellProps) {
  return <td className={cn('px-6 py-3 align-middle', ALIGN[align], className)} {...props} />
}

/** One full-width row for "no results" inside a table body. */
export function TableEmpty({ colSpan, children, className }: { colSpan: number; children: React.ReactNode; className?: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className={cn('px-6 py-8 text-center text-body text-[var(--neutral-500)]', className)}>{children}</td>
    </tr>
  )
}
