// The scorecard, as Dev defined it: a metric's health against its target, for the period the dashboard header shows.
// The metrics page (MetricLibrary) drops these in; targets are saved on this device until the back end has them.
export { HealthBadges, HealthNote, HealthPill, HealthSummary, TargetField, useMetricHealth, type MetricHealthExtras, type TargetFieldProps } from './Health'
export { TargetEditor, type TargetEditorProps } from './TargetEditor'
export { HealthPanel, TargetSettingsButton, TargetSettingsDialog, type HealthPanelProps } from './HealthPanel'
export { MetricModal, type MetricModalProps, type MetricModalTab } from './MetricModal'
export { BenchmarkPanel, type BenchmarkPanelProps } from './BenchmarkPanel'
export { FlagPill, StatusPill, useBenchmarkFlag, useMetricFlags, flagTitle, type FlagPillProps, type StatusPillProps } from './Flag'
