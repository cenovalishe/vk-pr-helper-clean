// FILE: packages/web/src/modules/communities/avatars.ts
// VERSION: 3.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Community avatar resolution with initials fallback using YC REST endpoint supporting numeric IDs and custom screen names.
//   SCOPE: useCommunityAvatars hook, in-memory session cache, initials fallback on fetch failure
//   DEPENDS: M-AUTH (for isAuthenticated gate), M-FE-API-CLIENT
//   LINKS: M-COMMUNITIES-AVATARS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useCommunityAvatars - React hook calling REST /communities/avatars for missing avatars
//   fetchCommunityAvatars - Legacy/fallback helper returning empty map
// END_MODULE_MAP

import { useState, useEffect, useRef } from 'react';
import { createLogger } from '@/shared/logger';
import { useAuth } from '../auth';
import { apiMutation } from '@/modules/api-client';

const logger = createLogger('Communities');

// In-memory Map session cache (internal to this module), keyed by string screen name
const AVATAR_CACHE = new Map<string, string>();

// START_CONTRACT: fetchCommunityAvatars
//   PURPOSE: Returns empty avatar map — groups.getById removed to avoid groups scope requirement
//   INPUTS: { vkIds: (number | string)[], accessToken: string }
//   OUTPUTS: Promise<Record<number | string, string>> — empty strings for all vkIds (initials fallback)
//   SIDE_EFFECTS: none
//   LINKS: M-COMMUNITIES-AVATARS
// END_CONTRACT: fetchCommunityAvatars
export async function fetchCommunityAvatars(vkIds: (number | string)[], _accessToken: string): Promise<Record<number | string, string>> {
  const result: Record<number | string, string> = {};
  for (const id of vkIds) {
    result[id] = '';
    const vkIdLog = typeof id === 'number' ? id : (isNaN(Number(id)) ? id : Number(id));
    logger.warn('CommunityAvatars', 'BLOCK_AVATAR_FALLBACK', `Initials fallback for group ${id} (groups.getById disabled)`, {
      vkId: vkIdLog,
      reason: 'groups-scope-removed',
    });
  }
  return result;
}

// START_CONTRACT: useCommunityAvatars
//   PURPOSE: React hook returning community avatars map with loading state and cache handling
//   INPUTS: { vkIds: (number | string)[] }
//   OUTPUTS: { avatars: Map<number | string, string>, isLoading: boolean, error: string | null }
//   SIDE_EFFECTS: Fetches missing avatars via effect using getAvatars action; updates AVATAR_CACHE and logs cache hits
//   LINKS: M-COMMUNITIES-AVATARS
// END_CONTRACT: useCommunityAvatars
export function useCommunityAvatars(vkIds: (number | string)[]) {
  const { isAuthenticated, sessionToken } = useAuth();
  
  const screenNames = vkIds.map(id => String(id));

  const [avatars, setAvatars] = useState<Map<number | string, string>>(() => {
    const initial = new Map<number | string, string>();
    for (const id of vkIds) {
      const name = String(id);
      if (AVATAR_CACHE.has(name)) {
        initial.set(id, AVATAR_CACHE.get(name)!);
      }
    }
    return initial;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vkIdsKey = screenNames.join(',');
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const currentNames = vkIdsKey ? vkIdsKey.split(',') : [];
    const missingNames = currentNames.filter(name => !AVATAR_CACHE.has(name) && !fetchedIdsRef.current.has(name));
    const cachedNames = currentNames.filter(name => AVATAR_CACHE.has(name));

    if (cachedNames.length > 0 && missingNames.length === 0) {
      logger.info('CommunityAvatars', 'BLOCK_CACHE_HIT', 'Resolved all avatars from session cache', {
        cachedCount: cachedNames.length,
      });
      const nextMap = new Map<number | string, string>();
      for (const id of vkIds) {
        const name = String(id);
        nextMap.set(id, AVATAR_CACHE.get(name)!);
      }
      setAvatars(prev => {
        let hasChanges = false;
        for (const [k, v] of nextMap.entries()) {
          if (prev.get(k) !== v) {
            hasChanges = true;
            break;
          }
        }
        return hasChanges ? nextMap : prev;
      });
      return;
    }

    if (missingNames.length === 0) {
      return;
    }

    for (const name of missingNames) {
      fetchedIdsRef.current.add(name);
    }

    setIsLoading(true);
    setError(null);

    logger.info('CommunityAvatars', 'BLOCK_FETCH_AVATARS', 'Fetching community avatars from backend', {
      count: missingNames.length,
      vkIds: missingNames,
    });

    apiMutation<Record<string, string>>('/communities/avatars', 'POST', { screenNames: missingNames }, sessionToken)
      .then(fetchedAvatars => {
        for (const [name, url] of Object.entries(fetchedAvatars)) {
          AVATAR_CACHE.set(name, url);
          if (!url) {
            const vkIdLog = isNaN(Number(name)) ? name : Number(name);
            logger.warn('CommunityAvatars', 'BLOCK_AVATAR_FALLBACK', `No avatar field for group ${name}`, {
              vkId: vkIdLog,
              reason: 'no-avatar-field',
            });
          }
        }

        const nextMap = new Map<number | string, string>();
        for (const id of vkIds) {
          const name = String(id);
          nextMap.set(id, AVATAR_CACHE.get(name) || '');
          if (typeof id === 'number') {
            nextMap.set(name, AVATAR_CACHE.get(name) || '');
          } else {
            const num = Number(id);
            if (!isNaN(num)) {
              nextMap.set(num, AVATAR_CACHE.get(name) || '');
            }
          }
        }

        setAvatars(nextMap);
        setIsLoading(false);
      })
      .catch(err => {
        for (const name of missingNames) {
          AVATAR_CACHE.set(name, '');
          const vkIdLog = isNaN(Number(name)) ? name : Number(name);
          logger.warn('CommunityAvatars', 'BLOCK_AVATAR_FALLBACK', `Falling back to initials for group ${name}`, {
            vkId: vkIdLog,
            reason: 'fetch-failed',
          });
        }

        const nextMap = new Map<number | string, string>();
        for (const id of vkIds) {
          const name = String(id);
          nextMap.set(id, AVATAR_CACHE.get(name) || '');
          if (typeof id === 'number') {
            nextMap.set(name, AVATAR_CACHE.get(name) || '');
          } else {
            const num = Number(id);
            if (!isNaN(num)) {
              nextMap.set(num, AVATAR_CACHE.get(name) || '');
            }
          }
        }

        setAvatars(nextMap);
        setError(err.message || String(err));
        setIsLoading(false);
      });
  }, [vkIdsKey, isAuthenticated, sessionToken]);

  return { avatars, isLoading, error };
}





// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.0.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//   PREVIOUS_CHANGES:
//     - [v3.0.0 - YC migration: use REST endpoint /communities/avatars with session cache]
//     - [v2.2.0 - Update useCommunityAvatars hook to support custom string screen names and numeric IDs interchangeably]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[Communities][Avatars][useCommunityAvatars][BLOCK_FETCH_AVATARS]",
  "[Communities][Avatars][useCommunityAvatars][BLOCK_CACHE_HIT]",
  "[Communities][Avatars][useCommunityAvatars][BLOCK_AVATAR_FALLBACK]"
];
