// FILE: packages/web/src/modules/submit/StepImages.tsx
// VERSION: 2.6.0
// START_MODULE_CONTRACT
//   PURPOSE: Step 3: 'Загрузить' button + preview grid and step indicator
//   SCOPE: Presentational UI for Step 3 of form
//   DEPENDS: react, @vkontakte/vkui, ../images, ../ui-core
//   LINKS: M-SUBMIT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   StepImages - Step 3 form component with VKUI FormItem wrapping ImageUploader and StepIndicator
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.6.0 - Add noPadding to FormItem to reduce space below title]
//   PREVIOUS_CHANGES:
//     - [v2.5.0 - Update references of 'Загрузить с устройства' to 'Загрузить' per user request]
//     - [v2.4.0 - Update top label of FormItem to "Загрузите до 6-ти шт. менее 4 Мб" per user request]
//     - [v2.3.0 - Pass step={3} to StepIndicator to render only step 3 circle]
//     - [v2.2.0 - Remove step title prefix, render StepIndicator in .step-header wrapper for Phase-PR-1]
//     - [v2.1.0 - Remove visible <=2MB size limit label to support client-side compression up to 7MB hidden limit]
// END_CHANGE_SUMMARY

import React from 'react';
import { FormItem } from '@vkontakte/vkui';
import { ImageUploader } from '../images';
import { StepIndicator } from '../ui-core';

interface StepImagesProps {
  complete: boolean[];
}

// START_CONTRACT: StepImages
//   PURPOSE: Step 3: 'Загрузить' button + preview grid and step progress
//   INPUTS: { complete: boolean[] }
//   OUTPUTS: JSX.Element — VKUI FormItem wrapping ImageUploader
//   SIDE_EFFECTS: none (delegates to M-IMAGES)
//   LINKS: M-SUBMIT, M-IMAGES
// END_CONTRACT: StepImages
export const StepImages: React.FC<StepImagesProps> = ({ complete }) => {
  // START_BLOCK_SUBMIT_FLOW
  return (
    <div className="submit-step step-images" data-testid="step-images">
      <div className="step-header">
        <h2 className="step-title">Изображения</h2>
        <StepIndicator complete={complete} step={3} />
      </div>
      <FormItem top="Загрузите до 6-ти шт. менее 4 Мб" noPadding>
        <ImageUploader />
      </FormItem>
    </div>
  );
  // END_BLOCK_SUBMIT_FLOW
};