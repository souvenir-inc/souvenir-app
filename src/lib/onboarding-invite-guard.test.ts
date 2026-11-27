import { describe, expect, it } from "vitest";
import { inviteRedirect } from "./onboarding-invite-guard";

const JOIN = "/onboarding/team/b8a1d437-4c1a-4d49-824b-bc4ce38509bd";

// souvenir-server#641: an invitee who reaches the workspace step creates an org of their own and loses the invite.
describe("inviteRedirect", () => {
  it("sends an invitee from any other onboarding step to the Join screen", () => {
    for (const path of ["/onboarding/workspace", "/onboarding/setup", "/onboarding/profile", "/onboarding/invite", "/onboarding"]) {
      expect(inviteRedirect(path, JOIN, false)).toBe(JOIN);
    }
  });

  it("leaves the invite flow itself open, including a different invite's pages", () => {
    expect(inviteRedirect(JOIN, JOIN, false)).toBeNull();
    expect(inviteRedirect(`${JOIN}/profile`, JOIN, false)).toBeNull();
    expect(inviteRedirect("/onboarding/team/other-invite", JOIN, false)).toBeNull();
  });

  it("does nothing without a pending invite or once onboarded", () => {
    expect(inviteRedirect("/onboarding/workspace", "/onboarding/setup", false)).toBeNull();
    expect(inviteRedirect("/onboarding/workspace", JOIN, true)).toBeNull();
  });

  it("doesn't treat a look-alike path as the invite flow", () => {
    expect(inviteRedirect("/onboarding/teams-tour", JOIN, false)).toBe(JOIN);
  });
});
