// Phase 6 areas: which folders and files make up each feature, and the screenshot screens that cover it.
// Used to run scripts/codemods/tokens-exact.mjs feature by feature:
//
//   node scripts/codemods/areas.mjs <area|all> [--snap] [--dry]
//   node scripts/codemods/areas.mjs --list
//
// The codemod's own SKIP list (primitives, hidden features, art, hidden previews, old Sidebar) applies.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const C = "src/components/";
const A = "src/app/(app)/";

export const AREAS = {
  settings: {
    paths: [`${A}settings`, `${C}SettingsPageShell`, `${C}SettingsTable`, `${C}Library/settings`, `${C}MemorySection`, `${C}AiModelsView`, `${C}layout/SettingsSidebar.tsx`],
    screens: ["settings-account", "settings-memory", "settings-ai", "settings-usage", "settings-plans-billing", "settings-report-bug", "settings-feature-request", "settings-general", "settings-members", "settings-analytics", "settings-workspace-library"],
  },
  onboarding: { paths: ["src/app/(onboarding)", `${C}onboarding`], screens: [] },
  "change-plan": { paths: ["src/app/(standalone)", `${C}billing`, `${C}PlanGate`, `${C}ContactSalesModal`, `${C}RequestDemoModal`], screens: ["org-change-plan"] },
  slack: { paths: [`${A}souvenir-slack`, `${A}slack`, `${C}SlackConnectModal`, `${C}SlackChannelMappingRow`, `${C}FlatSidebarSlackConnector`], screens: ["souvenir-slack"] },
  shell: {
    paths: [`${C}layout`, `${C}FlatSidebar`, `${C}FlatSidebarRow`, `${C}FlatSidebarProjectGroup`, `${C}FlatSidebarProfileRow`, `${C}SidebarInset`, `${C}TeamSwitcher`, `${C}TeamSwitcherDropdown`, `${C}TeamSwitcherRow`, `${C}AccountMenu`, `${C}NotificationBell`, `${C}NotificationPanel`, `${C}GlobalSearchModal`, `${C}ThemeModeSwitcher`, `${C}PageBackButton`, `${C}RouteState`, `${C}RouteError`, `${C}ErrorBoundary`, `${A}layout.tsx`, `${A}error.tsx`, "src/app/global-error.tsx", "src/app/sign-in-error", "src/app/globals.css"],
    screens: ["chat-home", "library", "projects"],
  },
  chat: {
    paths: [`${C}chat`, `${C}ChatInput`, `${C}MessageBubble`, `${C}ApprovalCard`, `${C}QuestionCard`, `${C}StreamingIndicator`, `${C}SourceCitation`, `${C}ContextPanel`, `${C}ContextIndicator`, `${C}ChatRow`, `${C}ChatSelectionBar`, `${C}ChatThumbnail`, `${C}StarterSuggestions`, `${C}BrowserPanel`, `${C}DiffLine`, `${C}Enhance*`, `${C}ExhaustionBanner`, `${C}InlineCreditNotice`, `${C}EnhancePromptField`, `${C}ModelFeaturedCard`, `${C}PresetModelSelector`, `${A}chat`, `${A}chats`, `${A}chat-shares`, `${A}share`, `${A}compare`, `${A}template`],
    screens: ["chat-home"],
  },
  agents: {
    paths: [`${A}agents`, `${C}AgentEditor`, `${C}AgentsPanel`, `${C}AgentShareModal`, `${C}ShareAgentPanel`, `${C}SuperLink`, `${C}SuperLinkDrawer`, `${C}SuperLinkRow`, `${C}SuperLinksEmpty`, `${C}PersonaCard`, `${C}ChangeAgentModelModal`, `${C}FixAgentModelsModal`, `${C}ModelSelectItem`, `${C}TokenBudgetBar`, "src/templates"],
    screens: ["agents", "agents-new"],
  },
  library: { paths: [`${C}Library`, `${A}library`, `${C}DocumentCard`, `${C}VersionCard`, `${C}SaveVersionModal`], screens: ["library"] },
  projects: {
    paths: [`${A}project`, `${A}projects`, `${C}Projects`, `${C}ProjectCard`, `${C}ProjectChatRow`, `${C}ProjectDocumentCard`, `${C}ProjectFilesPanel`, `${C}ProjectInstructionsPanel`, `${C}ProjectListRow`, `${C}ProjectMembersPanel`, `${C}ProjectShareModal`, `${C}ProjectTrashModal`, `${C}ProjectViewToggle`, `${C}ProjectAddMembersList`, `${C}ProjectChatListSkeleton`, `${C}EditProjectModal`, `${C}MoveToProjectModal`, `${C}DeleteProjectModal`, `${C}LeaveProjectModal`],
    screens: ["projects", "projects-new"],
  },
  schedules: { paths: [`${A}schedules`, `${C}Schedules`, `${C}TimeField`], screens: ["schedules"] },
  connectors: { paths: [`${A}connectors`, `${C}connectors`, `${C}ConnectorBrowse`, `${C}ConnectorCatalogCard`, `${C}ConnectorPausedBadge`, `${C}ConnectorRequestRow`, `${C}ConnectorStatusBadge`, `${C}WorkspaceConnectorCard`], screens: ["connectors"] },
  // Everything else: shared components and remaining routes.
  rest: { paths: ["src/components", "src/app"], screens: [] },
};

function expand(p) {
  if (!p.includes("*")) return fs.existsSync(path.join(ROOT, p)) ? [p] : [];
  const dir = path.dirname(p), re = new RegExp("^" + path.basename(p).replace("*", ".*") + "$");
  return fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).map((f) => `${dir}/${f}`);
}

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const [name, a] of Object.entries(AREAS)) console.log(`${name.padEnd(12)} screens: ${a.screens.join(",") || "—"}`);
  process.exit(0);
}
const flags = args.filter((a) => a.startsWith("--"));
const wanted = args.find((a) => !a.startsWith("--"));
const names = wanted === "all" ? Object.keys(AREAS) : [wanted];
for (const name of names) {
  const area = AREAS[name];
  if (!area) { console.error(`Unknown area: ${name}`); process.exit(1); }
  const paths = area.paths.flatMap(expand);
  const out = execFileSync("node", [path.join(import.meta.dirname, "tokens-exact.mjs"), ...paths, ...flags], { cwd: ROOT, encoding: "utf8" });
  console.log(`${name.padEnd(12)} ${out.trim().split("\n").pop()}`);
}
