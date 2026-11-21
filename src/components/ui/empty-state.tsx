import React from 'react'
import { cn } from '@/lib/utils'

// EmptyState: what a list, panel or page shows when there's nothing in it yet, or when it couldn't
// load. A centred icon tile, a title, one or two lines of explanation, and an optional action.
//
//   <EmptyState icon={<FolderOneIcon size={20} />} title="No files yet"
//     description="Upload a file to start your library." action={<Button size="sm">Upload</Button>} />

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** A button (or two, in an Inline). */
  action?: React.ReactNode
  /** sm for inside cards and side panels; md (default) for a page or a large panel. */
  size?: 'sm' | 'md'
  /** `alert` for a load failure, so it's announced. */
  role?: 'status' | 'alert'
  ref?: React.Ref<HTMLDivElement>
}

export function EmptyState({ icon, title, description, action, size = 'md', role, className, ref, ...props }: EmptyStateProps) {
  const sm = size === 'sm'
  return (
    <div
      ref={ref}
      role={role}
      className={cn('flex flex-col items-center justify-center text-center', sm ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12', className)}
      {...props}
    >
      {icon && (
        <span
          aria-hidden
          className={cn(
            'inline-flex items-center justify-center text-[var(--neutral-500)] bg-[var(--neutral-100)] shadow-[inset_0_0_0_1px_var(--neutral-200)]',
            sm ? 'size-8 rounded-md' : 'size-10 rounded-lg',
          )}
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-[360px] flex-col gap-1">
        <p className={cn('m-0 font-medium text-[var(--neutral-900)]', sm ? 'text-body' : 'text-body-lg')}>{title}</p>
        {description && <p className={cn('m-0 text-[var(--neutral-500)]', sm ? 'text-small' : 'text-body')}>{description}</p>}
      </div>
      {action && <div className={cn('flex items-center gap-2', sm ? 'mt-1' : 'mt-2')}>{action}</div>}
    </div>
  )
}
