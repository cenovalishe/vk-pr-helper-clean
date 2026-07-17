// FILE: packages/web/src/modules/communities/__tests__/community-item.test.tsx
// VERSION: 2.5.1
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for CommunityItem component
//   SCOPE: Unit testing CommunityItem styling, mobile viewport adaptations (scenario C14), and selection logic
//   DEPENDS: M-COMMUNITIES, M-ADAPTIVE
//   LINKS: V-M-COMMUNITIES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   none - test files do not export runtime symbols
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.5.1 - Update vkUrl mock links to vk.ru]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CommunityItem } from '../CommunityItem';
import { useIsMobile } from '../../adaptive';
import type { Community } from '../types';

// Mock adaptive module to control isMobile value in tests
vi.mock('../../adaptive', () => ({
  useIsMobile: vi.fn(),
}));

const mockCommunity: Community = {
  id: '12345',
  name: 'Тестовое сообщество',
  shortName: 'test_club',
  vkUrl: 'https://vk.ru/test_club',
  category: 'general',
};

const mockOursCommunity: Community = {
  id: 'ours-123',
  name: 'Наше сообщество',
  shortName: 'ours_club',
  vkUrl: 'https://vk.ru/ours_club',
  category: 'general',
  isOurs: true,
};

const mockDisabledCommunity: Community = {
  id: 'disabled-123',
  name: 'Закрытый паблик',
  shortName: 'disabled_club',
  vkUrl: 'https://vk.ru/disabled_club',
  category: 'general',
  suggestDisabled: true,
};

describe('CommunityItem Component (Phase-MOBILE-ADAPT)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders community name, initials, and VK link', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    render(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
      />
    );

    expect(screen.getByText('Тестовое сообщество')).toBeInTheDocument();
    expect(screen.getByText('Т')).toBeInTheDocument(); // Initials fallback
    expect(screen.getByTestId('community-link-12345')).toHaveAttribute('href', mockCommunity.vkUrl);
  });

  // C14: Mobile compact styling
  it('C14: applies compact styling (avatar 28px, tighter padding, font 13px) on mobile', () => {
    const mockUseIsMobile = vi.mocked(useIsMobile);

    // Desktop viewport case
    mockUseIsMobile.mockReturnValue(false);
    const { rerender } = render(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
      />
    );

    const rowDesktop = screen.getByTestId('community-12345');
    const avatarDesktop = screen.getByTestId('community-avatar-12345');
    const nameDesktop = screen.getByText('Тестовое сообщество');

    expect(rowDesktop.style.padding).toBe('');
    expect(avatarDesktop.style.width).toBe('');
    expect(avatarDesktop.style.height).toBe('');
    expect(nameDesktop.style.fontSize).toBe('');

    // Mobile viewport case
    mockUseIsMobile.mockReturnValue(true);
    rerender(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
      />
    );

    const rowMobile = screen.getByTestId('community-12345');
    const avatarMobile = screen.getByTestId('community-avatar-12345');
    const nameMobile = screen.getByText('Тестовое сообщество');

    expect(rowMobile.style.padding).toBe('4px 6px');
    expect(avatarMobile.style.width).toBe('28px');
    expect(avatarMobile.style.height).toBe('28px');
    expect(nameMobile.style.fontSize).toBe('13px');
  });

  // C-17: selectedId propagation, class, and checkmark
  it('C-17: applies community-item-row--selected and shows checkmark when selected', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    
    render(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
        selectedId="12345"
      />
    );

    const row = screen.getByTestId('community-12345');
    expect(row).toHaveClass('community-item-row--selected');

    const checkmark = screen.getByTestId('community-checkmark-12345');
    expect(checkmark).toBeInTheDocument();
  });

  // C-15 & C-18: isOurs styling and isOurs + selected intersection
  it('C-15 & C-18: preserves community-item-row--ours when selected, and shows "это мы" badge', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);

    const { rerender } = render(
      <CommunityItem
        community={mockOursCommunity}
        onSelect={() => {}}
        selectedId={null}
      />
    );

    const row = screen.getByTestId('community-ours-123');
    expect(row).toHaveClass('community-item-row--ours');
    expect(row).not.toHaveClass('community-item-row--selected');

    const badge = screen.getByTestId('community-ours-hint-ours-123');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('это мы');

    // Rerender as selected
    rerender(
      <CommunityItem
        community={mockOursCommunity}
        onSelect={() => {}}
        selectedId="ours-123"
      />
    );

    const rowSelected = screen.getByTestId('community-ours-123');
    expect(rowSelected).toHaveClass('community-item-row--ours');
    expect(rowSelected).toHaveClass('community-item-row--selected');
  });

  // C-20: Selection flip logging
  it('C-20: logs selection highlight flip exactly once when selectedId changes', () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const { rerender } = render(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
        selectedId={null}
      />
    );

    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('BLOCK_SELECTED_RENDER'),
      expect.anything()
    );

    // Flip selection to true
    rerender(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
        selectedId="12345"
      />
    );

    const getSelectedRenderLogs = () => debugSpy.mock.calls.filter(call => 
      typeof call[0] === 'string' && call[0].includes('BLOCK_SELECTED_RENDER')
    );

    expect(getSelectedRenderLogs()).toHaveLength(1);
    expect(getSelectedRenderLogs()[0][0]).toContain('[Communities][CommunityItem][BLOCK_SELECTED_RENDER] Selection highlight flipped for 12345: isSelected=true');

    // Flip back
    rerender(
      <CommunityItem
        community={mockCommunity}
        onSelect={() => {}}
        selectedId="other"
      />
    );

    expect(getSelectedRenderLogs()).toHaveLength(2);
    expect(getSelectedRenderLogs()[1][0]).toContain('[Communities][CommunityItem][BLOCK_SELECTED_RENDER] Selection highlight flipped for 12345: isSelected=false');

    debugSpy.mockRestore();
  });

  // C-12 & C-13: suggestDisabled behavior
  it('C-12 & C-13: renders "без предложки" and prevents row click for suggestDisabled', async () => {
    vi.mocked(useIsMobile).mockReturnValue(false);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <CommunityItem
        community={mockDisabledCommunity}
        onSelect={onSelect}
      />
    );

    const hint = screen.getByTestId('community-hint-disabled-123');
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveTextContent('без предложки');

    const row = screen.getByTestId('community-disabled-123');
    await user.click(row);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
