import { OnboardingProvider } from "@/context/onboarding-context";
import { WorkspaceOnboardingProvider } from "@/context/workspace-onboarding-context";
import { OfflineFrame } from "@/components/SyncStatus/OfflineBar";

// Both providers are mounted here: OnboardingProvider backs the previous
// team-onboarding flow (still reachable at its existing routes until those are
// cut over/removed); WorkspaceOnboardingProvider backs the new v1.5 flow
// (docs-v1.5/onboarding-v1.5-flow.md). Each page only reads the one it needs.
export default function OnboardingGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      {/* Offline: the bar across the top of the window, as on every signed-in page. */}
      <WorkspaceOnboardingProvider><OfflineFrame scroll="document">{children}</OfflineFrame></WorkspaceOnboardingProvider>
    </OnboardingProvider>
  );
}
