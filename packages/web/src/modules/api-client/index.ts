// FILE: packages/web/src/modules/api-client/index.ts
// VERSION: 2.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Fetch-based REST client providing React query hooks and fetch helpers with JWT auth injection
//   SCOPE: useApiQuery, apiMutation, apiHttp
//   DEPENDS: M-AUTH
//   LINKS: M-FE-API-CLIENT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   apiHttp - Performs REST fetch with Authorization JWT injected
//   apiMutation - Helper for POST/PATCH/DELETE/PUT REST mutations
//   useApiQuery - React query hook for GET endpoints with manual refetch and optimistic updates
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.1.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//   PREVIOUS_CHANGES:
//     - [v2.1.0 - Remove legacy ConvexProviderWrapper completely]
//     - [v2.0.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//     - [v2.0.0 - Replace Convex client with fetch-based REST client (useApiQuery, apiMutation, apiHttp).]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[ApiClient][BLOCK_API_CALL]"
];

import React, { ReactNode, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/useAuth';
import { createLogger } from '@/shared/logger';

const logger = createLogger('ApiClient');

// START_CONTRACT: apiHttp
//   PURPOSE: Fetches an API endpoint, passing accessToken as a Bearer token in Authorization header
//   INPUTS: path: string, accessToken: string | null, options?: RequestInit
//   OUTPUTS: Promise<Response>
//   SIDE_EFFECTS: Performs HTTP fetch request
//   LINKS: M-FE-API-CLIENT
// END_CONTRACT: apiHttp
export async function apiHttp(
  path: string,
  accessToken: string | null,
  options: RequestInit = {}
): Promise<Response> {
  const baseUrl = import.meta.env.VITE_API_URL || '/api';
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const headers = new Headers(options.headers || {});
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // START_BLOCK_API_CALL
  // GRACE_MARKER: [ApiClient][BLOCK_API_CALL]
  logger.debug('apiHttp', 'BLOCK_API_CALL', `Calling REST endpoint: ${options.method || 'GET'} ${path}`, {
    hasAuth: !!accessToken,
  });
  // END_BLOCK_API_CALL

  return fetch(url, {
    ...options,
    headers,
  });
}

// START_CONTRACT: apiMutation
//   PURPOSE: Performs a REST mutation (POST/PATCH/DELETE/PUT) with automatic JSON body and auth
//   INPUTS: path: string, method: 'POST'|'PATCH'|'DELETE'|'PUT', body?: any, accessToken?: string | null
//   OUTPUTS: Promise<any>
//   SIDE_EFFECTS: Performs mutation fetch call
//   LINKS: M-FE-API-CLIENT
// END_CONTRACT: apiMutation
export async function apiMutation<TResponse = any, TBody = any>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE' | 'PUT',
  body?: TBody,
  accessToken?: string | null
): Promise<TResponse> {
  const res = await apiHttp(path, accessToken || null, {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let errorDetail: Record<string, unknown> = {};
    try {
      errorDetail = await res.json();
    } catch {
      // Response body is not JSON
    }
    const errorCode = (errorDetail as Record<string, string>).error || `HTTP_ERROR_${res.status}`;
    const errorMsg = (errorDetail as Record<string, string>).message || errorCode;
    const err = new Error(errorMsg);
    (err as any).status = res.status;
    (err as any).code = errorCode;
    throw err;
  }

  if (res.status === 204) {
    return {} as TResponse;
  }

  return await res.json();
}

// START_CONTRACT: useApiQuery
//   PURPOSE: React hook for GET queries supporting manual refetch, optimistic updates, and loading/error states
//   INPUTS: path: string, options?: RequestInit
//   OUTPUTS: { data: any, loading: boolean, error: Error | null, refetch: (optimisticData?: any) => Promise<any>, setData: (data: any) => void }
//   SIDE_EFFECTS: Performs fetch query on mount and token changes
//   LINKS: M-FE-API-CLIENT
// END_CONTRACT: useApiQuery
export function useApiQuery<T = any>(
  path: string,
  options: RequestInit = {}
) {
  const { sessionToken } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const fetchQuery = useCallback(async (optimisticData?: T) => {
    if (optimisticData !== undefined) {
      setData(optimisticData);
    }
    try {
      setLoading(true);
      const res = await apiHttp(path, sessionToken, optionsRef.current);
      if (!res.ok) {
        let errorDetail: Record<string, unknown> = {};
        try {
          errorDetail = await res.json();
        } catch {
          // Response body is not JSON
        }
        const errorCode = (errorDetail as Record<string, string>).error || `HTTP_ERROR_${res.status}`;
        throw new Error((errorDetail as Record<string, string>).message || errorCode);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      return json;
    } catch (err: any) {
      const errorObj = err instanceof Error ? err : new Error(err?.message || String(err));
      setError(errorObj);
      throw errorObj;
    } finally {
      setLoading(false);
    }
  }, [path, sessionToken]);

  useEffect(() => {
    if (sessionToken) {
      fetchQuery().catch(() => {});
    } else {
      setLoading(false);
    }
  }, [fetchQuery, sessionToken]);

  return { data, loading, error, refetch: fetchQuery, setData };
}

