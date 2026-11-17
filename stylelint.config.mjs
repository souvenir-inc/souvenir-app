// Design-system guardrails for CSS files (docs/design-system-primitives-plan.md, Phase 0).
// Only token checks run here; formatting is not linted. Warnings until Phase 7.
//   npm run lint:css
// A justified exception:  /* stylelint-disable-next-line scale-unlimited/declaration-strict-value -- ds-allow: <reason> */

/** @type {import("stylelint").Config} */
export default {
  plugins: ["stylelint-declaration-strict-value"],
  defaultSeverity: "warning",
  ignoreFiles: [
    "src/styles/tokens/**",
    // Hidden features (plan D6).
    "src/components/{Pin,Pinboard,PinboardExpanded,HighlightCard,HighlightPanel}/**",
  ],
  rules: {
    "scale-unlimited/declaration-strict-value": [
      [
        "/color$/",
        "fill",
        "stroke",
        "/^padding/",
        "/^margin/",
        "gap",
        "row-gap",
        "column-gap",
        "/radius$/",
        "font-size",
        "line-height",
        "font-weight",
        "box-shadow",
        "z-index",
        "transition-duration",
      ],
      {
        // Values that are not design decisions.
        ignoreValues: ["inherit", "initial", "unset", "none", "auto", "transparent", "currentColor", "currentcolor", "0", "0px", "100%", "50%", "normal"],
        ignoreFunctions: false,
        disableFix: true,
        message: "Use a token, var(--…), for \"${property}\" (see docs/design-system-primitives-plan.md).",
      },
    ],
  },
};
