// FILE: yc/scripts/setup-lockbox.cjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Setup script to create Yandex Lockbox secret and service account with payloadViewer role.
//   SCOPE: Read .env.local/env, run YC CLI commands to create service account, create secret, grant role.
//   DEPENDS: none
//   LINKS: M-YC-SECRETS
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   main - Main execution function that runs the YC CLI setup process
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of Yandex Lockbox setup automation script]
// END_CHANGE_SUMMARY

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// START_CONTRACT: parseEnvFile
//   PURPOSE: Read and parse basic key-value pairs from a .env file.
//   INPUTS: { filePath: string - Absolute path to the .env file }
//   OUTPUTS: { Record<string, string> - Parsed key-value pairs }
//   SIDE_EFFECTS: Reads file from disk.
//   LINKS: none
// END_CONTRACT: parseEnvFile
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
      // Remove enclosing quotes if present
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

// START_CONTRACT: main
//   PURPOSE: Executed when the script runs; parses env, runs YC CLI commands or outputs instructions.
//   INPUTS: none
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Spawns yc CLI processes, prints to stdout.
//   LINKS: none
// END_CONTRACT: main
function main() {
  console.log('[YcSecrets][BLOCK_INIT] Starting Lockbox configuration...');

  // 1. Gather all configuration from environment and .env files
  const rootDir = path.resolve(__dirname, '../..');
  const envLocalPath = path.join(rootDir, '.env.local');
  const envPath = path.join(rootDir, '.env');

  const envLocal = parseEnvFile(envLocalPath);
  const envBase = parseEnvFile(envPath);

  // Merge order: process.env > .env.local > .env
  const config = {
    ...envBase,
    ...envLocal,
    ...process.env
  };

  const requiredKeys = [
    'VK_APP_ID',
    'VK_ID_SALT',
    'JWT_SECRET',
    'VK_OAUTH_REDIRECT_URL',
    'VK_SERVICE_TOKEN',
    'VK_CLIENT_SECRET',
    'YDB_ENDPOINT',
    'YDB_DATABASE',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'CLIENT_ORIGIN',
    'VK_API_VERSION',
    'S3_BUCKET_STATIC',
    'S3_BUCKET_TEMP'
  ];

  console.log('[YcSecrets] Checking required keys...');
  const missing = [];
  const payloadArray = [];

  for (const key of requiredKeys) {
    const val = config[key] || '';
    if (!val) {
      missing.push(key);
    }
    payloadArray.push({ key, text_value: val });
  }

  if (missing.length > 0) {
    console.warn(`[YcSecrets] Warning: Missing value for keys: ${missing.join(', ')}.`);
    console.warn('[YcSecrets] The secret will be created with empty/placeholder values for these keys.');
  }

  const payloadString = JSON.stringify(payloadArray);

  const saName = 'vk-pr-helper-sa';
  const secretName = 'vk-pr-helper-secrets';

  // 2. Prepare the shell commands
  const createSaCmd = `yc iam service-account create --name ${saName}`;
  const createSecretCmd = `yc lockbox secret create --name ${secretName} --payload "${payloadString.replace(/"/g, '\\"')}"`;
  
  console.log('\n--- Planned Yandex Cloud Setup Commands ---');
  console.log(`1. Create Service Account:\n   ${createSaCmd}\n`);
  console.log(`2. Create Lockbox Secret:\n   yc lockbox secret create --name ${secretName} --payload "<JSON_PAYLOAD>"\n`);
  console.log(`3. Grant payloadViewer Role:\n   yc lockbox secret add-access-binding --name ${secretName} --role lockbox.payloadViewer --service-account-name ${saName}\n`);
  console.log('-------------------------------------------\n');

  // 3. Attempt to run commands if yc CLI is configured
  try {
    console.log('[YcSecrets][BLOCK_CLI_CHECK] Verifying yc profile...');
    execSync('yc config list', { stdio: 'ignore' });

    console.log(`[YcSecrets][BLOCK_CREATE_SA] Creating service account '${saName}'...`);
    try {
      execSync(createSaCmd, { stdio: 'inherit' });
    } catch (e) {
      console.log(`[YcSecrets] Service account '${saName}' may already exist. Proceeding.`);
    }

    console.log(`[YcSecrets][BLOCK_CREATE_SECRET] Creating Lockbox secret '${secretName}'...`);
    let secretId = '';
    try {
      const output = execSync(createSecretCmd, { encoding: 'utf-8' });
      console.log(output);
      const idMatch = output.match(/^id: (.*)$/m);
      if (idMatch) {
        secretId = idMatch[1].trim();
      }
    } catch (e) {
      console.log(`[YcSecrets] Secret '${secretName}' creation failed. It might already exist.`);
    }

    console.log(`[YcSecrets][BLOCK_GRANT_ROLE] Granting lockbox.payloadViewer to '${saName}'...`);
    const grantCmd = `yc lockbox secret add-access-binding ${secretName} --role lockbox.payloadViewer --service-account-name ${saName}`;
    execSync(grantCmd, { stdio: 'inherit' });

    console.log('[YcSecrets][BLOCK_SUCCESS] Setup complete successfully!');
  } catch (error) {
    console.log('[YcSecrets][BLOCK_CLI_ERROR] Yandex Cloud CLI is not fully configured locally (e.g. profile is missing).');
    console.log('[YcSecrets] Please run the printed commands manually once your `yc` CLI profile is active.');
    console.log('[YcSecrets] Graceful fallback successful.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
