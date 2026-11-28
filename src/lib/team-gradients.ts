// Gradient palette seeded by team name — used anywhere a team's avatar is
// rendered (ProjectCard, TeamChip, TeamSwitcher*, InviteModal, settings
// members/teams pages, etc.) so a given team is the same colour everywhere
// it appears in the app. Deterministic: same seed always maps to the same
// gradient, with no backend field required.

export const TEAM_GRADIENTS = [
  'linear-gradient(135deg, var(--team-gradients) 0%, var(--team-gradients-2) 100%)',  // teal-blue
  'linear-gradient(135deg, var(--team-gradients-3) 0%, var(--team-gradients-4) 100%)',  // purple
  'linear-gradient(135deg, var(--team-gradients-5) 0%, var(--team-gradients-6) 100%)',  // orange
  'linear-gradient(135deg, var(--team-gradients-7) 0%, var(--team-gradients-8) 100%)',  // green
  'linear-gradient(135deg, var(--team-gradients-9) 0%, var(--team-gradients-10) 100%)',  // red-brown
  'linear-gradient(135deg, var(--team-gradients-11) 0%, var(--team-gradients-12) 100%)',  // blue
]

export function getGradient(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h) + seed.charCodeAt(i)
    h |= 0
  }
  return TEAM_GRADIENTS[Math.abs(h) % TEAM_GRADIENTS.length]!
}
