'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CustomMetric, MetricEntry } from '@/lib/api/warehouse'
import { requestOf } from '@/lib/metrics/catalog'
import { metricErrorMessage } from '@/lib/metrics/errors'
import { deleteMetricOptions, putMetricOptions } from '@/lib/metrics/metric-mutations'
import type { Library } from './use-library'

/**
 * The library's changes, each one mutation with one message on failure (API-ER-11, 16): the toast is shown here,
 * never also in the mutation. `save` resolves to whether it worked, so a dialog stays open on failure.
 */
export function useMetricActions(library: Library) {
  const qc = useQueryClient()
  const put = useMutation(putMetricOptions(qc, library.org, library.warehouse))
  const remove = useMutation(deleteMetricOptions(qc, library.org, library.warehouse))

  const save = async (metric: CustomMetric, done: string): Promise<boolean> => {
    try {
      await put.mutateAsync(metric)
      toast.success(done)
      return true
    } catch (error) {
      toast.error(metricErrorMessage(error, 'save'))
      return false
    }
  }

  /** Confirm: the entry exactly as it is, with `verified: true`. */
  const confirm = (entry: MetricEntry) => {
    put.mutate(requestOf(entry, true), {
      onSuccess: () => toast.success(`${entry.label} confirmed`),
      onError: error => toast.error(metricErrorMessage(error, 'confirm')),
    })
  }

  /**
   * Delete a custom metric, or go back to Souvenir's definition of an adjusted one (both DELETE). Throws the
   * friendly message, so a confirm dialog stays open and shows it.
   */
  const deleteMetric = async (entry: MetricEntry, mode: 'delete' | 'reset') => {
    try {
      await remove.mutateAsync(entry.name)
      toast.success(mode === 'reset' ? `${entry.label} is back to Souvenir’s definition` : `${entry.label} deleted`)
    } catch (error) {
      throw new Error(metricErrorMessage(error, mode))
    }
  }

  return { save, confirm, deleteMetric, saving: put.isPending, deleting: remove.isPending, confirming: put.isPending ? put.variables?.name : undefined }
}
