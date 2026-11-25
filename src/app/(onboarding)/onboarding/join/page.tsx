"use client";

import { Suspense, useEffect, useState } from "react";
import { deriveInitials } from "@/components/Avatar";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useWorkspaceOnboarding } from "@/context/workspace-onboarding-context";
import { getTeamInviteOnboarding, acceptTeamInvite } from "@/lib/api/teams";
import type { InvitedMember, TeamInviteOnboarding } from "@/types/teams";
import { StepCanvas, StepHeader } from "../_components/step-shell";
import { ONBOARDING_PROFILE_ROUTE } from "@/lib/routes";

// ── A2 screen 1 — "Join a workspace" ─────────────────────────────────────────
// Figma: node 66:4387. The Figma export for this node has its text outlined to
// vector paths (no live `<text>` content), so exact copy came from the
// requester directly rather than from Figma: header "Join a Workspace", a
// workspace card showing "{Inviter Name}'s Workspace" / "{x} members" with a
// 3-avatar stack + a "Join" button, and a Back button — no separate page-level
// "Next" (the card's Join button is the primary action). Structural facts
// (dot state, card size/border colour, button shape) ARE confirmed from the
// raw SVG the requester sent: a 3-segment dot indicator with the *middle*
// segment active (unlike A1's workspace/profile screens, which show the
// first), and a 402x101 white card with a blue (#0D6EB2) border.
//
// PENDING CONFIRMATION (not guessed silently): there is no existing backend
// contract for "the workspace this email's domain matches" — the closest real
// contract is the team-invite flow's GET /team-invite/{id}, which happens to
// return exactly the fields this screen needs (organizationName,
// organizationMemberCount, organizationMembers, invitedByName). This page
// assumes an `inviteId` search param is present on arrival (e.g. the backend
// resolves a pending invite for the signed-up email and redirects here with
// it) and reuses that contract. If A2 is actually meant to work off email
// domain matching with no invite record at all, this needs a real endpoint
// and this assumption should be revisited.

function AvatarStack({ members, count }: { members: InvitedMember[]; count: number }) {
  const shown = members.slice(0, 3);
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {shown.map((m, i) => {
          const initials = m.initials || deriveInitials(m.name || m.email || "?");
          return (
            <span
              key={m.userId || m.email || i}
              style={{
                marginLeft: i === 0 ? 0 : -8,
                width: 24,
                height: 24,
                borderRadius: "50%",
                flexShrink: 0,
                boxShadow: "0 0 0 2px var(--static-white)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                backgroundColor: "var(--neutral-400)",
              }}
            >
              {m.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- external member avatar, arbitrary host
                <img src={m.image} alt={m.name || m.email} width={24} height={24} style={{ objectFit: "cover", display: "block" }} />
              ) : (
                <span style={{ fontFamily: "var(--font-body)", fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-caption)', color: "var(--static-white)", lineHeight: 'var(--leading-none)' }}>
                  {initials.slice(0, 2)}
                </span>
              )}
            </span>
          );
        })}
      </div>
      {count > shown.length && (
        <span
          style={{
            marginLeft: 'calc(var(--space-2) * -1)',
            minWidth: 24,
            height: 24,
            padding: "0 var(--space-1)",
            borderRadius: 'var(--radius-full)',
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--neutral-100)",
            boxShadow: "0 0 0 2px var(--static-white)",
            fontFamily: "var(--font-body)",
            fontWeight: 'var(--font-weight-medium)',
            fontSize: 'var(--font-size-caption)',
            color: "var(--neutral-700)",
          }}
        >
          +{count - shown.length}
        </span>
      )}
    </div>
  );
}

function WorkspaceCard({
  invite,
  joining,
  onJoin,
}: {
  invite: TeamInviteOnboarding;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 'var(--space-4)',
        width: "100%",
        minHeight: 101,
        padding: "var(--space-4) var(--space-5)",
        borderRadius: 'var(--onboarding-join-card-radius)',
        backgroundColor: "var(--neutral-white)",
        boxSizing: "border-box",
        boxShadow: "0px 0px 0px 1px var(--blue-600)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 'var(--space-2)', minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-body)",
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--font-size-body)',
            lineHeight: "var(--line-height-body-sm)",
            color: "var(--neutral-900)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {invite.organizationName || `${invite.invitedByName || "Their"}'s Workspace`}
        </p>
        <p style={{ margin: 0, fontFamily: "var(--font-body)", fontWeight: 'var(--font-weight-regular)', fontSize: 'var(--font-size-body-sm)', lineHeight: "var(--line-height-small)", color: "var(--neutral-500)" }}>
          {invite.organizationMemberCount} member{invite.organizationMemberCount === 1 ? "" : "s"}
        </p>
        <AvatarStack members={invite.organizationMembers} count={invite.organizationMemberCount} />
      </div>
      <Button size="sm" loading={joining} onClick={onJoin} style={{ flexShrink: 0 }}>
        Join
      </Button>
    </div>
  );
}

function OnboardingJoinContent() {
  const { push } = useRouter();
  const { logout } = useAuth();
  const { setEntryFlow } = useWorkspaceOnboarding();
  const params = useSearchParams();
  const inviteId = params.get("inviteId");

  const [invite, setInvite] = useState<TeamInviteOnboarding | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!inviteId) { setLoadError(true); return; }
    let cancelled = false;
    getTeamInviteOnboarding(inviteId)
      .then((data) => { if (!cancelled) setInvite(data); })
      .catch((err) => {
        console.error("Failed to load workspace invite", err);
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, [inviteId]);

  const handleJoin = async () => {
    if (!inviteId || joining) return;
    setJoining(true);
    try {
      await acceptTeamInvite(inviteId);
      setEntryFlow("join");
      push(ONBOARDING_PROFILE_ROUTE);
    } catch (err) {
      console.error("Failed to join workspace", err);
      toast.error("Couldn't join the workspace — please try again.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <StepCanvas>
      <StepHeader total={3} activeIndex={1} title="Join a Workspace" />

      <div style={{ width: "100%", padding: "var(--space-6) 0 0" }}>
        {invite ? (
          <WorkspaceCard invite={invite} joining={joining} onJoin={() => void handleJoin()} />
        ) : loadError ? (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 'var(--font-size-body)', color: "var(--neutral-500)", margin: 0 }}>
            We couldn&apos;t find a workspace to join. Ask your teammate to resend the invite.
          </p>
        ) : (
          <p style={{ fontFamily: "var(--font-body)", fontSize: 'var(--font-size-body)', color: "var(--neutral-500)", margin: 0 }}>
            Looking up your workspace…
          </p>
        )}
      </div>

      <div style={{ display: "flex", width: "100%" }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void logout()}
          leftIcon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
        >
          Back
        </Button>
      </div>
    </StepCanvas>
  );
}

export default function OnboardingJoinPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingJoinContent />
    </Suspense>
  );
}
