// Type-aware lint pass. Separate from eslint.config.mjs because it needs the
// TypeScript program: ~103s versus ~29s for the plain run, which is too slow to
// pay on every `npm run lint`.
//
// Run it with `npm run lint:types` — in CI, or before touching async code.
//
// These rules catch the failure this app is most exposed to: a promise nobody
// awaits. A dropped rejection in a stream handler or a fetch wrapper surfaces as
// an unhandled rejection with no stack pointing at the caller.
//
// They are warnings, not errors, because the codebase has a backlog (see the
// counts below as of this commit). Fix a file's warnings when you touch it, and
// flip the rule to "error" once its count reaches zero.
//
//   @typescript-eslint/no-floating-promises   48
//   @typescript-eslint/no-misused-promises    65
//   @typescript-eslint/await-thenable          1

import base from "./eslint.config.mjs";

export default [
  ...base,
  {
    files: ["src/**/*.{ts,tsx}"],
    // tsconfig.json excludes **/*.test.ts(x), and projectService refuses a file no
    // project owns — without this every test file is a parsing error (255 of them)
    // and the run never reaches the promise rules. Tests keep the base config.
    ignores: ["src/**/*.test.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/await-thenable": "warn",
    },
  },
];
