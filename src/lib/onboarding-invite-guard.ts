import { ONBOARDING_TEAM_BASE_ROUTE } from "@/lib/routes";

/**
 * Where an invitee must go instead of the onboarding page they asked for, or null to let it through.
 *
 * Someone who hasn't finished onboarding and has an invite waiting is sent to its Join screen
 * (`nextPath` is `/onboarding/team/<inviteId>`, see onboarding-next-step.ts). The proxy used to let
 * every onboarding page through, so an invitee who opened `/onboarding/workspace` or `/onboarding/setup`
 * directly (a bookmark, Back, a shared link) could create an organization of their own and lose the
 * invite for good (souvenir-server#641). Pages inside the invite flow itself stay open.
 */
export function inviteRedirect(pathname: string, nextPath: string, hasOnboarded: boolean): string | null {
  if (hasOnboarded) return null;
  if (!isInviteFlow(nextPath)) return null;
  if (isInviteFlow(pathname)) return null;
  return nextPath;
}

const isInviteFlow = (path: string) =>
  path === ONBOARDING_TEAM_BASE_ROUTE || path.startsWith(`${ONBOARDING_TEAM_BASE_ROUTE}/`);
