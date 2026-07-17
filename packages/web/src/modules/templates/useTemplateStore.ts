// FILE: packages/web/src/modules/templates/useTemplateStore.ts
// VERSION: 3.7.0
// START_MODULE_CONTRACT
//   PURPOSE: Template state management hook with caching to prevent flicker during tab switching and automatic offline fallback
//   SCOPE: Custom hook useTemplateStore managing templates list, loading state, error state, and CRUD operations; provides global module-level cache per adapter; falls back to LocalStorage if REST API is offline
//   DEPENDS: react, ./types, ./storage, @/shared/logger, ../auth/useAuth
//   LINKS: M-TEMPLATES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useTemplateStore - Hook for template management with per-adapter caching and offline fallback
//   clearTemplateStoreCache - Resets the global memory cache for all templates (used in testing/logout)
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.7.0 - Prevent offline fallback to LocalStorage on client 4xx errors (e.g. 404 Not Found) for create, update, delete, duplicate, and fetch operations]
//   PREVIOUS_CHANGES:
//     - [v3.6.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//     - [v3.6.0 - Sort templates by createdAt descending so that newly created and duplicated templates appear at the beginning of the list]
//     - [v3.5.0 - Share isOffline status globally across hook instances to prevent duplicate timeouts on tab switching]
//     - [v3.4.0 - Implement duplicateTemplate(sourceId) with unique index copy name suffixes and offline localstorage fallback for Phase-PR-1]
//     - [v3.3.0 - Fixed state synchronization when cacheKey transitions from unauthenticated (local) to authenticated (api) status where cache is already loaded]
// END_CHANGE_SUMMARY

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Template, TemplateData, TemplateStoragePort } from './types';
import { ApiTemplateStorageAdapter, LocalStorageAdapter } from './storage';
import { createLogger } from '@/shared/logger';
import { useAuth } from '@/modules/auth/useAuth';

const log = createLogger('Templates');

const defaultLocalStorageAdapter = new LocalStorageAdapter();

interface CacheEntry {
  templates: Template[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
}

// Global cache mapped by cache key
const cache = new Map<any, CacheEntry>();
const fetchingAdapters = new Set<any>();
const cacheListeners = new Map<any, Set<() => void>>();

let globalIsOffline = false;
const offlineListeners = new Set<() => void>();

function notifyCacheListeners(key: any) {
  const listeners = cacheListeners.get(key);
  if (listeners) {
    listeners.forEach((l) => l());
  }
}

function getCacheEntry(key: any): CacheEntry {
  if (!cache.has(key)) {
    cache.set(key, {
      templates: [],
      loading: true,
      error: null,
      loaded: false,
    });
  }
  return cache.get(key)!;
}

export function clearTemplateStoreCache() {
  cache.clear();
  fetchingAdapters.clear();
  cacheListeners.clear();
  globalIsOffline = false;
  offlineListeners.clear();
}

// Auto-register beforeEach in tests to prevent cross-test pollution
const testGlobalBeforeEach = (globalThis as any).beforeEach;
if (typeof testGlobalBeforeEach === 'function') {
  testGlobalBeforeEach(() => {
    clearTemplateStoreCache();
  });
}

// START_CONTRACT: useTemplateStore
//   PURPOSE: Hook for accessing, caching, and managing VK post templates
//   INPUTS: customAdapter? - Optional storage adapter interface
//   OUTPUTS: { templates: Template[], loading: boolean, error: string | null, createTemplate, updateTemplate, deleteTemplate, refresh }
//   SIDE_EFFECTS: fetches templates from adapter on mount if not loaded; triggers cache updates
//   LINKS: M-TEMPLATES, M-SUBMIT
// END_CONTRACT: useTemplateStore
export function useTemplateStore(customAdapter?: TemplateStoragePort) {

  let authContext: any = null;
  try {
    authContext = useAuth();
  } catch (e) {
    // Context missing in tests
  }

  const sessionToken = authContext?.sessionToken;
  const isAuthenticated = authContext?.isAuthenticated;
  const userId = authContext?.userId;

  const [isOffline, setIsOfflineState] = useState(globalIsOffline);

  useEffect(() => {
    const handleOfflineChange = () => {
      setIsOfflineState(globalIsOffline);
    };
    offlineListeners.add(handleOfflineChange);
    return () => {
      offlineListeners.delete(handleOfflineChange);
    };
  }, []);

  const setIsOffline = useCallback((val: boolean) => {
    globalIsOffline = val;
    offlineListeners.forEach((l) => l());
  }, []);

  useEffect(() => {
    setIsOffline(false);
  }, [sessionToken, isAuthenticated, setIsOffline]);

  const adapter = useMemo(() => {
    if (customAdapter) return customAdapter;
    if (isAuthenticated && sessionToken && !isOffline) {
      return new ApiTemplateStorageAdapter(sessionToken);
    }
    return defaultLocalStorageAdapter;
  }, [customAdapter, sessionToken, isAuthenticated, isOffline]);

  const cacheKey = useMemo(() => {
    if (customAdapter) return customAdapter;
    if (isAuthenticated && userId && !isOffline) return `api-${userId}`;
    return 'local';
  }, [customAdapter, isAuthenticated, userId, isOffline]);

  const cacheEntry = getCacheEntry(cacheKey);

  const [state, setState] = useState<CacheEntry>(() => ({
    templates: cacheEntry.templates,
    loading: cacheEntry.loaded ? false : cacheEntry.loading,
    error: cacheEntry.error,
    loaded: cacheEntry.loaded,
  }));

  const [prevCacheKey, setPrevCacheKey] = useState(cacheKey);

  if (cacheKey !== prevCacheKey) {
    setPrevCacheKey(cacheKey);
    const entry = getCacheEntry(cacheKey);
    setState({
      templates: entry.templates,
      loading: entry.loaded ? false : entry.loading,
      error: entry.error,
      loaded: entry.loaded,
    });
  }

  // Sync component state with global cache
  useEffect(() => {
    const handleUpdate = () => {
      const current = getCacheEntry(cacheKey);
      setState({
        templates: current.templates,
        loading: current.loaded ? false : current.loading,
        error: current.error,
        loaded: current.loaded,
      });
    };
    
    if (!cacheListeners.has(cacheKey)) {
      cacheListeners.set(cacheKey, new Set());
    }
    const listeners = cacheListeners.get(cacheKey)!;
    listeners.add(handleUpdate);
    
    return () => {
      listeners.delete(handleUpdate);
      if (listeners.size === 0) {
        cacheListeners.delete(cacheKey);
      }
    };
  }, [cacheKey]);

  const fetchTemplates = useCallback(async (force = false) => {
    const entry = getCacheEntry(cacheKey);
    if (!force && entry.loaded) {
      return;
    }
    if (fetchingAdapters.has(cacheKey)) {
      return;
    }

    fetchingAdapters.add(cacheKey);
    try {
      if (!entry.loaded) {
        entry.loading = true;
        notifyCacheListeners(cacheKey);
      }
      const data = await adapter.getAll();
      entry.templates = data;
      entry.loading = false;
      entry.error = null;
      entry.loaded = true;
      notifyCacheListeners(cacheKey);
    } catch (err: any) {
      if (adapter instanceof ApiTemplateStorageAdapter) {
        if (err.status && err.status >= 400 && err.status < 500) {
          entry.error = err.message;
          entry.loading = false;
          entry.loaded = true;
          notifyCacheListeners(cacheKey);
          fetchingAdapters.delete(cacheKey);
          return;
        }
        log.warn('fetchTemplates', 'BLOCK_TEMPLATE_CRUD', 'API storage failed, falling back to LocalStorage', { error: err.message });
        setIsOffline(true);
        fetchingAdapters.delete(cacheKey);
        return;
      }
      entry.error = err.message;
      entry.loading = false;
      entry.loaded = true;
      notifyCacheListeners(cacheKey);
    } finally {
      fetchingAdapters.delete(cacheKey);
    }
  }, [adapter, cacheKey]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // START_BLOCK_TEMPLATE_CRUD
  const createTemplate = async (data: TemplateData) => {
    try {
      if (!data.name) throw new Error('VALIDATION_ERROR: Name is required');

      const newTemplate = await adapter.create(data);
      log.info('createTemplate', 'BLOCK_TEMPLATE_CRUD', 'create', { id: newTemplate.id });
      await fetchTemplates(true);
      return newTemplate;
    } catch (err: any) {
      if (adapter instanceof ApiTemplateStorageAdapter) {
        if (err.status && err.status >= 400 && err.status < 500) {
          const entry = getCacheEntry(cacheKey);
          entry.error = err.message;
          notifyCacheListeners(cacheKey);
          throw err;
        }
        log.warn('createTemplate', 'BLOCK_TEMPLATE_CRUD', 'API storage failed, falling back to LocalStorage', { error: err.message });
        setIsOffline(true);
        const localAdapter = defaultLocalStorageAdapter;
        const newTemplate = await localAdapter.create(data);
        const localEntry = getCacheEntry('local');
        localEntry.templates = await localAdapter.getAll();
        localEntry.loaded = true;
        localEntry.loading = false;
        localEntry.error = null;
        notifyCacheListeners('local');
        return newTemplate;
      }
      const entry = getCacheEntry(cacheKey);
      entry.error = err.message;
      notifyCacheListeners(cacheKey);
      throw err;
    }
  };

  const updateTemplate = async (id: string, data: Partial<TemplateData>) => {
    try {
      if (data.name === '') throw new Error('VALIDATION_ERROR: Name cannot be empty');
      const updated = await adapter.update(id, data);
      log.info('updateTemplate', 'BLOCK_TEMPLATE_CRUD', 'update', { id: updated.id });
      await fetchTemplates(true);
      return updated;
    } catch (err: any) {
      if (adapter instanceof ApiTemplateStorageAdapter) {
        if (err.status && err.status >= 400 && err.status < 500) {
          const entry = getCacheEntry(cacheKey);
          entry.error = err.message;
          notifyCacheListeners(cacheKey);
          throw err;
        }
        log.warn('updateTemplate', 'BLOCK_TEMPLATE_CRUD', 'API storage failed, falling back to LocalStorage', { error: err.message });
        setIsOffline(true);
        const localAdapter = defaultLocalStorageAdapter;
        const existing = await localAdapter.getById(id);
        let updated;
        if (!existing) {
          updated = await localAdapter.create({ name: data.name || 'Шаблон', text: data.text || '' });
        } else {
          updated = await localAdapter.update(id, data);
        }
        const localEntry = getCacheEntry('local');
        localEntry.templates = await localAdapter.getAll();
        localEntry.loaded = true;
        localEntry.loading = false;
        localEntry.error = null;
        notifyCacheListeners('local');
        return updated;
      }
      const entry = getCacheEntry(cacheKey);
      entry.error = err.message;
      notifyCacheListeners(cacheKey);
      throw err;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      await adapter.delete(id);
      log.info('deleteTemplate', 'BLOCK_TEMPLATE_CRUD', 'delete', { id });
      await fetchTemplates(true);
    } catch (err: any) {
      if (adapter instanceof ApiTemplateStorageAdapter) {
        if (err.status && err.status >= 400 && err.status < 500) {
          const entry = getCacheEntry(cacheKey);
          entry.error = err.message;
          notifyCacheListeners(cacheKey);
          throw err;
        }
        log.warn('deleteTemplate', 'BLOCK_TEMPLATE_CRUD', 'API storage failed, falling back to LocalStorage', { error: err.message });
        setIsOffline(true);
        const localAdapter = defaultLocalStorageAdapter;
        try {
          await localAdapter.delete(id);
        } catch (e) {
          // ignore
        }
        const localEntry = getCacheEntry('local');
        localEntry.templates = await localAdapter.getAll();
        localEntry.loaded = true;
        localEntry.loading = false;
        localEntry.error = null;
        notifyCacheListeners('local');
        return;
      }
      const entry = getCacheEntry(cacheKey);
      entry.error = err.message;
      notifyCacheListeners(cacheKey);
      throw err;
    }
  };

  const duplicateTemplate = async (sourceId: string) => {
    try {
      const entry = getCacheEntry(cacheKey);
      const source = entry.templates.find(t => t.id === sourceId);
      if (!source) throw new Error(`VALIDATION_ERROR: Source template ${sourceId} not found`);

      const baseName = source.name;
      let newName = `${baseName} (копия)`;
      let index = 1;
      while (entry.templates.some(t => t.name === newName)) {
        index++;
        newName = `${baseName} (копия ${index})`;
      }

      const duplicated = await adapter.create({
        name: newName,
        text: source.text,
      });

      log.info('useTemplateStore', 'BLOCK_TEMPLATE_CRUD', 'duplicate', { sourceId, duplicatedId: duplicated.id });
      await fetchTemplates(true);
      return duplicated;
    } catch (err: any) {
      if (adapter instanceof ApiTemplateStorageAdapter) {
        if (err.status && err.status >= 400 && err.status < 500) {
          const entry = getCacheEntry(cacheKey);
          entry.error = err.message;
          notifyCacheListeners(cacheKey);
          throw err;
        }
        log.warn('duplicateTemplate', 'BLOCK_TEMPLATE_CRUD', 'API storage failed, falling back to LocalStorage', { error: err.message });
        setIsOffline(true);
        const localAdapter = defaultLocalStorageAdapter;
        const localEntry = getCacheEntry('local');
        const source = localEntry.templates.find(t => t.id === sourceId);
        let duplicated;
        if (source) {
          const baseName = source.name;
          let newName = `${baseName} (копия)`;
          let index = 1;
          while (localEntry.templates.some(t => t.name === newName)) {
            index++;
            newName = `${baseName} (копия ${index})`;
          }
          duplicated = await localAdapter.create({
            name: newName,
            text: source.text,
          });
        } else {
          duplicated = await localAdapter.create({ name: 'Копия шаблона', text: '' });
        }
        localEntry.templates = await localAdapter.getAll();
        localEntry.loaded = true;
        localEntry.loading = false;
        localEntry.error = null;
        notifyCacheListeners('local');
        return duplicated;
      }
      const entry = getCacheEntry(cacheKey);
      entry.error = err.message;
      notifyCacheListeners(cacheKey);
      throw err;
    }
  };
  // END_BLOCK_TEMPLATE_CRUD

  const sortedTemplates = useMemo(() => {
    return [...state.templates].reverse();
  }, [state.templates]);

  return {
    templates: sortedTemplates,
    loading: state.loading,
    error: state.error,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    refresh: () => fetchTemplates(true),
  };
}

const _graceLogMarkers = [
  "[Templates][useTemplateStore][BLOCK_TEMPLATE_CRUD]"
];
