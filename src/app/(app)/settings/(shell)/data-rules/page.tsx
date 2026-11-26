import { DataRulesScreen } from '@/components/MetricLibrary/DataRulesScreen'

export const metadata = { title: 'Data rules' }

// Settings → Data → Data rules: which orders count before any metric uses them. Every member reads them.
export default function SettingsDataRulesPage() {
  return <DataRulesScreen />
}
