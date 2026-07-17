// FILE: packages/web/src/modules/submit/StepCommunity.tsx
// VERSION: 3.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Step 1: selection indicator matching VK UI style with readOnly non-clickable input
//   SCOPE: Presentational UI for Step 1 of form
//   DEPENDS: react, ../communities, ../ui-core, @/shared/logger
//   LINKS: M-SUBMIT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   StepCommunity - Step 1 form component using custom styled non-clickable input and step indicator
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v3.5.0 - Remove input clickability and focus capability; set pointer-events: none and tabIndex: -1 on input to make it remain gray without hover effect]
//   PREVIOUS_CHANGES:
//     - [v3.4.0 - Remove step-hint text above input and update placeholder on desktop to "Выберите поисковик из меню справа" per user request]
//     - [v3.3.0 - Pass step={1} to StepIndicator to render only step 1 circle]
//     - [v3.2.0 - Remove title step prefix, render StepIndicator in .step-header wrapper for Phase-PR-1]
// END_CHANGE_SUMMARY

import React from 'react';
import { Icon28MenuOutline } from '@vkontakte/icons';
import { Community } from '../communities';
import { createLogger } from '@/shared/logger';
import { useIsMobile } from '../adaptive';
import { StepIndicator } from '../ui-core';

const logger = createLogger('Submit');

interface StepCommunityProps {
  community: Community | null;
  onOpenMenu?: () => void;
  complete: boolean[];
}

// START_CONTRACT: StepCommunity
//   PURPOSE: Step 1: display selected community and step progress
//   INPUTS: { community: Community | null, onOpenMenu: () => void, complete: boolean[] }
//   OUTPUTS: JSX.Element — Step 1 form input container with non-clickable community-input
//   SIDE_EFFECTS: logs BLOCK_SUBMIT_FLOW community-selected when a Community object is provided
//   LINKS: M-SUBMIT, V-M-SUBMIT scenario-S8, scenario-S9
// END_CONTRACT: StepCommunity
export const StepCommunity: React.FC<StepCommunityProps> = ({ community, onOpenMenu, complete }) => {
  const isMobile = useIsMobile();

  // START_BLOCK_SUBMIT_FLOW
  React.useEffect(() => {
    if (community) {
      const _logMarker = "[Submit][StepCommunity][BLOCK_SUBMIT_FLOW] community-selected";
      logger.info('StepCommunity', 'BLOCK_SUBMIT_FLOW', 'community-selected', { id: community.id });
    }
  }, [community]);

  const value = community ? community.vkUrl || community.name : '';
  // END_BLOCK_SUBMIT_FLOW

  return (
    <div className="submit-step step-community" data-testid="step-community">
      <div className="step-header">
        <h2 className="step-title">Сообщество</h2>
        <StepIndicator complete={complete} step={1} />
      </div>
      <div className="input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="text"
          value={value}
          readOnly
          tabIndex={-1}
          placeholder={isMobile ? "Выберите сообщество" : "Выберите поисковик из меню справа"}
          data-testid="community-input"
          aria-label="Выбранное сообщество"
          className={`submit-input ${!community ? 'submit-input--empty' : ''}`}
          style={{
            pointerEvents: 'none',
            ...(isMobile ? { fontSize: '16px', paddingRight: '48px' } : {})
          }}
        />
        {isMobile && (
          <button 
            type="button"
            className="submit-mobile-menu-btn"
            onClick={onOpenMenu}
            aria-label="Открыть меню поисковиков"
          >
            <Icon28MenuOutline />
          </button>
        )}
      </div>
    </div>
  );
};