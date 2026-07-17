/**
 * @grace_module Submit
 */

// START_MODULE_CONTRACT
//   PURPOSE: 3-step submission form orchestrating community selection, template/text input, image attachment, and final suggest post to предложка from user's account
//   SCOPE: Public barrel exports for M-SUBMIT
//   DEPENDS: M-TEMPLATES, M-COMMUNITIES, M-IMAGES, M-VK-API, M-LAYOUT
//   LINKS: M-SUBMIT
//   ROLE: BARREL
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SubmitForm - Main 3-step form component
//   StepCommunity - Step 1/3: hint text + URL input field
//   StepText - Step 2/3: template dropdown + text area
//   StepImages - Step 3/3: 'Загрузить' button + preview grid
//   SubmitResult - Shape of VK suggest post response
// END_MODULE_MAP

export { SubmitForm } from './SubmitForm';
export { StepCommunity } from './StepCommunity';
export { StepText } from './StepText';
export { StepImages } from './StepImages';
export type { SubmitResult } from './types';

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.2.1 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v2.2.0 - Update references of 'Загрузить с устройства' to 'Загрузить' per user request]
//     - [v2.1.0 - Phase-6: Remove unused CommunityPickerModal export]
// END_CHANGE_SUMMARY
