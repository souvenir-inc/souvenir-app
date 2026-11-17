import { GeneralPageSkeleton } from './_components/GeneralSkeleton'

// The same skeleton the page shows while its data loads, in the same scroll frame.
export default function GeneralLoading() {
  return (
    <div className="kaya-scrollbar" style={{ flex: '1 0 0', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 'var(--space-10)', paddingBottom: 'var(--space-9)' }}>
      <GeneralPageSkeleton />
    </div>
  )
}
