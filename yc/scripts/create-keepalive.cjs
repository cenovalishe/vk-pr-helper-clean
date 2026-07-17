// FILE: yc/scripts/create-keepalive.cjs
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Setup script to create Yandex Cloud serverless trigger firing every 5 minutes to keep the function warm.
//   SCOPE: Create timer trigger via YC CLI command.
//   DEPENDS: none
//   LINKS: M-YC-KEEPALIVE
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - CLI setup script
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.0 - Initial implementation of Yandex Cloud Timer Trigger creation script]
// END_CHANGE_SUMMARY

const { execSync } = require('child_process');

// START_CONTRACT: main
//   PURPOSE: Executed when script runs; verifies YC CLI and attempts to create the timer trigger.
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: Spawns yc subprocesses, logs to console.
//   LINKS: M-YC-KEEPALIVE
// END_CONTRACT: main
function main() {
  console.log('[YcKeepalive][BLOCK_INIT] Creating YC Timer Trigger keepalive...');
  
  const triggerName = 'vk-pr-helper-keepalive';
  const cron = '*/5 * * * *';
  const functionName = 'vk-pr-helper';
  const saName = 'vk-pr-helper-sa';
  
  const cmd = `yc serverless trigger create timer --name ${triggerName} --cron "${cron}" --invoke-function-name ${functionName} --invoke-function-tag \\$latest --service-account-name ${saName}`;
  
  console.log(`[YcKeepalive] Planned CLI command:\n   ${cmd}\n`);
  
  try {
    execSync('yc config list', { stdio: 'ignore' });
    console.log('[YcKeepalive] Checking if trigger already exists...');
    try {
      execSync(`yc serverless trigger get --name ${triggerName}`, { stdio: 'ignore' });
      console.log(`[YcKeepalive] Trigger '${triggerName}' already exists. Skipping creation.`);
      return;
    } catch (e) {
      // Trigger does not exist
    }
    
    console.log(`[YcKeepalive][BLOCK_CREATE_TRIGGER] Running YC trigger creation...`);
    execSync(cmd, { stdio: 'inherit' });
    console.log('[YcKeepalive][BLOCK_SUCCESS] Keepalive trigger created successfully!');
  } catch (error) {
    console.warn('[YcKeepalive][BLOCK_CLI_ERROR] YC CLI not fully configured or trigger creation failed.');
    console.warn('[YcKeepalive] You can run the trigger creation command manually.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };

// GRACE_MARKER: [YcKeepalive][BLOCK_CREATE_TRIGGER]
