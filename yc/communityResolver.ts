// FILE: yc/communityResolver.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Resolve VK community screen_name to numeric ID and fetch avatars with YDB caching.
//   SCOPE: resolveHandler, avatarsHandler, resolveCommunityId Express handlers and helpers.
//   DEPENDS: M-YC-DB, M-YC-LOGGER, M-YC-VK-API
//   LINKS: M-YC-COMMUNITY-RESOLVER
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT

// START_MODULE_MAP
//   resolveHandler - Express POST /communities/resolve handler
//   avatarsHandler - Express POST /communities/avatars handler
//   resolveCommunityId - (screenName, vkAccessToken?) => Promise<number>; internal helper for submit
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.1 - Sanitize error message in VK_API_ERROR response to prevent internal detail leakage]
// END_CHANGE_SUMMARY

import { Request, Response } from 'express';
import { TypedValues } from 'ydb-sdk';
import { query, execute } from './db/index';
import { log } from './logger';
import { resolveScreenName, groupsGetById } from './vkapi/client';
import { getConfig } from './config';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

// START_CONTRACT: resolveCommunityId
//   PURPOSE: Resolves a screen name to numeric ID, using YDB cache or calling VK API resolveScreenName.
//   INPUTS: { screenName: string, vkAccessToken?: string }
//   OUTPUTS: Promise<number> - Numeric community ID
//   SIDE_EFFECTS: VK API call on cache miss, updates YDB cache, logging.
//   LINKS: M-YC-COMMUNITY-RESOLVER
// END_CONTRACT: resolveCommunityId
export async function resolveCommunityId(screenName: string, vkAccessToken?: string): Promise<number> {
  // START_BLOCK_RESOLVE_CACHE_HIT
  const cachedRows = await query(
    'DECLARE $screenName AS Utf8; SELECT screenName, numericId, resolvedAt FROM community_ids WHERE screenName = $screenName',
    { '$screenName': TypedValues.utf8(screenName) }
  );

  if (cachedRows && cachedRows.length > 0) {
    const row = cachedRows[0];
    const resolvedAt = row.resolvedAt && typeof row.resolvedAt === 'object' && 'toString' in row.resolvedAt 
      ? Number(row.resolvedAt.toString()) 
      : Number(row.resolvedAt);

    const isStale = (Date.now() - resolvedAt) > THIRTY_DAYS;
    if (!isStale) {
      const numericId = row.numericId && typeof row.numericId === 'object' && 'toString' in row.numericId 
        ? Number(row.numericId.toString()) 
        : Number(row.numericId);

      log('YcCommunityResolver', 'resolveCommunityId', 'BLOCK_RESOLVE_CACHE_HIT', `Cache hit for screen name ${screenName}`, { screenName, numericId });
      return numericId;
    }
  }
  // END_BLOCK_RESOLVE_CACHE_HIT

  // START_BLOCK_RESOLVE_CACHE_MISS
  log('YcCommunityResolver', 'resolveCommunityId', 'BLOCK_RESOLVE_CACHE_MISS', `Cache miss or stale for screen name ${screenName}`);

  let token = vkAccessToken;
  if (!token) {
    const config = await getConfig();
    token = config.vkServiceToken;
  }

  let res;
  try {
    res = await resolveScreenName(token, screenName);
  } catch (err: any) {
    log('YcCommunityResolver', 'resolveCommunityId', 'BLOCK_RESOLVE_CACHE_MISS', 'VK resolve API failed', { error: err.message });
    throw err;
  }

  if (!res || !res.objectId || (res.type !== 'group' && res.type !== 'page' && res.type !== 'event')) {
    log('YcCommunityResolver', 'resolveCommunityId', 'BLOCK_RESOLVE_CACHE_MISS', `Failed to resolve screen name ${screenName}: not a community`);
    const notFoundError = new Error('COMMUNITY_NOT_FOUND');
    (notFoundError as any).status = 404;
    throw notFoundError;
  }

  const numericId = res.objectId;
  const now = Date.now();

  await execute(
    'DECLARE $screenName AS Utf8; ' +
    'DECLARE $numericId AS Uint64; ' +
    'DECLARE $resolvedAt AS Uint64; ' +
    'UPSERT INTO community_ids (screenName, numericId, resolvedAt) ' +
    'VALUES ($screenName, $numericId, $resolvedAt)',
    {
      '$screenName': TypedValues.utf8(screenName),
      '$numericId': TypedValues.uint64(numericId),
      '$resolvedAt': TypedValues.uint64(now)
    }
  );

  log('YcCommunityResolver', 'resolveCommunityId', 'BLOCK_RESOLVE_CACHE_MISS', `Cached screen name ${screenName} -> ${numericId}`);
  return numericId;
  // END_BLOCK_RESOLVE_CACHE_MISS
}

// START_CONTRACT: resolveHandler
//   PURPOSE: Express POST /communities/resolve handler. Resolves screen name.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Queries/Updates community_ids table, VK API call on miss, responds JSON.
//   LINKS: M-YC-COMMUNITY-RESOLVER
// END_CONTRACT: resolveHandler
export async function resolveHandler(req: Request, res: Response): Promise<void> {
  const { screenName, vkAccessToken } = req.body || {};
  if (!screenName || typeof screenName !== 'string') {
    log('YcCommunityResolver', 'resolveHandler', 'BLOCK_RESOLVE_CACHE_MISS', 'Validation failed: missing screenName', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'screenName is required' });
    return;
  }

  try {
    let token = vkAccessToken;
    if (!token && req.headers?.authorization) {
      const authHeader = req.headers.authorization;
      const parsedToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      if (parsedToken && !parsedToken.startsWith('eyJ')) {
        token = parsedToken;
      }
    }

    const numericId = await resolveCommunityId(screenName, token);
    res.status(200).json({ numericId });
  } catch (err: any) {
    if (err.message === 'COMMUNITY_NOT_FOUND' || err.status === 404) {
      res.status(404).json({ error: 'COMMUNITY_NOT_FOUND' });
      return;
    }
    res.status(502).json({ error: 'VK_API_ERROR', message: 'Failed to resolve community' });
  }
}

// START_CONTRACT: avatarsHandler
//   PURPOSE: Express POST /communities/avatars handler. Batch fetches avatars with YDB cache checking.
//   INPUTS: { req: Request, res: Response }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: Queries/Updates community_ids table, VK API call on miss, responds JSON.
//   LINKS: M-YC-COMMUNITY-RESOLVER
// END_CONTRACT: avatarsHandler
export async function avatarsHandler(req: Request, res: Response): Promise<void> {
  const { screenNames } = req.body || {};
  if (!screenNames || !Array.isArray(screenNames)) {
    log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_CACHE_HIT', 'Validation failed: missing screenNames', {});
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'screenNames must be an array' });
    return;
  }

  // SEC: Limit array size to prevent DoS via unbounded batch requests
  if (screenNames.length > 50) {
    log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_CACHE_HIT', 'Rejected oversized screenNames array', { count: screenNames.length });
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Too many screen names (max 50)' });
    return;
  }

  try {
    const results: Record<string, string> = {};
    const misses: string[] = [];

    // 1. Check cache for each screen name
    for (const name of screenNames) {
      const rows = await query(
        'DECLARE $screenName AS Utf8; SELECT screenName, numericId, avatarUrl, resolvedAt FROM community_ids WHERE screenName = $screenName',
        { '$screenName': TypedValues.utf8(name) }
      );

      if (rows && rows.length > 0) {
        const row = rows[0];
        const resolvedAt = row.resolvedAt && typeof row.resolvedAt === 'object' && 'toString' in row.resolvedAt 
          ? Number(row.resolvedAt.toString()) 
          : Number(row.resolvedAt);

        const isStale = (Date.now() - resolvedAt) > THIRTY_DAYS;
        if (!isStale && row.avatarUrl !== undefined) {
          results[name] = String(row.avatarUrl);
          log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_CACHE_HIT', `Cache hit for avatar of ${name}`, { screenName: name, avatarUrl: row.avatarUrl });
          continue;
        }
      }
      misses.push(name);
    }

    if (misses.length === 0) {
      res.status(200).json(results);
      return;
    }

    log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_FETCHED', `Cache miss for avatars of: ${misses.join(', ')}`);

    // 2. Fetch from VK API
    try {
      const groupsResponse = await groupsGetById(misses);
      const groupsList = Array.isArray(groupsResponse)
        ? groupsResponse
        : (groupsResponse && Array.isArray(groupsResponse.groups) ? groupsResponse.groups : []);

      const now = Date.now();

      // 3. Process VK response and cache results
      for (const name of misses) {
        const normalizedInput = name.toLowerCase().replace(/^(club|public|event)/, '');

        const group = groupsList.find((g: any) => {
          const gScreen = (g.screen_name || '').toLowerCase();
          const gIdStr = String(g.id);
          return gScreen === name.toLowerCase() || gScreen === normalizedInput || gIdStr === normalizedInput;
        });

        if (group) {
          const avatarUrl = group.photo_100 || group.photo_50 || '';
          results[name] = avatarUrl;

          await execute(
            'DECLARE $screenName AS Utf8; ' +
            'DECLARE $numericId AS Uint64; ' +
            'DECLARE $avatarUrl AS Utf8; ' +
            'DECLARE $resolvedAt AS Uint64; ' +
            'UPSERT INTO community_ids (screenName, numericId, avatarUrl, resolvedAt) ' +
            'VALUES ($screenName, $numericId, $avatarUrl, $resolvedAt)',
            {
              '$screenName': TypedValues.utf8(name),
              '$numericId': TypedValues.uint64(group.id),
              '$avatarUrl': TypedValues.utf8(avatarUrl),
              '$resolvedAt': TypedValues.uint64(now)
            }
          );
          log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_FETCHED', `Cached avatar for ${name} -> ${avatarUrl}`);
        } else {
          // Cache empty string to avoid repeatedly hitting VK for nonexistent communities
          results[name] = '';
          const numericIdFallback = isNaN(Number(normalizedInput)) ? 0 : Number(normalizedInput);

          await execute(
            'DECLARE $screenName AS Utf8; ' +
            'DECLARE $numericId AS Uint64; ' +
            'DECLARE $avatarUrl AS Utf8; ' +
            'DECLARE $resolvedAt AS Uint64; ' +
            'UPSERT INTO community_ids (screenName, numericId, avatarUrl, resolvedAt) ' +
            'VALUES ($screenName, $numericId, $avatarUrl, $resolvedAt)',
            {
              '$screenName': TypedValues.utf8(name),
              '$numericId': TypedValues.uint64(numericIdFallback),
              '$avatarUrl': TypedValues.utf8(''),
              '$resolvedAt': TypedValues.uint64(now)
            }
          );
          log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_FETCHED', `Failed to resolve avatar for ${name}: caching fallback`);
        }
      }
    } catch (err: any) {
      log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_FETCHED', 'VK getAvatars API failed', { error: err.message });
      for (const name of misses) {
        results[name] = '';
      }
    }

    res.status(200).json(results);
  } catch (e: any) {
    log('YcCommunityResolver', 'avatarsHandler', 'BLOCK_AVATAR_FETCHED', 'Failed to resolve avatars', { error: e.message });
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}

// GRACE_MARKER: [YcCommunityResolver][BLOCK_RESOLVE_CACHE_HIT]
// GRACE_MARKER: [YcCommunityResolver][BLOCK_RESOLVE_CACHE_MISS]
// GRACE_MARKER: [YcCommunityResolver][BLOCK_AVATAR_CACHE_HIT]
// GRACE_MARKER: [YcCommunityResolver][BLOCK_AVATAR_FETCHED]

const _graceLogMarkers = [
  "[YcCommunityResolver][BLOCK_RESOLVE_CACHE_HIT]",
  "[YcCommunityResolver][BLOCK_RESOLVE_CACHE_MISS]",
  "[YcCommunityResolver][BLOCK_AVATAR_CACHE_HIT]",
  "[YcCommunityResolver][BLOCK_AVATAR_FETCHED]"
];
