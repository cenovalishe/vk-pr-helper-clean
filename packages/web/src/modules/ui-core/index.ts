// FILE: packages/web/src/modules/ui-core/index.ts
// VERSION: 1.1.1
// START_MODULE_CONTRACT
//   PURPOSE: Reusable outline UI components matching Screenshot_28
//   SCOPE: OutlineCard, DashedBox, OutlineButton, CustomSelect wrapper components, and StepIndicator
//   DEPENDS: none
//   LINKS: M-UI-CORE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   OutlineCard        - White card with black outline border and rounded corners
//   DashedBox          - Aspect-ratio 1:1 box with dashed outline for upload placeholder
//   OutlineButton      - Button component with outline border and hover transitions
//   CustomSelect       - Wrapper component that applies custom outline overrides to select dropdowns
//   StepIndicator      - Component rendering 3 progress circles
//   StepIndicatorProps - Props interface for StepIndicator
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.1.1 - Replace wildcard export from StepIndicator with explicit exports to resolve lint warning]
//   PREVIOUS_CHANGES:
//     - [v1.1.0 - Add and export StepIndicator component for Phase-PR-1]
//     - [v1.0.1 - Add native select fallback styling for CustomSelect]
// END_CHANGE_SUMMARY

import React from 'react';
import { useIsMobile } from '../adaptive';
import './ui-core.css';

export { StepIndicator } from './StepIndicator';
export type { StepIndicatorProps } from './StepIndicator';

// START_CONTRACT: OutlineCard
//   PURPOSE: Outlined card container
//   INPUTS: props: React.HTMLAttributes<HTMLDivElement>
//   OUTPUTS: JSX.Element
//   SIDE_EFFECTS: none
//   LINKS: M-UI-CORE
// END_CONTRACT: OutlineCard
export function OutlineCard({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // START_BLOCK_OUTLINE_CARD
  return React.createElement(
    'div',
    {
      className: `ui-outline-card ${className || ''}`,
      ...props,
    },
    children
  );
  // END_BLOCK_OUTLINE_CARD
}

// START_CONTRACT: DashedBox
//   PURPOSE: Aspect-ratio 1:1 dashed box for upload placeholders
//   INPUTS: props: React.HTMLAttributes<HTMLDivElement>
//   OUTPUTS: JSX.Element
//   SIDE_EFFECTS: none
//   LINKS: M-UI-CORE
// END_CONTRACT: DashedBox
export function DashedBox({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // START_BLOCK_DASHED_BOX
  return React.createElement(
    'div',
    {
      className: `ui-dashed-box ${className || ''}`,
      ...props,
    },
    children
  );
  // END_BLOCK_DASHED_BOX
}

// START_CONTRACT: OutlineButton
//   PURPOSE: Outlined button component
//   INPUTS: props: React.ButtonHTMLAttributes<HTMLButtonElement>
//   OUTPUTS: JSX.Element
//   SIDE_EFFECTS: none
//   LINKS: M-UI-CORE
// END_CONTRACT: OutlineButton
export function OutlineButton({ children, className, type = 'button', style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // START_BLOCK_OUTLINE_BUTTON
  const isMobile = useIsMobile();
  const mobileStyle: React.CSSProperties = isMobile ? {
    fontSize: '16px',
    minHeight: '44px',
  } : {};

  return React.createElement(
    'button',
    {
      type,
      className: `ui-outline-button ${className || ''}`,
      style: { ...mobileStyle, ...style },
      ...props,
    },
    children
  );
  // END_BLOCK_OUTLINE_BUTTON
}

// START_CONTRACT: CustomSelect
//   PURPOSE: Wraps VKUI Select/CustomSelect or native select with outline style class
//   INPUTS: props: React.HTMLAttributes<HTMLDivElement>
//   OUTPUTS: JSX.Element
//   SIDE_EFFECTS: none
//   LINKS: M-UI-CORE
// END_CONTRACT: CustomSelect
export function CustomSelect({ children, className, style, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // START_BLOCK_CUSTOM_SELECT
  const isMobile = useIsMobile();
  const mobileStyle: React.CSSProperties = isMobile ? {
    minHeight: '44px',
  } : {};

  const clonedChildren = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      const childStyle = (child.props as any).style || {};
      return React.cloneElement(child, {
        style: {
          ...childStyle,
          ...(isMobile ? { fontSize: '16px', minHeight: '44px' } : {}),
        }
      } as any);
    }
    return child;
  });

  return React.createElement(
    'div',
    {
      className: `ui-custom-select ${className || ''}`,
      style: { ...mobileStyle, ...style },
      ...props,
    },
    clonedChildren
  );
  // END_BLOCK_CUSTOM_SELECT
}
