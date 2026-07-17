// START_MODULE_CONTRACT
//   PURPOSE: Type definitions and interfaces for the Templates module.
//   SCOPE: Entities for template structure, template draft data, and the storage port contract.
//   DEPENDS: none
//   LINKS: M-TEMPLATES
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Template - Interface representing a saved template
//   TemplateData - Type representing draft template data (name and text)
//   TemplateStoragePort - Storage adapter interface for templates persistence
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.3.1 - Updated MODULE_CONTRACT and MODULE_MAP to satisfy standard GRACE lint profile]
// END_CHANGE_SUMMARY

/**
 * START_CONTRACT
 * @module M-TEMPLATES
 * @purpose Template data types and storage port abstraction
 * @layer 1
 * END_CONTRACT
 */

// MODULE_CONTRACT
export interface Template {
  id: string;
  name: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export type TemplateData = Pick<Template, 'name' | 'text'>;

export interface TemplateStoragePort {
  getAll(): Promise<Template[]>;
  getById(id: string): Promise<Template | null>;
  create(data: TemplateData): Promise<Template>;
  update(id: string, data: Partial<TemplateData>): Promise<Template>;
  delete(id: string): Promise<void>;
}

