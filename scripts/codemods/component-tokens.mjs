// One-off migration (2026-11-25): the last literal style values onto tokens.
//
// Approved by the user: a letter-spacing scale (values snap to it), --font-weight-bold, and swaps to
// tokens that change in dark mode. Every other value keeps its exact pixels: it gets a token named for
// what it styles — a shared step when several components use it (--space-px, --radius-3xl), else a
// component token in semantic.css — so nothing moves. Kept as a record of what was mapped where.
//
//   node scripts/codemods/component-tokens.mjs [--dry]

import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..", "..")
const DRY = process.argv.includes("--dry")
const at = (p) => path.join(ROOT, p)

// ── New shared steps (scale files) ─────────────────────────────────────────────
const SCALE_TOKENS = {
  "src/styles/tokens/typography.css": {
    anchor: "  --font-weight-semibold: 600;",
    lines: [
      "  --font-weight-bold:     700;",
      "",
      "  /* Letter-spacing (approved 2026-11-25). em, so it scales with the text it spaces. */",
      "  --tracking-display:   -0.045em; /* large display numerals */",
      "  --tracking-tight:     -0.01em;",
      "  --tracking-normal:    0;",
      "  --tracking-wide:      0.02em;",
      "  --tracking-wider:     0.04em;",
      "  --tracking-caps:      0.06em;   /* small uppercase labels */",
      "  --tracking-caps-wide: 0.08em;",
      "",
      "  /* Half step between small (12) and body-sm (13): chips and compact labels. */",
      "  --font-size-label:    12.5px;",
    ],
  },
  "src/styles/tokens/scales.css": {
    anchor: "  --radius-full: 9999px;",
    lines: [
      "  --radius-hairline: 1px;  /* caret and cursor bars */",
      "  --radius-3xl:      28px;",
      "  --radius-4xl:      32px;",
      "  --space-px:        1px;  /* hairline overlaps, visually-hidden elements */",
    ],
  },
}

// ── Component tokens (semantic.css), exact current values ─────────────────────
// [token, value, comment]
const COMPONENT_TOKENS = [
  ["Chat answer prose (never snapped: plan, Appendix B)"],
  ["--prose-table-cell-padding", "10px 14px"],
  ["--prose-code-padding", "1px 5px"],
  ["--prose-list-indent", "22px"],
  ["--prose-list-gap", "5px"],
  ["--raw-output-padding", "10px 14px", "the 'Show raw output' block under a tool result"],
  ["--latex-inline-size", "0.875em"],
  ["Chat widgets"],
  ["--widget-border", "1px solid rgba(82, 75, 71, 0.12)"],
  ["--widget-code-bg", "#1E1A17"],
  ["--chart-tooltip-bg", "#26211E", "dark in both themes, unlike --neutral-900"],
  ["--chart-label-line-height", "15px"],
  ["--chart-tick-line-height", "14px"],
  ["--chat-widget-title-size", "13.5px"],
  ["--funnel-card-shadow", "0 10px 28px rgba(82, 75, 71, 0.09), 0 2px 4px rgba(82, 75, 71, 0.07)"],
  ["--map-bar-track", "rgba(82, 75, 71, 0.09)"],
  ["--map-chip-shadow", "0 2px 8px rgba(82, 75, 71, 0.08)"],
  ["--map-control-shadow", "0 1px 4px rgba(38, 33, 30, 0.18)"],
  ["--map-popup-shadow", "0 6px 20px rgba(38, 33, 30, 0.16)"],
  ["--weather-card-padding", "24px clamp(20px, 4vw, 30px)"],
  ["--weather-temp-size", "clamp(46px, 9vw, 68px)"],
  ["--weather-temp-line-height", "0.9"],
  ["--weather-unit-size", "0.42em"],
  ["--weather-chip-border", "1px solid rgba(255, 255, 255, 0.72)"],
  ["--activity-row-detail-indent", "44px"],
  ["Chat home and composer"],
  ["--chat-home-padding", "32px clamp(20px, 5vw, 64px)"],
  ["--chat-home-app-stack-overlap", "-5px"],
  ["--chat-home-context-bar-bg-dark", "#202020"],
  ["--chat-home-context-action-hover-dark", "rgba(255, 255, 255, 0.12)"],
  ["--dark-surface-border", "rgba(255, 255, 255, 0.14)", "a hairline on dark surfaces"],
  ["--model-menu-scroll-bleed", "-5px"],
  ["--effort-thumb-shadow", "0 1px 2px rgba(0, 0, 0, 0.12)"],
  ["--chip-tooltip-bg", "color-mix(in srgb, currentColor 12%, transparent)"],
  ["--chip-tooltip-underline", "inset 0 -1px 0 color-mix(in srgb, currentColor 22%, transparent)"],
  ["--enhance-field-gap", "25px"],
  ["--exhaustion-banner-padding", "4px 4% 8px"],
  ["--citation-divider-bleed", "0 -14px"],
  ["Agents"],
  ["--agents-page-gap", "41px"],
  ["--agents-new-gap", "35px"],
  ["--agents-empty-padding", "80px 24px"],
  ["--agent-published-gap", "76px"],
  ["--agent-template-card-padding", "16px 17px"],
  ["--agent-template-card-radius", "15px"],
  ["--agent-card-chip-bg", "rgba(255, 255, 255, 0.6)"],
  ["--agent-card-chip-bg-dark", "rgba(10, 10, 10, 0.32)"],
  ["--agent-card-chip-bg-solid", "rgba(255, 255, 255, 0.92)", "reduced transparency"],
  ["--agent-card-chip-bg-solid-dark", "rgba(10, 10, 10, 0.5)"],
  ["--agent-card-chip-border", "1px solid rgba(0, 0, 0, 0.06)"],
  ["--agent-hero-inner-ring", "inset 0 0 0 1px rgba(0, 0, 0, 0.05)"],
  ["--agent-hero-vignette-shadow", "inset 0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 -24px 32px -24px rgba(0, 0, 0, 0.45)"],
  ["--agent-hero-vignette", "radial-gradient(ellipse 70% 80% at 50% 52%, transparent 45%, rgba(0, 0, 0, 0.38) 100%)"],
  ["--agent-orb-dots", "radial-gradient(circle, rgba(0, 0, 0, 0.05) 0.6px, transparent 0.9px) 0 0 / 4px 4px"],
  ["--agent-orb-glint", "linear-gradient(transparent, rgba(255, 255, 255, 0.12), transparent)"],
  ["--agent-cta-sheen", "linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%) -150% 0 / 250% 100% no-repeat"],
  ["--agent-zzz-color", "rgba(255, 255, 255, 0.75)"],
  ["--agent-zzz-size-md", "8px"],
  ["--agent-zzz-size-sm", "6px"],
  ["Buttons"],
  ["--button-shine", "linear-gradient(100deg, transparent 40%, rgba(255, 255, 255, 0.5) 50%, transparent 60%) no-repeat"],
  ["--button-shiny", "linear-gradient(120deg, transparent 40%, rgba(255, 255, 255, 0.45) 50%, transparent 60%)"],
  ["--danger-chip-ring", "0px 0px 0px 1px rgba(238, 48, 48, 0.22)"],
  ["Sidebar, menus and shell"],
  ["--sidebar-header-top", "17px"],
  ["--sidebar-project-row-padding-y", "5px"],
  ["--sidebar-menu-shadow", "0 4px 16px rgba(0, 0, 0, 0.10), 0 1px 4px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.04)"],
  ["--team-switcher-avatar-shadow", "0px 1px 1.5px 0px rgba(82, 75, 71, 0.12), 0px 0px 0px 1px rgba(212, 212, 212, 0.4)"],
  ["--settings-drawer-shadow", "4px 0 24px rgba(0, 0, 0, 0.16)"],
  ["--drawer-scrim", "rgba(0, 0, 0, 0.32)"],
  ["--dialog-header-close-inset", "56px", "room for the close button"],
  ["--folder-icon-tab-dark", "#2B2B2B"],
  ["--selection-popover-radius", "8.73px"],
  ["--notification-row-padding", "8px 26px 8px 8px"],
  ["--memory-item-detail-padding", "4px 24px 18px 44px"],
  ["--account-row-actions-inset", "112px"],
  ["Pages"],
  ["--page-top-inset", "80px", "new-agent and new-project pages"],
  ["--projects-page-top", "35px"],
  ["--project-form-field-shadow", "0px 1px 1.5px 0px rgba(82, 75, 71, 0.12)"],
  ["--members-toolbar-padding", "12px 23px 0 24px"],
  ["--avatar-upload-scrim", "rgba(38, 33, 30, 0.55)"],
  ["--help-tile-hover-shadow", "0 6px 18px rgba(0, 0, 0, 0.06)"],
  ["--share-accept-note-ring", "0px 0px 0px 1px rgba(13, 110, 178, 0.15)"],
  ["--chat-share-answer-inset", "10%"],
  ["--compare-lab-top", "8vh"],
  ["--super-link-gap", "31px"],
  ["--welcome-title-size", "34px"],
  ["--welcome-wordmark-gap", "11.5px"],
  ["--welcome-cta-shadow", "0px 0px 0px 1px black, 0px 1px 1px rgba(59, 54, 50, 0.1), 0px 1.5px 3px rgba(59, 54, 50, 0.4)"],
  ["--context-overview-cta-shadow", "0 6px 18px -6px rgba(38, 33, 30, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)"],
  ["Onboarding"],
  ["--onboarding-plans-section-gap", "78px"],
  ["--onboarding-plans-pair-gap", "92px"],
  ["--onboarding-plans-compact-gap", "53px"],
  ["--onboarding-plans-card-shadow", "0px 1.091px 1.091px rgba(59, 54, 50, 0.05), 0px 1.455px 3.127px rgba(38, 33, 30, 0.15)"],
  ["--onboarding-join-card-radius", "11.5px"],
  ["Library"],
  ["--library-empty-padding", "24px 24px 10vh"],
  ["--library-empty-art-overlap", "-36px"],
  ["--library-header-padding", "28px clamp(8px, 4vw, 40px) 13px"],
  ["--library-suggested-padding", "15px 40px 120px"],
  ["--library-card-skeleton-padding", "15px 17px 13px"],
  ["--file-screen-padding", "64px 32px 120px"],
  ["--file-screen-page-padding", "56px 64px"],
  ["--file-screen-page-shadow", "0 0 0 1px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.04)"],
  ["--file-screen-slide-margin", "0 16px 96px"],
  ["--file-screen-radius", "19px"],
  ["--file-row-hover-bg", "rgba(0, 0, 0, 0.03)"],
  ["--picker-tools-scrolled-shadow", "0 6px 12px -10px rgba(0, 0, 0, 0.28)"],
  ["--picker-card-hover-shadow", "0 6px 16px -10px rgba(0, 0, 0, 0.25)"],
  ["Slack config"],
  ["--slack-config-search-padding", "0 10px 0 31px"],
  ["--slack-config-content-padding", "30px 34px 38px"],
  ["--slack-config-card-padding", "17px 20px 16px"],
  ["--slack-config-empty-padding", "56px 32px 48px"],
  ["--slack-config-focus-ring", "0 0 0 3px rgba(114, 105, 98, 0.08)"],
  ["--slack-config-card-shadow", "0 1px 2px rgba(82, 75, 71, .03)"],
  ["--slack-config-panel-shadow", "0 1px 2px rgba(82, 75, 71, 0.04)"],
  ["--slack-config-empty-icon-shadow", "0 2px 6px -2px rgba(82, 75, 71, 0.18)"],
  ["--slack-config-heading-size", "21px"],
  ["--slack-config-weight-light", "450"],
  ["--slack-config-weight-strong", "550"],
  ["--slack-config-weight-heavy", "650"],
  ["Dashboard (Figma values)"],
  ["--dashboard-toast-padding", "12px 14px"],
  ["--dashboard-toast-action-padding", "3px 10px"],
  ["--dashboard-toast-line-height", "18px"],
  ["--dashboard-scrollbar-radius", "2px"],
  ["Hidden settings previews (behind NEXT_PUBLIC_ENABLE_SETTINGS_PREVIEW)"],
  ["--settings-preview-ring", "0px 0px 0px 1px rgba(59, 54, 50, 0.3)"],
  ["--settings-preview-border", "0.727px solid rgba(59, 54, 50, 0.3)"],
  ["--settings-preview-gap-xs", "5px"],
  ["--settings-preview-gap-sm", "9px"],
  ["--settings-preview-gap-lg", "42px"],
  ["--settings-preview-chip-padding", "5px 8px"],
  ["--settings-preview-pill-padding", "7px 10px"],
  ["--settings-preview-radius-xs", "2px"],
  ["--settings-preview-radius-sm", "3px"],
  ["Question card"],
  ["--question-card-meta-line-height", "11px"],
]

// ── Where each value goes ─────────────────────────────────────────────────────
// [file (substring), prop, literal exactly as written, replacement token (or a var() expression)]
const T = (n) => `var(${n})`
const neg = (n) => `calc(var(${n}) * -1)`
const RULES = [
  // Letter-spacing (approved scale; values snap to it)
  ...[
    ['"0.4px"', "--tracking-wider"], ['"0.5px"', "--tracking-wider"], ['"0.6px"', "--tracking-wider"], ["0.4", "--tracking-wider"],
    ['"0.3px"', "--tracking-wide"], ['"0.34px"', "--tracking-wide"], ['"0.1px"', "--tracking-normal"], ['"0.07px"', "--tracking-normal"], ["'0.07px'", "--tracking-normal"],
    ["'0.02em'", "--tracking-wide"], ['"0.02em"', "--tracking-wide"], ["0.02em", "--tracking-wide"], ["'0.03em'", "--tracking-wide"],
    ["'0.04em'", "--tracking-wider"], [".04em", "--tracking-wider"], ["0.04em", "--tracking-wider"], ['"0.05em"', "--tracking-wider"],
    ["'0.06em'", "--tracking-caps"], ['"0.06em"', "--tracking-caps"], [".06em", "--tracking-caps"], ["0.06em", "--tracking-caps"], ["0.07em", "--tracking-caps"],
    ["'0.08em'", "--tracking-caps-wide"], ['"0.08em"', "--tracking-caps-wide"], ['"0.12em"', "--tracking-caps-wide"],
    ['"-0.01em"', "--tracking-tight"], ["-0.01em", "--tracking-tight"], ['"-0.045em"', "--tracking-display"], ["'0.01em'", "--tracking-normal"],
    ["'0.5px'", "--tracking-wider"],
  ].flatMap(([lit, tok]) => [["", "letterSpacing", lit, T(tok)], ["", "letter-spacing", lit, T(tok)]]),
  // Weights and sizes
  ["", "fontWeight", "700", T("--font-weight-bold")],
  ["globals.css", "font-weight", "700", T("--font-weight-bold")],
  ["", "font-size", "12.5px", T("--font-size-label")],
  ["ChatWidget.module.css", "font-size", "13.5px", T("--chat-widget-title-size")],
  ["slack-config.module.css", "font-size", "21px", T("--slack-config-heading-size")],
  ["slack-config.module.css", "font-weight", "450", T("--slack-config-weight-light")],
  ["slack-config.module.css", "font-weight", "550", T("--slack-config-weight-strong")],
  ["slack-config.module.css", "font-weight", "650", T("--slack-config-weight-heavy")],
  ["WelcomeModal", "fontSize", '"34px"', T("--welcome-title-size")],
  ["globals.css", "font-size", "8px", T("--agent-zzz-size-md")],
  ["globals.css", "font-size", "6px", T("--agent-zzz-size-sm")],
  ["LaTeXRenderer", "fontSize", '"0.875em"', T("--latex-inline-size")],
  ["XmlWeather", "fontSize", '"0.42em"', T("--weather-unit-size")],
  ["XmlWeather", "fontSize", '"clamp(46px, 9vw, 68px)"', T("--weather-temp-size")],
  ["XmlWeather", "lineHeight", "0.9", T("--weather-temp-line-height")],
  ["globals.css", "line-height", "18px", T("--dashboard-toast-line-height")],
  ["XmlChart", "lineHeight", '"15px"', T("--chart-label-line-height")],
  ["XmlChart", "lineHeight", '"14px"', T("--chart-tick-line-height")],
  ["browser-verify", "fontFamily", "'sans-serif'", T("--font-body")],
  // Spacing
  ["content-renderer", "padding", '"10px 14px"', T("--raw-output-padding")],
  ["line-renderer", "padding", '"10px 14px"', T("--prose-table-cell-padding")],
  ["markdown-utils", "padding", '"10px 14px"', T("--prose-table-cell-padding")],
  ["", "padding", '"1px 5px"', T("--prose-code-padding")],
  ["line-renderer", "gap", '"5px"', T("--prose-list-gap")],
  ["line-renderer", "paddingLeft", '"22px"', T("--prose-list-indent")],
  ["onboarding/plans", "gap", "78", T("--onboarding-plans-section-gap")],
  ["onboarding/plans", "gap", "92", T("--onboarding-plans-pair-gap")],
  ["onboarding/plans", "gap", "53", T("--onboarding-plans-compact-gap")],
  ["", "margin", "-1", neg("--space-px")],
  ["agents/", "gap", "41", T("--agents-page-gap")],
  ["", "paddingTop", "80", T("--page-top-inset")],
  ["agents/new", "gap", "35", T("--agents-new-gap")],
  ["agents/published", "gap", "76", T("--agent-published-gap")],
  ["agents/templates", "padding", "'16px 17px'", T("--agent-template-card-padding")],
  ["AgentsGrid", "padding", "'80px 24px'", T("--agents-empty-padding")],
  ["chat-shares", "paddingRight", "'10%'", T("--chat-share-answer-inset")],
  ["CompareLab", "paddingTop", '"8vh"', T("--compare-lab-top")],
  ["projects/page", "paddingTop", "35", T("--projects-page-top")],
  ["MembersSkeleton", "padding", "'12px 23px 0 24px'", T("--members-toolbar-padding")],
  ["slack-config.module.css", "padding", "0 10px 0 31px", T("--slack-config-search-padding")],
  ["slack-config.module.css", "padding", "30px 34px 38px", T("--slack-config-content-padding")],
  ["slack-config.module.css", "padding", "17px 20px 16px", T("--slack-config-card-padding")],
  ["slack-config.module.css", "padding", "56px 32px 48px", T("--slack-config-empty-padding")],
  ["globals.css", "padding", "12px 14px", T("--dashboard-toast-padding")],
  ["globals.css", "padding", "3px 10px", T("--dashboard-toast-action-padding")],
  ["AccountRow", "padding-right", "112px", T("--account-row-actions-inset")],
  ["ActivityRow", "paddingLeft", "44", T("--activity-row-detail-indent")],
  ["ChatHome.module.css", "padding", "32px clamp(20px, 5vw, 64px)", T("--chat-home-padding")],
  ["ChatHome.module.css", "margin", "-1px auto 0", `${neg("--space-px")} auto 0`],
  ["ChatHome.module.css", "margin-left", "-5px", T("--chat-home-app-stack-overlap")],
  ["ModelMenu", "marginRight", "'-5px'", T("--model-menu-scroll-bleed")],
  ["XmlWeather", "padding", '"24px clamp(20px, 4vw, 30px)"', T("--weather-card-padding")],
  ["EnhancePromptField/index", "gap", "25", T("--enhance-field-gap")],
  ["ExhaustionBanner", "padding", "'4px 4% 8px'", T("--exhaustion-banner-padding")],
  ["Library/EmptyState", "padding", "'24px 24px 10vh'", T("--library-empty-padding")],
  ["NoFilesYet.module.css", "padding", "24px 24px 10vh", T("--library-empty-padding")],
  ["NoFilesYet.module.css", "margin-left", "-36px", T("--library-empty-art-overlap")],
  ["FileScreen.module.css", "padding", "64px 32px 120px", T("--file-screen-padding")],
  ["FileScreen.module.css", "padding", "56px 64px", T("--file-screen-page-padding")],
  ["FileScreen.module.css", "margin", "0 16px 96px", T("--file-screen-slide-margin")],
  ["LibraryHeader", "padding", "'28px clamp(8px, 4vw, 40px) 13px'", T("--library-header-padding")],
  ["LibrarySkeletons.module.css", "padding", "15px 40px 120px", T("--library-suggested-padding")],
  ["SuggestedView", "padding", "'15px 40px 120px'", T("--library-suggested-padding")],
  ["LibrarySkeletons.module.css", "padding", "15px 17px 13px", T("--library-card-skeleton-padding")],
  ["MemorySection", "padding", "'4px 24px 18px 44px'", T("--memory-item-detail-padding")],
  ["NotificationPanel", "padding", "'8px 26px 8px 8px'", T("--notification-row-padding")],
  ["WelcomeModal", "gap", '"11.5px"', T("--welcome-wordmark-gap")],
  ["ProjectCardTagRow", "margin", "'10px -1px 0'", `var(--space-2-5) ${neg("--space-px")} 0`],
  ["Sidebar/index", "paddingTop", "'17px'", T("--sidebar-header-top")],
  ["SidebarProjectsSection", "paddingTop", "'5px'", T("--sidebar-project-row-padding-y")],
  ["SidebarProjectsSection", "paddingBottom", "'5px'", T("--sidebar-project-row-padding-y")],
  ["SourceCitation", "margin", "'0 -14px'", T("--citation-divider-bleed")],
  ["SuperLink", "gap", "31", T("--super-link-gap")],
  ["ui/dialog", "paddingRight", "56", T("--dialog-header-close-inset")],
  // Radius
  ["", "borderRadius", "1", T("--radius-hairline")],
  ["", "borderRadius", "28", T("--radius-3xl")],
  ["agents/published", "borderRadius", "32", T("--radius-4xl")],
  ["agents/templates", "borderRadius", "15", T("--agent-template-card-radius")],
  ["onboarding/join", "borderRadius", "11.5", T("--onboarding-join-card-radius")],
  ["globals.css", "border-radius", "2px", T("--dashboard-scrollbar-radius")],
  ["FileScreen.module.css", "border-radius", "19px", T("--file-screen-radius")],
  ["SelectionPopover", "borderRadius", "'8.73px'", T("--selection-popover-radius")],
  // Shadows
  ["slack-config.module.css", "box-shadow", "0 0 0 3px rgba(114, 105, 98, 0.08)", T("--slack-config-focus-ring")],
  ["slack-config.module.css", "box-shadow", "0 1px 2px rgba(82, 75, 71, .03)", T("--slack-config-card-shadow")],
  ["slack-config.module.css", "box-shadow", "0 1px 2px rgba(82, 75, 71, 0.04)", T("--slack-config-panel-shadow")],
  ["slack-config.module.css", "box-shadow", "0 2px 6px -2px rgba(82, 75, 71, 0.18)", T("--slack-config-empty-icon-shadow")],
  ["", "boxShadow", "'0px 0px 0px 1px rgba(238,48,48,0.22)'", T("--danger-chip-ring")],
  ["", "boxShadow", '"0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)"', T("--sidebar-menu-shadow")],
  ["", "boxShadow", "'0px 1px 1.5px 0px rgba(82,75,71,0.12), 0px 0px 0px 1px rgba(212, 212, 212,0.4)'", T("--team-switcher-avatar-shadow")],
  ["projects/new", "boxShadow", "'0px 1px 1.5px 0px rgba(82,75,71,0.12)'", T("--project-form-field-shadow")],
  ["help.module.css", "box-shadow", "0 6px 18px rgba(0, 0, 0, 0.06)", T("--help-tile-hover-shadow")],
  ["ShareAcceptClient", "boxShadow", "'0px 0px 0px 1px rgba(13,110,178,0.15)'", T("--share-accept-note-ring")],
  ["onboarding/plans", "boxShadow", "'0px 1.091px 1.091px rgba(59,54,50,0.05), 0px 1.455px 3.127px rgba(38,33,30,0.15)'", T("--onboarding-plans-card-shadow")],
  ["globals.css", "box-shadow", "inset 0 0 0 1px rgba(0, 0, 0, 0.05)", T("--agent-hero-inner-ring")],
  ["globals.css", "box-shadow", "inset 0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 -24px 32px -24px rgba(0, 0, 0, 0.45)", T("--agent-hero-vignette-shadow")],
  ["EffortSlider.module.css", "box-shadow", "0 1px 2px rgba(0, 0, 0, 0.12)", T("--effort-thumb-shadow")],
  ["XmlFunnel", "boxShadow", '"0 10px 28px rgba(82, 75, 71, 0.09), 0 2px 4px rgba(82, 75, 71, 0.07)"', T("--funnel-card-shadow")],
  ["XmlMap.module.css", "box-shadow", "0 2px 8px rgba(82, 75, 71, 0.08)", T("--map-chip-shadow")],
  ["XmlMap.module.css", "box-shadow", "0 1px 4px rgba(38, 33, 30, 0.18)", T("--map-control-shadow")],
  ["XmlMap.module.css", "box-shadow", "0 6px 20px rgba(38, 33, 30, 0.16)", T("--map-popup-shadow")],
  ["ChipTooltip", "boxShadow", "'inset 0 -1px 0 color-mix(in srgb, currentColor 22%, transparent)'", T("--chip-tooltip-underline")],
  ["EmptyOverview.module.css", "box-shadow", "0 6px 18px -6px rgba(38, 33, 30, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.12)", T("--context-overview-cta-shadow")],
  ["SettingsSidebar", "boxShadow", "'4px 0 24px rgba(0, 0, 0, 0.16)'", T("--settings-drawer-shadow")],
  ["FileScreen.module.css", "box-shadow", "0 0 0 1px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.04)", T("--file-screen-page-shadow")],
  ["PickerDialog.module.css", "box-shadow", "0 6px 12px -10px rgba(0, 0, 0, 0.28)", T("--picker-tools-scrolled-shadow")],
  ["PickerDialog.module.css", "box-shadow", "0 6px 16px -10px rgba(0, 0, 0, 0.25)", T("--picker-card-hover-shadow")],
  ["WelcomeModal", "boxShadow", '"0px 0px 0px 1px black, 0px 1px 1px rgba(59,54,50,0.1), 0px 1.5px 3px rgba(59,54,50,0.4)"', T("--welcome-cta-shadow")],
  ["settings/(shell)/", "boxShadow", "'0px 0px 0px 1px rgba(59,54,50,0.3)'", T("--settings-preview-ring")],
  ["settings/(shell)/", "gap", "9", T("--settings-preview-gap-sm")],
  ["settings/(shell)/", "gap", "5", T("--settings-preview-gap-xs")],
  ["settings/(shell)/", "gap", "42", T("--settings-preview-gap-lg")],
  ["settings/(shell)/", "padding", "'5px 8px'", T("--settings-preview-chip-padding")],
  ["settings/(shell)/", "padding", "'7px 10px'", T("--settings-preview-pill-padding")],
  ["settings/(shell)/", "borderRadius", "2", T("--settings-preview-radius-xs")],
  ["settings/(shell)/", "borderRadius", "3", T("--settings-preview-radius-sm")],
  ["QuestionCard", "lineHeight", "'11px'", T("--question-card-meta-line-height")],
  // Approved swaps to tokens that change in dark mode: the coloured tag buttons' shadows.
  ["", "boxShadow", "'0px 1px 1.5px 0px rgba(17,25,1,0.2), 0px 0px 0px 1px rgba(128,183,7,0.5), inset 0px 1px 0px 0px rgba(247,254,230,0.7), inset 0px -1px 0px 0px rgba(128,183,7,0.1)'", "var(--color-tag-Green-shadow), var(--color-tag-Green-inner-shadow)"],
  ["", "boxShadow", "'inset 0px 1px 0px 0px rgba(231,244,253,0.7), inset 0px -1px 0px 0px rgba(13,110,178,0.1)'", T("--color-tag-Blue-inner-shadow")],
  ["", "boxShadow", "'inset 0px 1px 0px 0px rgba(250,241,235,0.7), inset 0px -1px 0px 0px rgba(126,84,53,0.1)'", T("--color-tag-Brown-inner-shadow")],
  ["", "boxShadow", "'0px 1px 1.5px 0px rgba(20,12,5,0.2), 0px 0px 0px 1px rgba(126,84,53,0.5), inset 0px 1px 0px 0px rgba(250,241,235,0.7), inset 0px -1px 0px 0px rgba(126,84,53,0.1)'", "var(--color-tag-Brown-shadow), var(--color-tag-Brown-inner-shadow)"],
  ["", "boxShadow", "'0px 1px 1.5px 0px rgba(20,16,5,0.2), 0px 0px 0px 1px rgba(143,116,39,0.5), inset 0px 1px 0px 0px rgba(250,246,235,0.7), inset 0px -1px 0px 0px rgba(143,116,39,0.1)'", "var(--color-tag-Yellow-shadow), var(--color-tag-Yellow-inner-shadow)"],
  ["onboarding/plans", "boxShadow", "'0px 1px 1.5px rgba(20,16,5,0.2), 0px 0px 0px 1px rgba(143,116,39,0.5), inset 0px 1px 0px rgba(250,246,235,0.7), inset 0px -1px 0px rgba(143,116,39,0.1)'", "var(--color-tag-Yellow-shadow), var(--color-tag-Yellow-inner-shadow)"],
  // Colours
  ["", "background", '"rgba(59,54,50,0.05)"', T("--neutral-800-05")], // approved: themed token
  ["TeamSwitcher", "borderColor", "'rgba(59,54,50,0.1)'", T("--neutral-800-10")], // approved: themed token
  ["", "background", "rgba(38, 33, 30, 0.55)", T("--avatar-upload-scrim")],
  ["", "border-color", "rgba(255, 255, 255, 0.14)", T("--dark-surface-border")],
  ["globals.css", "background", "linear-gradient(100deg, transparent 40%, rgba(255, 255, 255, 0.5) 50%, transparent 60%) no-repeat", T("--button-shine")],
  ["globals.css", "background", "linear-gradient(120deg, transparent 40%, rgba(255, 255, 255, 0.45) 50%, transparent 60%)", T("--button-shiny")],
  ["globals.css", "background", "radial-gradient(circle, rgba(0, 0, 0, 0.05) 0.6px, transparent 0.9px) 0 0 / 4px 4px", T("--agent-orb-dots")],
  ["globals.css", "background", "linear-gradient(transparent, rgba(255, 255, 255, 0.12), transparent)", T("--agent-orb-glint")],
  ["globals.css", "background", "radial-gradient(ellipse 70% 80% at 50% 52%, transparent 45%, rgba(0, 0, 0, 0.38) 100%)", T("--agent-hero-vignette")],
  ["globals.css", "background", "rgba(255, 255, 255, 0.6)", T("--agent-card-chip-bg")],
  ["globals.css", "background", "rgba(10, 10, 10, 0.32)", T("--agent-card-chip-bg-dark")],
  ["globals.css", "background", "rgba(255, 255, 255, 0.92)", T("--agent-card-chip-bg-solid")],
  ["globals.css", "background", "rgba(10, 10, 10, 0.5)", T("--agent-card-chip-bg-solid-dark")],
  ["globals.css", "color", "rgba(255, 255, 255, 0.75)", T("--agent-zzz-color")],
  ["globals.css", "background", "linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%) -150% 0 / 250% 100% no-repeat", T("--agent-cta-sheen")],
  ["globals.css", "fill", "#2B2B2B", T("--folder-icon-tab-dark")],
  ["globals.css", "border", "1px solid rgba(0, 0, 0, 0.06)", T("--agent-card-chip-border")],
  ["ActivityRow", "background", '"rgba(59,54,50,0.04)"', "color-mix(in srgb, var(--neutral-800) 4%, transparent)"],
  ["AnimatedCodeBlock", "background", '"#1E1A17"', T("--widget-code-bg")],
  ["AnimatedLineChart", "background", '"#26211E"', T("--chart-tooltip-bg")],
  ["ChatHome.module.css", "background", "#202020", T("--chat-home-context-bar-bg-dark")],
  ["ChatHome.module.css", "background", "rgba(255, 255, 255, 0.12)", T("--chat-home-context-action-hover-dark")],
  ["XmlMap.module.css", "background", "rgba(82, 75, 71, 0.09)", T("--map-bar-track")],
  ["ChipTooltip", "background", "'color-mix(in srgb, currentColor 12%, transparent)'", T("--chip-tooltip-bg")],
  ["FlatSidebar", "backgroundColor", "'rgba(0, 0, 0, 0.32)'", T("--drawer-scrim")],
  ["FileTable.module.css", "background", "rgba(0, 0, 0, 0.03)", T("--file-row-hover-bg")],
  // Borders
  ["", "border", '"1px solid rgba(82,75,71,0.12)"', T("--widget-border")],
  ["XmlMap.module.css", "border", "1px solid rgba(82, 75, 71, 0.12)", T("--widget-border")],
  ["security/page", "border", "'0.727px solid rgba(59,54,50,0.3)'", T("--settings-preview-border")],
  ["XmlWeather", "border", '"1px solid rgba(255,255,255,0.72)"', T("--weather-chip-border")],
]

// ── Apply ─────────────────────────────────────────────────────────────────────
const edits = new Map()
const read = (rel) => edits.get(rel) ?? fs.readFileSync(at(rel), "utf8")
const write = (rel, text) => edits.set(rel, text)

for (const [rel, { anchor, lines }] of Object.entries(SCALE_TOKENS)) {
  let s = read(rel)
  const eol = s.includes("\r\n") ? "\r\n" : "\n"
  if (s.includes(lines.find((l) => l.trim().startsWith("--")).trim().split(":")[0] + ":")) continue
  if (!s.includes(anchor)) throw new Error(`anchor missing in ${rel}`)
  s = s.replace(anchor, [anchor, ...lines].join(eol))
  write(rel, s)
}

{
  const rel = "src/styles/tokens/semantic.css"
  let s = read(rel)
  const eol = s.includes("\r\n") ? "\r\n" : "\n"
  const START = "/* ── Component values (mapped 2026-11-25) ── */"
  const END = "/* ── end component values ── */"
  const body = [START, "/* Exact values one component (or a few) use, named for what they style. Generated by", "   scripts/codemods/component-tokens.mjs; edit the values here. */", ":root {"]
  for (const [name, value, note] of COMPONENT_TOKENS) {
    if (value === undefined) { body.push(`  /* ${name} */`); continue }
    body.push(`  ${name}: ${value};${note ? ` /* ${note} */` : ""}`)
  }
  body.push("}", END)
  const block = body.join(eol)
  const i = s.indexOf(START)
  s = i >= 0 ? s.slice(0, i) + block + s.slice(s.indexOf(END) + END.length) : s.replace(/\s*$/, "") + eol + eol + block + eol
  write(rel, s)
}

const escape = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
// Hidden on purpose (Pins, Highlights): never touched.
const HIDDEN = /components\/(Pin|PinCategory|PinCommentField|PinInsert|PinSkeleton|Pinboard|PinboardExpanded|PinboardHeader|PinboardSkeleton|HighlightCard|HighlightMark|HighlightPanel)\/|HighlightSidebar|pin-markdown|PinMentionDropdown/
const files = []
const walk = (d) => { for (const e of fs.readdirSync(at(d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(tsx|ts|css)$/.test(e.name) && !/\.test\./.test(e.name) && !p.includes("styles/tokens") && !HIDDEN.test(p)) files.push(p) } }
walk("src")

let count = 0
const unused = []
for (const [where, prop, literal, replacement] of RULES) {
  let hit = 0
  for (const rel of files.filter((f) => f.includes(where))) {
    const isCss = rel.endsWith(".css")
    const quoted = /^["'`]/.test(literal)
    if (isCss === quoted && !(isCss && !quoted)) { if (isCss) continue }
    const out = isCss ? replacement : quoted ? `${literal[0]}${replacement}${literal[0]}` : `'${replacement}'`
    const tail = isCss ? "(?=\\s*(;|!|\\}|/\\*))" : "(?=\\s*(,|\\}|\\n|\\r|/\\*|//))"
    const re = new RegExp(`((?<![\\w-])${escape(prop)}\\s*:\\s*)${escape(literal)}${tail}`, "g")
    const src = read(rel)
    const next = src.replace(re, (_, head) => { hit++; return head + out })
    if (next !== src) write(rel, next)
  }
  count += hit
  if (!hit) unused.push(`${where || "*"} ${prop}: ${literal}`)
}

if (!DRY) for (const [rel, text] of edits) fs.writeFileSync(at(rel), text)
console.log(`${DRY ? "[dry] " : ""}${count} values mapped; ${COMPONENT_TOKENS.filter((t) => t[1] !== undefined).length} component tokens; ${edits.size} files`)
if (unused.length) console.log(`Rules that matched nothing (${unused.length}):\n  ${unused.join("\n  ")}`)
