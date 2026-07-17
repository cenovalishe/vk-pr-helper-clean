// FILE: vitest.workspace.ts
// VERSION: 1.3.1
// START_MODULE_CONTRACT
//   PURPOSE: Root Vitest workspace config enabling `pnpm vitest run` to execute both backend (yc/) and frontend (packages/web) test suites with correct environments and aliases.
//   SCOPE: Workspace-level test runner configuration referencing per-package configs.
//   DEPENDS: packages/web/vite.config.ts (jsdom environment + @ alias), yc/ tests (node environment)
//   LINKS: none
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.3.1 - Add missing CHANGE_SUMMARY to satisfy GRACE framework rules]
//   PREVIOUS_CHANGES:
//     - [v1.3.0 - Initial Vitest workspace configuration enabling backend and frontend test runners]
// END_CHANGE_SUMMARY

export default [
  // Frontend tests — delegates to packages/web/vite.config.ts for jsdom env + @ alias + react plugin
  {
    extends: './packages/web/vite.config.ts',
    test: {
      name: 'web',
      root: './packages/web',
      include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    },
  },
  // Backend tests — node environment, no DOM
  {
    test: {
      name: 'backend',
      environment: 'node',
      include: ['yc/__tests__/**/*.test.ts'],
      globals: true,
    },
  },
];
