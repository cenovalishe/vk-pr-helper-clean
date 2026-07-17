// FILE: yc/scripts/setup-nat.cjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: CLI script to create and configure a VPC NAT Gateway and Route Table in Yandex Cloud, binding all subnets to route outbound traffic through it.
//   SCOPE: execSync execution of YC CLI commands (gateway create, route-table create/add-rules, subnet update).
//   DEPENDS: none
//   LINKS: M-YC-NAT-SETUP
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - CLI setup script
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of automatic VPC NAT Gateway and Route Table setup]
// END_CHANGE_SUMMARY

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// START_BLOCK_PARSE_ENV
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
// END_BLOCK_PARSE_ENV

// START_CONTRACT: runSetup
//   PURPOSE: Execute the NAT setup commands by interacting with the Yandex Cloud CLI.
//   INPUTS: none
//   OUTPUTS: void (exits process on failure)
//   SIDE_EFFECTS: Creates YC VPC gateway, route table, routing rules, and updates VPC subnets.
//   LINKS: M-YC-NAT-SETUP
// END_CONTRACT: runSetup
function runSetup() {
  console.log('[SetupNat][BLOCK_SETUP_START] Starting VPC NAT Gateway setup...');

  const rootDir = path.resolve(__dirname, '../..');
  const envLocalPath = path.join(rootDir, '.env.local');
  const envPath = path.join(rootDir, '.env');

  const envLocal = parseEnvFile(envLocalPath);
  const envBase = parseEnvFile(envPath);

  const config = {
    ...envBase,
    ...envLocal,
    ...process.env
  };

  const folderId = config.FOLDER_ID || '';
  const networkName = config.VPC_NETWORK_NAME || 'default';
  const gatewayName = 'vk-pr-helper-nat';
  const routeTableName = 'vk-pr-helper-rt';

  const folderOption = folderId ? `--folder-id ${folderId}` : '';

  // 1. Verify YC CLI is installed and authenticated
  console.log('[SetupNat] Checking YC CLI status...');
  try {
    execSync(`yc vpc network list ${folderOption}`, { stdio: 'ignore' });
  } catch (err) {
    console.error('\n[SetupNat][BLOCK_AUTH_ERROR] Error: YC CLI is not initialized or authenticated in this context.');
    console.error('Please run "yc init" to authenticate, set up your active profile, and try again.\n');
    process.exit(1);
  }

  // 2. Check or create NAT Gateway
  console.log(`[SetupNat][BLOCK_GATEWAY_CHECK] Checking if NAT Gateway "${gatewayName}" exists...`);
  let gatewayId = '';
  try {
    const gatewaysJson = execSync(`yc vpc gateway list ${folderOption} --format json`, { encoding: 'utf-8' });
    const gateways = JSON.parse(gatewaysJson);
    const existing = gateways.find(g => g.name === gatewayName);
    if (existing) {
      gatewayId = existing.id;
      console.log(`[SetupNat] Found existing NAT Gateway with ID: ${gatewayId}`);
    }
  } catch (err) {
    console.log('[SetupNat] Failed to query existing gateways. Proceeding with creation...');
  }

  if (!gatewayId) {
    console.log(`[SetupNat][BLOCK_GATEWAY_CREATE] Creating NAT Gateway "${gatewayName}"...`);
    try {
      const createOut = execSync(`yc vpc gateway create --name ${gatewayName} ${folderOption} --format json`, { encoding: 'utf-8' });
      const gateway = JSON.parse(createOut);
      gatewayId = gateway.id;
      console.log(`[SetupNat] Created NAT Gateway with ID: ${gatewayId}`);
    } catch (err) {
      console.error('[SetupNat] Failed to create NAT Gateway', err.message);
      process.exit(1);
    }
  }

  // 3. Check or create Route Table
  console.log(`[SetupNat][BLOCK_ROUTE_TABLE_CHECK] Checking if Route Table "${routeTableName}" exists...`);
  let routeTableExists = false;
  try {
    const rtsJson = execSync(`yc vpc route-table list ${folderOption} --format json`, { encoding: 'utf-8' });
    const rts = JSON.parse(rtsJson);
    routeTableExists = rts.some(rt => rt.name === routeTableName);
    if (routeTableExists) {
      console.log(`[SetupNat] Found existing Route Table "${routeTableName}"`);
    }
  } catch (err) {
    console.log('[SetupNat] Failed to query existing route tables. Proceeding with creation...');
  }

  if (!routeTableExists) {
    console.log(`[SetupNat][BLOCK_ROUTE_TABLE_CREATE] Creating Route Table "${routeTableName}" routing 0.0.0.0/0 to gateway ${gatewayName}...`);
    try {
      const createRtCmd = `yc vpc route-table create --name ${routeTableName} --network-name ${networkName} --route destination=0.0.0.0/0,gateway-id=${gatewayId} ${folderOption} --format json`;
      console.log(`[SetupNat] Running: ${createRtCmd}`);
      execSync(createRtCmd, { stdio: 'inherit' });
      console.log(`[SetupNat] Route Table "${routeTableName}" created successfully!`);
    } catch (err) {
      console.error('[SetupNat] Failed to create Route Table', err.message);
      process.exit(1);
    }
  }

  // 4. Update all subnets in the network to use the route table
  console.log('[SetupNat][BLOCK_SUBNETS_UPDATE] Querying subnets in folder...');
  try {
    const subnetsJson = execSync(`yc vpc subnet list ${folderOption} --format json`, { encoding: 'utf-8' });
    const subnets = JSON.parse(subnetsJson);

    // Filter subnets that belong to our network and don't yet have our route table (by name or empty)
    console.log(`[SetupNat] Resolving network ID for network name "${networkName}"...`);
    const netsJson = execSync(`yc vpc network list ${folderOption} --format json`, { encoding: 'utf-8' });
    const nets = JSON.parse(netsJson);
    const targetNet = nets.find(n => n.name === networkName);
    if (!targetNet) {
      console.error(`[SetupNat] Error: VPC network "${networkName}" not found.`);
      process.exit(1);
    }
    const networkId = targetNet.id;
    console.log(`[SetupNat] Network "${networkName}" has ID: ${networkId}`);

    const netSubnets = subnets.filter(s => s.network_id === networkId);
    console.log(`[SetupNat] Found ${netSubnets.length} subnets belonging to network "${networkName}".`);

    for (const subnet of netSubnets) {
      console.log(`[SetupNat] Binding Route Table "${routeTableName}" to subnet "${subnet.name}" (ID: ${subnet.id})...`);
      const updateCmd = `yc vpc subnet update ${subnet.id} --route-table-name ${routeTableName} ${folderOption}`;
      console.log(`[SetupNat] Running: ${updateCmd}`);
      execSync(updateCmd, { stdio: 'inherit' });
    }

    console.log('[SetupNat][BLOCK_SUCCESS] VPC NAT Gateway routing configured successfully for all subnets!');
  } catch (err) {
    console.error('[SetupNat] Failed to update subnets with route table', err.message);
    process.exit(1);
  }
}

module.exports = runSetup;

if (require.main === module) {
  runSetup();
}
