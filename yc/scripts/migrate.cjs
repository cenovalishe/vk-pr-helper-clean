// FILE: yc/scripts/migrate.cjs
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Database migration script using ydb-sdk QueryClient directly.
//   SCOPE: Read schema.sql, parse statements, execute via QueryClient session.
//   DEPENDS: none
//   LINKS: M-YC-DB
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   run - Main orchestrator to run database migration
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Initial implementation of YDB schema migration script]
// END_CHANGE_SUMMARY

const fs = require('fs');
const path = require('path');
const { Driver, TokenAuthService, getCredentialsFromEnv } = require('ydb-sdk');

function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) {
    return result;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

async function run() {
  console.log('[YdbMigrate][BLOCK_MIGRATE_START] Starting database migration...');
  const rootDir = path.resolve(__dirname, '../..');
  const envLocalPath = path.join(rootDir, '.env.local');
  const envLocal = parseEnvFile(envLocalPath);
  
  const config = {
    ...envLocal,
    ...process.env
  };

  const endpoint = config.YDB_ENDPOINT;
  const database = config.YDB_DATABASE;
  const token = config.YC_IAM_TOKEN || config.YC_TOKEN;

  if (!endpoint || !database) {
    console.error('[YdbMigrate] Error: Missing YDB_ENDPOINT or YDB_DATABASE in config.');
    process.exit(1);
  }

  console.log(`[YdbMigrate] Endpoint: ${endpoint}`);
  console.log(`[YdbMigrate] Database: ${database}`);

  let authService;
  if (token) {
    console.log('[YdbMigrate] Using explicit TokenAuthService');
    authService = new TokenAuthService(token);
  } else {
    console.log('[YdbMigrate] Using getCredentialsFromEnv() fallback');
    authService = getCredentialsFromEnv();
  }

  const driver = new Driver({
    endpoint,
    database,
    authService
  });

  const ready = await driver.ready(10000);
  if (!ready) {
    console.error('[YdbMigrate] Error: YDB driver ready timeout.');
    process.exit(1);
  }

  const schemaPath = path.join(rootDir, 'yc/db/schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  // Parse YQL commands, ignoring SQL comments (--)
  const statements = schemaSql
    .split('\n')
    .map(line => {
      const idx = line.indexOf('--');
      if (idx !== -1) {
        return line.substring(0, idx);
      }
      return line;
    })
    .join('\n')
    .split(';')
    .map(st => st.trim())
    .filter(st => st.length > 0);

  console.log(`[YdbMigrate] Found ${statements.length} YQL statements to execute.`);

  await driver.queryClient.do({
    fn: async (session) => {
      for (const statement of statements) {
        console.log(`[YdbMigrate] Executing schema query: ${statement.substring(0, 50)}...`);
        try {
          const result = await session.execute({ text: statement });
          await result.opFinished;
        } catch (err) {
          const errMsg = err.message || '';
          const isExistError = errMsg.includes('path exist') || 
                               errMsg.includes('already exists') || 
                               (err.issues && err.issues.some(issue => (issue.message || '').includes('path exist')));
          if (isExistError) {
            console.log(`[YdbMigrate] Table or index already exists, skipping.`);
          } else {
            throw err;
          }
        }
      }
    }
  });

  await driver.destroy();
  console.log('[YdbMigrate][BLOCK_SUCCESS] YDB migration completed successfully!');
}

run().catch(err => {
  console.error('[YdbMigrate] Migration failed:', err);
  process.exit(1);
});
