// FILE: packages/web/src/modules/ui-core/__tests__/ui-core.test.tsx
// VERSION: 1.5.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-UI-CORE DesignPrimitives components
//   SCOPE: Unit testing OutlineCard, DashedBox, OutlineButton, CustomSelect, and StepIndicator rendering under desktop/mobile viewports
//   DEPENDS: M-UI-CORE, M-ADAPTIVE
//   LINKS: M-UI-CORE, V-M-UI-CORE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   no exported helper functions
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.5.0 - Update mobile viewport tests to expect no inline sizes on step indicators as we size them proportionally via CSS]
//   PREVIOUS_CHANGES:
//     - [v1.4.0 - Update mobile min-width/min-height expectations to 48.4px per 10% increase request]
//     - [v1.3.0 - Add unit test for step prop in StepIndicator]
//     - [v1.2.0 - Add UC-7, UC-8, UC-9 tests for StepIndicator component for Phase-PR-1]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OutlineCard, DashedBox, OutlineButton, CustomSelect, StepIndicator } from '../index';
import { useIsMobile } from '../../adaptive';

// Mock adaptive module to control isMobile value in tests
vi.mock('../../adaptive', () => ({
  useIsMobile: vi.fn(),
}));

describe('DesignPrimitives Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('UC-1: OutlineCard renders with children and border style class', () => {
    render(<OutlineCard data-testid="card">Hello Card</OutlineCard>);
    const card = screen.getByTestId('card');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('ui-outline-card');
    expect(card.textContent).toBe('Hello Card');
  });

  it('UC-2: DashedBox renders dashed border placeholder', () => {
    render(<DashedBox data-testid="box">Upload Slot</DashedBox>);
    const box = screen.getByTestId('box');
    expect(box).toBeInTheDocument();
    expect(box.className).toContain('ui-dashed-box');
    expect(box.textContent).toBe('Upload Slot');
  });

  it('UC-3: OutlineButton renders styled button wrapper', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(<OutlineButton data-testid="btn">Send Post</OutlineButton>);
    const btn = screen.getByTestId('btn');
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.className).toContain('ui-outline-button');
    expect(btn.textContent).toBe('Send Post');
  });

  it('UC-4: CustomSelect wraps VKUI CustomSelect with outline design class', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <CustomSelect data-testid="select-wrapper">
        <select>
          <option>Option 1</option>
        </select>
      </CustomSelect>
    );
    const wrapper = screen.getByTestId('select-wrapper');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.className).toContain('ui-custom-select');
    expect(wrapper.querySelector('select')).toBeInTheDocument();
  });

  // UC5
  it('UC-5: CustomSelect scales font-size to 16px and min-height to 44px on mobile (prevent iOS zoom)', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);
    
    // Desktop Case
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = render(
      <CustomSelect data-testid="select">
        <select data-testid="native-select">
          <option>Option 1</option>
        </select>
      </CustomSelect>
    );
    expect(screen.getByTestId('select').style.minHeight).toBe('');
    expect(screen.getByTestId('native-select').style.fontSize).toBe('');
    expect(screen.getByTestId('native-select').style.minHeight).toBe('');

    // Mobile Case
    mockUseIsMobile.mockReturnValue(true);
    rerender(
      <CustomSelect data-testid="select">
        <select data-testid="native-select">
          <option>Option 1</option>
        </select>
      </CustomSelect>
    );
    expect(screen.getByTestId('select').style.minHeight).toBe('44px');
    expect(screen.getByTestId('native-select').style.fontSize).toBe('16px');
    expect(screen.getByTestId('native-select').style.minHeight).toBe('44px');
  });

  // UC6
  it('UC-6: OutlineButton scales min-height to 44px and font-size to 16px on mobile for touch targets', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    // Desktop Case
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = render(<OutlineButton data-testid="btn">Button</OutlineButton>);
    expect(screen.getByTestId('btn').style.minHeight).toBe('');
    expect(screen.getByTestId('btn').style.fontSize).toBe('');

    // Mobile Case
    mockUseIsMobile.mockReturnValue(true);
    rerender(<OutlineButton data-testid="btn">Button</OutlineButton>);
    expect(screen.getByTestId('btn').style.minHeight).toBe('44px');
    expect(screen.getByTestId('btn').style.fontSize).toBe('16px');
  });

  // StepIndicator tests
  describe('StepIndicator', () => {
    it('UC-7: renders 3 circles labelled 1/2/3 with correct aria-labels', () => {
      vi.mocked(useIsMobile).mockReturnValue(false);
      render(<StepIndicator complete={[false, false, false]} />);
      
      const indicator = screen.getByTestId('step-indicator');
      expect(indicator).toBeInTheDocument();
      
      const step1 = screen.getByTestId('step-indicator-circle-1');
      expect(step1).toHaveAttribute('aria-label', 'step 1/3');
      expect(step1.textContent).toBe('1');
      
      const step2 = screen.getByTestId('step-indicator-circle-2');
      expect(step2).toHaveAttribute('aria-label', 'step 2/3');
      expect(step2.textContent).toBe('2');
      
      const step3 = screen.getByTestId('step-indicator-circle-3');
      expect(step3).toHaveAttribute('aria-label', 'step 3/3');
      expect(step3.textContent).toBe('3');
    });

    it('UC-8: toggles circle data-state attributes and logs on change', () => {
      vi.mocked(useIsMobile).mockReturnValue(false);
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      const { rerender } = render(<StepIndicator complete={[true, false, false]} />);
      
      expect(screen.getByTestId('step-indicator-circle-1')).toHaveAttribute('data-state', 'filled');
      expect(screen.getByTestId('step-indicator-circle-2')).toHaveAttribute('data-state', 'empty');
      expect(screen.getByTestId('step-indicator-circle-3')).toHaveAttribute('data-state', 'empty');
      
      expect(debugSpy).not.toHaveBeenCalled();

      // Change complete state
      rerender(<StepIndicator complete={[true, true, false]} />);
      
      expect(screen.getByTestId('step-indicator-circle-1')).toHaveAttribute('data-state', 'filled');
      expect(screen.getByTestId('step-indicator-circle-2')).toHaveAttribute('data-state', 'filled');
      expect(screen.getByTestId('step-indicator-circle-3')).toHaveAttribute('data-state', 'empty');
      
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('[UI-Core][StepIndicator][BLOCK_STEP_STATE]'),
        expect.anything()
      );
      
      debugSpy.mockRestore();
    });

    it('UC-9: does not render when complete has fewer than 3 elements', () => {
      vi.mocked(useIsMobile).mockReturnValue(false);
      const { container } = render(<StepIndicator complete={[true, false]} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders only the single circle specified by step prop', () => {
      vi.mocked(useIsMobile).mockReturnValue(false);
      const { rerender } = render(<StepIndicator complete={[true, false, false]} step={2} />);
      
      const indicator = screen.getByTestId('step-indicator');
      expect(indicator).toBeInTheDocument();
      
      const step2 = screen.getByTestId('step-indicator-circle-2');
      expect(step2).toHaveAttribute('data-state', 'empty');
      expect(step2.textContent).toBe('2');
      
      expect(screen.queryByTestId('step-indicator-circle-1')).toBeNull();
      expect(screen.queryByTestId('step-indicator-circle-3')).toBeNull();
      
      rerender(<StepIndicator complete={[true, false, false]} step={1} />);
      
      const step1 = screen.getByTestId('step-indicator-circle-1');
      expect(step1).toHaveAttribute('data-state', 'filled');
      expect(step1.textContent).toBe('1');
      
      expect(screen.queryByTestId('step-indicator-circle-2')).toBeNull();
      expect(screen.queryByTestId('step-indicator-circle-3')).toBeNull();
    });

    it('does not apply 48.4px inline style override on mobile viewport, letting CSS handle it', () => {
      vi.mocked(useIsMobile).mockReturnValue(true);
      render(<StepIndicator complete={[true, false, false]} />);
      
      const step1 = screen.getByTestId('step-indicator-circle-1');
      expect(step1.style.minWidth).toBe('');
      expect(step1.style.minHeight).toBe('');
    });
  });
});
