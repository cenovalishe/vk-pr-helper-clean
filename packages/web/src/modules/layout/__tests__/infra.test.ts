// START_MODULE_CONTRACT
//   PURPOSE: Infrastructure configuration and scripts verification tests.
//   SCOPE: Unit tests verifying gitignore entries and deploy script cleanup logic.
//   DEPENDS: none
//   LINKS: M-DEPLOY-SCRIPT, M-CONFIG-GIT, V-M-CONFIG-GIT, V-M-DEPLOY-SCRIPT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   test - infrastructure tests
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.0 - Removed VD-1 vercel.json test (vercel.json abolished in YC migration); kept gitignore + deploy-yc.cjs checks]
// END_CHANGE_SUMMARY

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Infrastructure Configurations', () => {
  it('VG-1: .gitignore contains build/secrets patterns', () => {
    const gitignorePath = path.resolve(__dirname, '../../../../../../.gitignore');
    const content = fs.readFileSync(gitignorePath, 'utf8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.env');

    expect(content).toContain('dist/');
  });

  it('VDS-1: deploy-yc.cjs exists and parses local env files', () => {
    const scriptPath = path.resolve(__dirname, '../../../../../../deploy-yc.cjs');
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain("function parseEnvFile(filePath)");
    expect(content).toContain("esbuild yc/index.ts");
    expect(content).toContain("pnpm --filter web build");
  });
});
