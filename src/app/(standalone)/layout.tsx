import { OrgProvider } from '@/context/org-context'
import { OnboardingGuard } from '@/components/shared/OnboardingGuard'
import { OfflineFrame } from '@/components/SyncStatus/OfflineBar'

export default function StandaloneLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingGuard>
      <OrgProvider>
        {/* Offline: the bar across the top of the window, as on every signed-in page. */}
        <OfflineFrame scroll="document">{children}</OfflineFrame>
      </OrgProvider>
    </OnboardingGuard>
  )
}
