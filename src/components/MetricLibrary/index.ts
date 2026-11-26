// The metric library: /dashboard/metrics (every metric) and /dashboard/metrics/[name] (one metric, how it's calculated).
export { MetricLibraryScreen } from './MetricLibraryScreen'
export { MetricPageScreen } from './MetricPageScreen'
/** Settings → Metrics: the organization's metric definitions. */
export { MetricDefinitionsScreen } from './MetricDefinitionsScreen'
/** "How it's calculated" for one metric, self-contained: `<MetricCalculation name="mer" window={week} />`. */
export { MetricCalculation, type MetricCalculationProps } from './MetricCalculation'
export { CalculationTree, type CalculationTreeProps } from './CalculationTree'
export { CreateMetricDialog, type CreateMetricDialogProps } from './CreateMetricDialog'
