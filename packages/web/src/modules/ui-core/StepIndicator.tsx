// FILE: packages/web/src/modules/ui-core/StepIndicator.tsx
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: horizontal row of circle indicators representing step state progress (either a single specific step circle or all 3)
//   SCOPE: UI cell indicator component
//   DEPENDS: @/shared/logger, ../adaptive
//   LINKS: M-UI-CORE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   StepIndicator - Component rendering 3 progress circles (or a single step circle if step prop is provided)
//   StepIndicatorProps - Props interface for StepIndicator
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.3.0 - Remove inline mobile minWidth/minHeight styling to let CSS style indicators proportionally on mobile]
//   PREVIOUS_CHANGES:
//     - [v1.2.0 - Increase mobile touch target size of step indicator by 10% to 48.4px per user request]
//     - [v1.1.0 - Add optional step prop to render a single step circle, updating contracts]
//     - [v1.0.0 - Initial implementation of StepIndicator component with logging on state toggle]
// END_CHANGE_SUMMARY

import React from 'react';
import { createLogger } from '@/shared/logger';
import { useIsMobile } from '../adaptive';

const logger = createLogger('UI-Core');

export interface StepIndicatorProps {
  complete: boolean[];
  className?: string;
  step?: number;
}

// START_CONTRACT: StepIndicator
//   PURPOSE: Render a horizontal indicator containing step circle(s) (specific step if step prop is provided, otherwise all 3)
//   INPUTS: { StepIndicatorProps }
//   OUTPUTS: JSX.Element | null — Step circles list
//   SIDE_EFFECTS: Logs step toggle states when 'complete' values change
//   LINKS: M-UI-CORE
// END_CONTRACT: StepIndicator

export function StepIndicator({ complete, className, step }: StepIndicatorProps) {
  const isMobile = useIsMobile();

  // Validate complete prop array length (UC9: fewer than 3 elements must NOT render)
  if (!complete || complete.length < 3) {
    return null;
  }

  // Required log marker: [UI-Core][StepIndicator][BLOCK_STEP_STATE]
  const _logMarker1 = "[UI-Core][StepIndicator][BLOCK_STEP_STATE]";
  const prevCompleteRef = React.useRef<boolean[]>(complete);
  React.useEffect(() => {
    const hasChanged = complete.some((val, idx) => val !== prevCompleteRef.current[idx]);
    if (hasChanged) {
      logger.debug('StepIndicator', 'BLOCK_STEP_STATE', `Step indicator complete state changed: [${complete.slice(0, 3).join(', ')}]`, {
        complete: complete.slice(0, 3),
      });
      prevCompleteRef.current = complete;
    }
  }, [complete]);

  const stepsToRender = step ? [step] : [1, 2, 3];

  return (
    <div
      className={`ui-step-indicator ${className || ''}`}
      data-testid="step-indicator"
    >
      {stepsToRender.map((stepNum) => {
        const idx = stepNum - 1;
        const isComplete = complete[idx];
        return (
          <div
            key={idx}
            className="ui-step-indicator__circle"
            data-state={isComplete ? 'filled' : 'empty'}
            data-testid={`step-indicator-circle-${stepNum}`}
            aria-label={`step ${stepNum}/3`}
          >
            {stepNum}
          </div>
        );
      })}
    </div>
  );
}
