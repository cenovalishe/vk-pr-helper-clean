// FILE: deploy-yc.cjs
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Main deploy script to build backend bundle, create YC function version, migrate YDB schema, build and sync frontend static files.
//   SCOPE: esbuild bundling, ZIP archiving, S3 uploads, YC CLI invocations, YDB migrations.
//   DEPENDS: none
//   LINKS: M-YC-DEPLOY
//   ROLE: SCRIPT
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - CLI execution script
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.3.0 - Add VPC network integration support (VPC_NETWORK_ID / VPC_NETWORK_NAME) to bind function egress to NAT Gateway]
//   PREVIOUS_CHANGES:
//     - [v1.2.0 - Add WebP support to getContentType helper for frontend static assets]
//     - [v1.1.0 - Add CORS configuration for temp bucket (production origin) and SPA routing rules for static bucket; remove hardcoded service-account-id (now from env)]
//     - [v1.0.2 - Bump function memory to 256m and execution-timeout to 30s to handle VK API + image upload flow reliably]
// END_CHANGE_SUMMARY

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');
const { S3Client, PutObjectCommand, PutBucketWebsiteCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

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

// START_BLOCK_WALK_FILES
function getFiles(dir, files = []) {
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else {
      files.push(name);
    }
  }
  return files;
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.json': return 'application/json';
    case '.ico': return 'image/x-icon';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}
// END_BLOCK_WALK_FILES

// START_CONTRACT: main
//   PURPOSE: Orchestrate building and deploying backend function + frontend assets, and running migrations.
//   INPUTS: none
//   OUTPUTS: void (exits process on failure)
//   SIDE_EFFECTS: Interacts with filesystem, runs subprocesses, uploads to S3, updates YC Function version.
//   LINKS: M-YC-DEPLOY
// END_CONTRACT: main
async function main() {
  console.log('[YcDeploy][BLOCK_DEPLOY_START] Starting deployment to Yandex Cloud...');
  
  const rootDir = __dirname;
  const envLocalPath = path.join(rootDir, '.env.local');
  const envPath = path.join(rootDir, '.env');

  const envLocal = parseEnvFile(envLocalPath);
  const envBase = parseEnvFile(envPath);

  const config = {
    ...envBase,
    ...envLocal,
    ...process.env
  };

  const s3AccessKeyId = config.S3_ACCESS_KEY_ID;
  const s3SecretAccessKey = config.S3_SECRET_ACCESS_KEY;
  const s3BucketStatic = config.S3_BUCKET_STATIC;
  const s3BucketTemp = config.S3_BUCKET_TEMP;
  const ydbEndpoint = config.YDB_ENDPOINT;
  const ydbDatabase = config.YDB_DATABASE;
  const lockboxSecretId = config.LOCKBOX_SECRET_ID;
  const serviceAccountId = config.SERVICE_ACCOUNT_ID;
  const clientOrigin = config.CLIENT_ORIGIN || '';
  const vpcNetworkName = config.VPC_NETWORK_NAME || '';
  const vpcNetworkId = config.VPC_NETWORK_ID || '';

  if (!s3AccessKeyId || !s3SecretAccessKey || !s3BucketStatic || !s3BucketTemp || !ydbEndpoint || !ydbDatabase) {
    console.error('[YcDeploy] Error: Missing required S3, YDB, or Lockbox configuration in environment or env files.');
    process.exit(1);
  }

  if (!serviceAccountId) {
    console.error('[YcDeploy] Error: Missing SERVICE_ACCOUNT_ID in environment or env files.');
    process.exit(1);
  }

  // 1. Backend bundling via esbuild
  console.log('[YcDeploy][BLOCK_BUNDLE_BACKEND] Bundling backend code using esbuild...');
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  try {
    execSync('npx esbuild yc/index.ts --bundle --platform=node --target=node22 --outfile=dist/index.js', { stdio: 'inherit' });
  } catch (err) {
    console.error('[YcDeploy] esbuild bundling failed', err);
    process.exit(1);
  }

  // 2. Package function bundle into ZIP
  console.log('[YcDeploy][BLOCK_ZIP_ARCHIVE] Creating function ZIP package...');
  const zipPath = path.join(distDir, 'function.zip');
  try {
    const zip = new AdmZip();
    zip.addLocalFile(path.join(distDir, 'index.js'));
    zip.writeZip(zipPath);
    console.log(`[YcDeploy] Function ZIP created at: ${zipPath}`);
  } catch (err) {
    console.error('[YcDeploy] ZIP archiving failed', err);
    process.exit(1);
  }

  // 3. Initialize S3 client
  const s3 = new S3Client({
    region: 'ru-central1',
    endpoint: 'https://storage.yandexcloud.net',
    credentials: {
      accessKeyId: s3AccessKeyId,
      secretAccessKey: s3SecretAccessKey
    }
  });

  // 4. Determine upload strategy (limit 3.5MB)
  const stats = fs.statSync(zipPath);
  const sizeMb = stats.size / (1024 * 1024);
  console.log(`[YcDeploy] ZIP file size: ${sizeMb.toFixed(2)} MB`);

  let useBucket = sizeMb > 3.5;
  const s3Key = `deployments/function_${Date.now()}.zip`;

  if (useBucket) {
    console.log(`[YcDeploy][BLOCK_S3_UPLOAD_ZIP] Size exceeds 3.5MB. Uploading package to temp bucket: ${s3BucketTemp}...`);
    try {
      const fileBuffer = fs.readFileSync(zipPath);
      await s3.send(new PutObjectCommand({
        Bucket: s3BucketTemp,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/zip'
      }));
      console.log('[YcDeploy] Function package uploaded successfully to S3');
    } catch (err) {
      console.error('[YcDeploy] Failed to upload ZIP package to Object Storage', err);
      process.exit(1);
    }
  }

  // 5. Deploy function version
  console.log('[YcDeploy][BLOCK_DEPLOY_FUNCTION] Updating Yandex Cloud Function version...');
  try {
    // Check/create function
    try {
      execSync('yc serverless function create --name vk-pr-helper', { stdio: 'ignore' });
      console.log("[YcDeploy] Created serverless function 'vk-pr-helper'");
    } catch (e) {
      // Ignore if function already exists
    }

    const envVars = [];
    if (lockboxSecretId) envVars.push(`LOCKBOX_SECRET_ID=${lockboxSecretId}`);
    if (config.HTTPS_PROXY) envVars.push(`HTTPS_PROXY=${config.HTTPS_PROXY}`);
    const secretEnvStr = envVars.length > 0 ? `--environment ${envVars.join(',')}` : '';
    let networkStr = '';
    if (vpcNetworkId || vpcNetworkName) {
      try {
        console.log('[YcDeploy] Resolving subnet IDs for network to bypass default serverless gateways...');
        const subnetsJson = execSync(`yc vpc subnet list --format json`, { encoding: 'utf-8' });
        const subnets = JSON.parse(subnetsJson);
        let targetNetworkId = vpcNetworkId;
        if (!targetNetworkId && vpcNetworkName) {
          const networksJson = execSync(`yc vpc network list --format json`, { encoding: 'utf-8' });
          const networks = JSON.parse(networksJson);
          targetNetworkId = networks.find(n => n.name === vpcNetworkName)?.id;
        }
        
        if (targetNetworkId) {
          const classicSubnetIds = subnets
            .filter(s => s.network_id === targetNetworkId && ['ru-central1-a', 'ru-central1-b', 'ru-central1-d'].includes(s.zone_id))
            .map(s => s.id);
            
          if (classicSubnetIds.length > 0) {
            networkStr = `--subnet-id ${classicSubnetIds.join(',')}`;
            console.log(`[YcDeploy] Bound function to subnets: ${classicSubnetIds.join(', ')}`);
          } else {
            console.warn('[YcDeploy] Warning: No subnets found in classic zones (ru-central1-a/b/d) for network, falling back to network flag.');
            networkStr = vpcNetworkId ? `--network-id ${vpcNetworkId}` : `--network-name ${vpcNetworkName}`;
          }
        } else {
          console.warn('[YcDeploy] Warning: Could not resolve network ID, falling back to network flag.');
          networkStr = vpcNetworkId ? `--network-id ${vpcNetworkId}` : `--network-name ${vpcNetworkName}`;
        }
      } catch (e) {
        console.warn('[YcDeploy] Warning: Failed to query subnets dynamically, falling back to network flag:', e.message);
        networkStr = vpcNetworkId ? `--network-id ${vpcNetworkId}` : `--network-name ${vpcNetworkName}`;
      }
    }

    let versionCmd = '';

    if (useBucket) {
      versionCmd = `yc serverless function version create --function-name vk-pr-helper --runtime nodejs22 --entrypoint index.handler --service-account-id ${serviceAccountId} --memory 256m --execution-timeout 30s ${secretEnvStr} --package-bucket-name ${s3BucketTemp} --package-object-name ${s3Key} ${networkStr}`;
    } else {
      versionCmd = `yc serverless function version create --function-name vk-pr-helper --runtime nodejs22 --entrypoint index.handler --service-account-id ${serviceAccountId} --memory 256m --execution-timeout 30s ${secretEnvStr} --source-path ${zipPath} ${networkStr}`;
    }

    console.log(`[YcDeploy] Running: ${versionCmd}`);
    execSync(versionCmd, { stdio: 'inherit' });
    console.log('[YcDeploy] Function version created successfully!');
  } catch (err) {
    console.warn('[YcDeploy] Warning: YC Function deployment failed. Make sure YC CLI profile is logged in and configured.');
    console.warn('[YcDeploy] You can run the function version creation command manually later.');
  }

  // 6. Database schema migration
  console.log('[YcDeploy][BLOCK_MIGRATE_DB] Migrating YDB schema via migrate.cjs...');
  try {
    execSync('node yc/scripts/migrate.cjs', { stdio: 'inherit' });
    console.log('[YcDeploy] YDB migration completed successfully!');
  } catch (err) {
    console.error('[YcDeploy] YDB migration failed', err);
    process.exit(1);
  }

  // 7. Build frontend
  console.log('[YcDeploy][BLOCK_BUILD_FRONTEND] Building frontend package...');
  try {
    execSync('pnpm --filter web build', { stdio: 'inherit' });
    console.log('[YcDeploy] Frontend build completed!');
  } catch (err) {
    console.error('[YcDeploy] Frontend build failed', err);
    process.exit(1);
  }

  // 8. Upload frontend static assets
  console.log('[YcDeploy][BLOCK_SYNC_FRONTEND] Syncing frontend static files to bucket...');
  const webDistDir = path.join(rootDir, 'packages/web/dist');
  if (!fs.existsSync(webDistDir)) {
    console.error(`[YcDeploy] Error: Frontend build directory not found at ${webDistDir}`);
    process.exit(1);
  }

  try {
    const webFiles = getFiles(webDistDir);
    console.log(`[YcDeploy] Found ${webFiles.length} static files to sync.`);

    for (const file of webFiles) {
      const relativePath = path.relative(webDistDir, file).replace(/\\/g, '/');
      const fileBuffer = fs.readFileSync(file);
      const contentType = getContentType(file);

      console.log(`[YcDeploy] Uploading ${relativePath} (${contentType})...`);
      await s3.send(new PutObjectCommand({
        Bucket: s3BucketStatic,
        Key: relativePath,
        Body: fileBuffer,
        ContentType: contentType
      }));
    }

    console.log('[YcDeploy] All static files synced successfully!');
  } catch (err) {
    console.error('[YcDeploy] Static files sync failed', err);
    process.exit(1);
  }

  // 9. Configure website hosting on static bucket (with SPA fallback routing rules)
  console.log('[YcDeploy][BLOCK_CONFIGURE_HOSTING] Configuring bucket website hosting, SPA routing, and CORS...');
  try {
    console.log(`[YcDeploy] Configuring website hosting for bucket: ${s3BucketStatic} via S3 SDK...`);
    await s3.send(new PutBucketWebsiteCommand({
      Bucket: s3BucketStatic,
      WebsiteConfiguration: {
        IndexDocument: { Suffix: 'index.html' },
        ErrorDocument: { Key: 'index.html' },
        RoutingRules: [
          {
            Condition: { HttpErrorCodeReturnedEquals: '404' },
            Redirect: {
              Protocol: 'https',
              HttpRedirectCode: '301',
              ReplaceKeyWith: 'index.html'
            }
          }
        ]
      }
    }));
    console.log('[YcDeploy] Static website hosting + SPA fallback configured via S3 SDK!');
  } catch (sdkErr) {
    console.warn('[YcDeploy] Warning: Failed to configure bucket website hosting via S3 SDK:', sdkErr.message);
    console.log('[YcDeploy] Attempting fallback via YC CLI...');
    try {
      const bucketConfigCmd = `yc storage bucket update --name ${s3BucketStatic} --public-read --website-settings "{\\"index\\":\\"index.html\\",\\"error\\":\\"index.html\\"}"`;
      console.log(`[YcDeploy] Running: ${bucketConfigCmd}`);
      execSync(bucketConfigCmd, { stdio: 'inherit' });
      console.log('[YcDeploy] Static hosting and public read configured successfully via YC CLI fallback!');
    } catch (cliErr) {
      console.warn('[YcDeploy] Warning: Failed to configure bucket website hosting via YC CLI fallback.');
      console.warn('[YcDeploy] Please configure bucket website hosting manually (index=index.html, error=index.html).');
    }
  }

  // 10. Configure CORS on temp bucket for client image uploads (PUT method)
  const allowedOrigins = [
    clientOrigin,
    `https://${s3BucketStatic}.website.yandexcloud.net`,
    'http://localhost:5173',
    'http://localhost:3000'
  ].filter(Boolean);

  console.log(`[YcDeploy][BLOCK_CONFIGURE_CORS] Configuring CORS for temp bucket: ${s3BucketTemp}...`);
  console.log(`[YcDeploy] Allowed origins: ${allowedOrigins.join(', ')}`);
  try {
    await s3.send(new PutBucketCorsCommand({
      Bucket: s3BucketTemp,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedMethods: ['PUT', 'GET', 'HEAD'],
            AllowedHeaders: ['Content-Type'],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 300
          }
        ]
      }
    }));
    console.log('[YcDeploy] CORS for temp bucket configured successfully!');
  } catch (corsErr) {
    console.warn('[YcDeploy] Warning: Failed to configure CORS for temp bucket:', corsErr.message);
    console.warn('[YcDeploy] Please configure CORS manually on the temp bucket (AllowedOrigin must include production domain).');
  }

  console.log('[YcDeploy][BLOCK_SUCCESS] Deployment completed successfully!');
}

module.exports = { main };

if (require.main === module) {
  main().catch(err => {
    console.error('[YcDeploy] Deployment fatal error:', err);
    process.exit(1);
  });
}
