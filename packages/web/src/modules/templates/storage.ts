// FILE: packages/web/src/modules/templates/storage.ts
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Implements TemplateStoragePort adapters for LocalStorage and YC REST API backend
//   SCOPE: LocalStorageAdapter and ApiTemplateStorageAdapter classes
//   DEPENDS: ./types, M-FE-API-CLIENT, @/shared/storage
//   LINKS: M-TEMPLATES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   LocalStorageAdapter - Local storage implementation of TemplateStoragePort
//   ApiTemplateStorageAdapter - YC REST API backend implementation of TemplateStoragePort
// END_MODULE_MAP

import { Template, TemplateData, TemplateStoragePort } from './types';
import { createLogger } from '@/shared/logger';
import { apiHttp, apiMutation } from '@/modules/api-client';
import { safeGetItem, safeSetItem } from '@/shared/storage';

const log = createLogger('Templates');

const STORAGE_KEY = 'grace_templates';

// MODULE_MAP
export class LocalStorageAdapter implements TemplateStoragePort {
  private getStorage(): Template[] {
    try {
      const data = safeGetItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e: any) {
      log.error('getStorage', 'BLOCK_STORAGE', 'Failed to parse templates from local storage', { error: e?.message || e });
      return [];
    }
  }

  private setStorage(templates: Template[]): void {
    try {
      safeSetItem(STORAGE_KEY, JSON.stringify(templates));
    } catch (e: any) {
      log.error('setStorage', 'BLOCK_STORAGE', 'Failed to save templates to local storage', { error: e?.message || e });
    }
  }

  async getAll(): Promise<Template[]> {
    return this.getStorage();
  }

  async getById(id: string): Promise<Template | null> {
    const templates = this.getStorage();
    return templates.find(t => t.id === id) || null;
  }

  async create(data: TemplateData): Promise<Template> {
    const templates = this.getStorage();
    const generatedId = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const newTemplate: Template = {
      id: generatedId,
      name: data.name,
      text: data.text,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    templates.push(newTemplate);
    this.setStorage(templates);
    return newTemplate;
  }

  async update(id: string, data: Partial<TemplateData>): Promise<Template> {
    const templates = this.getStorage();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error(`TEMPLATE_NOT_FOUND`);
    }
    const updatedTemplate = {
      ...templates[index],
      ...data,
      updatedAt: Date.now(),
    };
    templates[index] = updatedTemplate;
    this.setStorage(templates);
    return updatedTemplate;
  }

  async delete(id: string): Promise<void> {
    let templates = this.getStorage();
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) {
      throw new Error(`TEMPLATE_NOT_FOUND`);
    }
    templates.splice(index, 1);
    this.setStorage(templates);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export class ApiTemplateStorageAdapter implements TemplateStoragePort {
  constructor(private accessToken: string) {}

  async getAll(): Promise<Template[]> {
    const res = await withTimeout(
      apiHttp('/templates', this.accessToken, { method: 'GET' }),
      5000,
      'Превышено время ожидания ответа от сервера'
    );
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
    const list = await res.json();
    return list.map((t: any) => ({
      id: String(t.id),
      name: String(t.name),
      text: String(t.text),
      createdAt: Number(t.createdAt),
      updatedAt: Number(t.updatedAt),
    }));
  }

  async getById(id: string): Promise<Template | null> {
    const templates = await this.getAll();
    return templates.find(t => t.id === id) || null;
  }

  async create(data: TemplateData): Promise<Template> {
    const created = await withTimeout(
      apiMutation<any>('/templates', 'POST', { name: data.name, text: data.text }, this.accessToken),
      5000,
      'Превышено время ожидания ответа от сервера'
    );
    return {
      id: String(created.id),
      name: String(created.name),
      text: String(created.text),
      createdAt: Number(created.createdAt),
      updatedAt: Number(created.updatedAt),
    };
  }

  async update(id: string, data: Partial<TemplateData>): Promise<Template> {
    const updated = await withTimeout(
      apiMutation<any>(`/templates/${id}`, 'PATCH', { name: data.name ?? "", text: data.text ?? "" }, this.accessToken),
      5000,
      'Превышено время ожидания ответа от сервера'
    );
    return {
      id: String(updated.id),
      name: String(updated.name),
      text: String(updated.text),
      createdAt: Number(updated.createdAt),
      updatedAt: Number(updated.updatedAt),
    };
  }

  async delete(id: string): Promise<void> {
    await withTimeout(
      apiMutation<void>(`/templates/${id}`, 'DELETE', undefined, this.accessToken),
      5000,
      'Превышено время ожидания ответа от сервера'
    );
  }
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.3.0 - Update ApiTemplateStorageAdapter.getAll to propagate error status and code, matching apiMutation]
//   PREVIOUS_CHANGES:
//     - [v1.2.1 - Migrated LocalStorageAdapter to use safeGetItem and safeSetItem to avoid crashes in restricted mobile webviews]
//     - [v1.2.0 - Added 5-second timeouts to Convex queries and mutations in ApiTemplateStorageAdapter to prevent infinite hangs when backend is offline]
// END_CHANGE_SUMMARY
