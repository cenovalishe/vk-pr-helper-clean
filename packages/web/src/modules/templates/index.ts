// START_MODULE_CONTRACT
//   PURPOSE: Re-exports module components and types.
//   SCOPE: Public exports for the templates module including storage, store hooks, components, and views.
//   DEPENDS: none
//   LINKS: M-TEMPLATES
//   ROLE: BARREL
//   MAP_MODE: SUMMARY
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   exports - Module aggregations
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.3.2 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v2.3.1 - Updated MODULE_CONTRACT to satisfy standard GRACE lint profile]
// END_CHANGE_SUMMARY

/**
 * START_CONTRACT
 * @module M-TEMPLATES
 * @purpose Main exports for the Templates module
 * @layer 1
 * END_CONTRACT
 */

export * from './types';
export * from './storage';
export * from './useTemplateStore';
export * from './TemplateList';
export * from './TemplateEditor';
export { TemplatesContainer as default } from './TemplatesContainer';

