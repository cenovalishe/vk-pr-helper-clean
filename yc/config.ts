// FILE: yc/config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Load and cache all Yandex Lockbox secrets at cold start, falling back to process.env locally.
//   SCOPE: Read config from Lockbox REST API (via metadata token) or process.env, validate 14 fields, cache in-memory.
//   DEPENDS: none
//   LINKS: M-YC-CONFIG
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   getConfig - Returns validated and cached YcConfig; throws MISSING_SECRET or LOCKBOX_ACCESS_DENIED on failure
//   clearConfigCache - Clears the cached configuration (helper for testing)
//   YcConfig - Interface defining the 14 database and API secrets
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.2 - Redact Lockbox secret ID from log output (security: prevent resource ID disclosure)]
// END_CHANGE_SUMMARY

export interface YcConfig {
  vkAppId: string;
  vkIdSalt: string;
  jwtSecret: string;
  vkOAuthRedirectUrl: string;
  vkServiceToken: string;
  vkClientSecret: string;
  vkApiVersion: string;
  clientOrigin: string;
  ydbEndpoint: string;
  ydbDatabase: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3BucketStatic: string;
  s3BucketTemp: string;
}

let cachedConfig: YcConfig | null = null;

// START_CONTRACT: clearConfigCache
//   PURPOSE: Clear cached config to force reload (used by tests).
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: Mutates module-level cachedConfig variable.
//   LINKS: none
// END_CONTRACT: clearConfigCache
export function clearConfigCache(): void {
  cachedConfig = null;
}

// START_CONTRACT: getConfig
//   PURPOSE: Retrieve validated configuration, loading from Lockbox or environment variables.
//   INPUTS: none
//   OUTPUTS: Promise<YcConfig> - Resolved configuration object
//   SIDE_EFFECTS: Fetches from Lockbox API if LOCKBOX_SECRET_ID is defined; logs initialization.
//   LINKS: none
// END_CONTRACT: getConfig
export async function getConfig(): Promise<YcConfig> {
  // START_BLOCK_CONFIG_LOAD
  if (cachedConfig) {
    return cachedConfig;
  }

  const secretId = process.env.LOCKBOX_SECRET_ID;
  let rawConfig: Record<string, string> = {};

  if (secretId) {
    console.log(`[YcConfig] Loading config from Lockbox (secret ID redacted)`);
    try {
      // 1. Fetch IAM token from internal metadata server
      const tokenRes = await fetch('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token', {
        headers: { 'Metadata-Flavor': 'Google' }
      });
      if (!tokenRes.ok) {
        throw new Error('FAILED_METADATA_FETCH');
      }
      const tokenData = await tokenRes.json() as { access_token: string };
      const iamToken = tokenData.access_token;

      // 2. Fetch payload from Lockbox REST API
      const payloadUrl = `https://payload.lockbox.api.cloud.yandex.net/lockbox/v1/secrets/${secretId}/payload`;
      const payloadRes = await fetch(payloadUrl, {
        headers: {
          'Authorization': `Bearer ${iamToken}`
        }
      });

      if (!payloadRes.ok) {
        const err = new Error('LOCKBOX_ACCESS_DENIED');
        (err as any).code = 'LOCKBOX_ACCESS_DENIED';
        throw err;
      }

      const payloadData = await payloadRes.json() as { entries?: Array<{ key: string; textValue?: string }> };
      const entries = payloadData.entries || [];
      for (const entry of entries) {
        if (entry.key && entry.textValue !== undefined) {
          rawConfig[entry.key] = entry.textValue;
        }
      }
    } catch (e: any) {
      if (e.code === 'LOCKBOX_ACCESS_DENIED') {
        throw e;
      }
      const err = new Error('LOCKBOX_ACCESS_DENIED');
      (err as any).code = 'LOCKBOX_ACCESS_DENIED';
      throw err;
    }
  } else {
    console.log('[YcConfig] Loading config from process.env');
    rawConfig = { ...(process.env as Record<string, string>) };
  }

  // 3. Map to camelCase keys
  const config: YcConfig = {
    vkAppId: rawConfig.VK_APP_ID || '',
    vkIdSalt: rawConfig.VK_ID_SALT || '',
    jwtSecret: rawConfig.JWT_SECRET || '',
    vkOAuthRedirectUrl: rawConfig.VK_OAUTH_REDIRECT_URL || '',
    vkServiceToken: rawConfig.VK_SERVICE_TOKEN || '',
    vkClientSecret: rawConfig.VK_CLIENT_SECRET || '',
    vkApiVersion: rawConfig.VK_API_VERSION || '',
    clientOrigin: rawConfig.CLIENT_ORIGIN || '',
    ydbEndpoint: rawConfig.YDB_ENDPOINT || '',
    ydbDatabase: rawConfig.YDB_DATABASE || '',
    s3AccessKeyId: rawConfig.S3_ACCESS_KEY_ID || '',
    s3SecretAccessKey: rawConfig.S3_SECRET_ACCESS_KEY || '',
    s3BucketStatic: rawConfig.S3_BUCKET_STATIC || 'vk-pr-helper-static-ceno',
    s3BucketTemp: rawConfig.S3_BUCKET_TEMP || 'vk-pr-helper-temp-ceno'
  };

  // 4. Validate all fields are non-empty
  const missingKeys: string[] = [];
  const fieldMapping: Record<keyof YcConfig, string> = {
    vkAppId: 'VK_APP_ID',
    vkIdSalt: 'VK_ID_SALT',
    jwtSecret: 'JWT_SECRET',
    vkOAuthRedirectUrl: 'VK_OAUTH_REDIRECT_URL',
    vkServiceToken: 'VK_SERVICE_TOKEN',
    vkClientSecret: 'VK_CLIENT_SECRET',
    vkApiVersion: 'VK_API_VERSION',
    clientOrigin: 'CLIENT_ORIGIN',
    ydbEndpoint: 'YDB_ENDPOINT',
    ydbDatabase: 'YDB_DATABASE',
    s3AccessKeyId: 'S3_ACCESS_KEY_ID',
    s3SecretAccessKey: 'S3_SECRET_ACCESS_KEY',
    s3BucketStatic: 'S3_BUCKET_STATIC',
    s3BucketTemp: 'S3_BUCKET_TEMP'
  };

  for (const [key, envName] of Object.entries(fieldMapping) as [keyof YcConfig, string][]) {
    if (!config[key]) {
      missingKeys.push(envName);
    }
  }

  if (missingKeys.length > 0) {
    const err = new Error('MISSING_SECRET');
    (err as any).code = 'MISSING_SECRET';
    (err as any).missingKeys = missingKeys;
    throw err;
  }

  cachedConfig = config;
  return config;
  // END_BLOCK_CONFIG_LOAD
}

// GRACE_MARKER: [YcConfig][getConfig][BLOCK_CONFIG_LOAD]

const _graceLogMarkers = [
  "[YcConfig][getConfig][BLOCK_CONFIG_LOAD]"
];
