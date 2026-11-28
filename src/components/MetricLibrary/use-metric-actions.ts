'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { MetricDefinition, MetricEntry } from '@/lib/api/warehouse'
import { metricErrorMessage } from '@/lib/metrics/errors'
import { deleteMetricOptions, proposeOptions, putMetricOptions, setStatusOptions } from '@/lib/metrics/metric-mutations'
import type { Library } from './use-library'

/**
 * The library's changes, each one mutation with one message on failure (API-ER-11, 16): the toast is shown here,
 * never also in the mutation. `save` resolves to whether it worked, so a dialog stays open on failure.
 */
export function useMetricActions(library: Library) {
  const qc = useQueryClient()
  const put = useMutation(putMetricOptions(qc, library.org, library.warehouse))
  const propose = useMutation(proposeOptions(qc, library.org, library.warehouse))
  const status = useMutation(setStatusOptions(qc, library.org, library.warehouse))
  const remove = useMutation(deleteMetricOptions(qc, library.org, library.warehouse))

  /**
   * An admin's save is the metric's next version, sent with the version last read so a save in between is refused;
   * a member's is a proposal (a change when the metric exists, else a new one) for an admin to confirm.
   */
  const save = async (metric: MetricDefinition, done: string): Promise<boolean> => {
    const current = library.byName.get(metric.name)
    try {
      if (library.admin) {
        await put.mutateAsync({ ...metric, version: current ? current.version : null })
        toast.success(done)
      } else {
        await propose.mutateAsync({ kind: current ? 'change' : 'new', metric, baseVersion: current ? current.version : null })
        toast.success(`${metric.label} sent to an admin to confirm`)
      }
      return true
    } catch (error) {
      toast.error(metricErrorMessage(error, 'save'))
      return false
    }
  }

  /** Admins confirm a proposed metric as it is. */
  const confirm = (entry: MetricEntry) => {
    status.mutate({ names: [entry.name], status: 'confirmed' }, {
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

  return {
    save, confirm, deleteMetric,
    saving: put.isPending || propose.isPending,
    deleting: remove.isPending,
    confirming: status.isPending ? status.variables?.names[0] : undefined,
  }
}
