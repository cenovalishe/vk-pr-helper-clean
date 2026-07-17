// FILE: packages/web/src/modules/communities/__tests__/communities.test.ts
// VERSION: 2.6.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for M-COMMUNITIES module
//   SCOPE: Testing static communities list, collapsible categories, and community items (scenarios C-1 to C-10, C-15, C-16)
//   DEPENDS: M-COMMUNITIES.CommunityList, M-COMMUNITIES.getCommunities, M-COMMUNITIES-AVATARS
//   LINKS: M-COMMUNITIES, V-M-COMMUNITIES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   no exported helper functions
// END_MODULE_MAP

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { CommunityList, clearCommunityListScrollCache, clearCollapsibleCategoryCache } from '../index';
import { getCommunities, COMMUNITIES, CLOSED_DISCLAIMER } from '../data';
import type { Community } from '../types';

// Mock the avatars hook to return deterministic avatar URLs
vi.mock('../avatars', () => ({
  useCommunityAvatars: (vkIds: (number | string)[]) => {
    const mockAvatars = new Map<number | string, string>();
    for (const id of vkIds) {
      const idStr = String(id);
      const match = idStr.match(/^(?:public|club)(\d+)$/);
      const numericId = match ? parseInt(match[1], 10) : 0;
      if (numericId > 0) {
        if (numericId !== 152524818) {
          mockAvatars.set(id, `http://example.com/avatar-${numericId}.jpg`);
          mockAvatars.set(numericId, `http://example.com/avatar-${numericId}.jpg`);
        }
      } else {
        // Custom name
        mockAvatars.set(id, `http://example.com/avatar-${idStr}.jpg`);
      }
    }
    return {
      avatars: mockAvatars,
      isLoading: false,
      error: null,
    };
  },
  fetchCommunityAvatars: vi.fn(),
}));

// Helper to expand a category
async function expandCategory(category: string) {
  const user = userEvent.setup();
  const toggle = screen.getByTestId(`category-toggle-${category}`);
  await user.click(toggle);
}

// ── Data accessor tests ────────────────────────────────────────────────

describe('getCommunities', () => {
  it('returns all 33 communities when no category is specified', () => {
    const result = getCommunities();
    expect(result).toHaveLength(33);
  });

  it('C-2: returns correct counts — Общие=19, Фандомные=5, ВПИ=4, Закрытые=5', () => {
    expect(getCommunities('general')).toHaveLength(19);
    expect(getCommunities('fandom')).toHaveLength(5);
    expect(getCommunities('vpi')).toHaveLength(4);
    expect(getCommunities('closed')).toHaveLength(5);
  });

  it('throws CATEGORY_NOT_FOUND for an invalid category', () => {
    expect(() => getCommunities('invalid' as any)).toThrow('CATEGORY_NOT_FOUND');
  });

  it('emits [Communities][getCommunities][BLOCK_LOAD_COMMUNITIES] log marker', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    getCommunities();
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Communities][getCommunities][BLOCK_LOAD_COMMUNITIES]'),
      expect.anything(),
    );
    infoSpy.mockRestore();
  });
});

// ── CommunityList UI tests ─────────────────────────────────────────────

describe('CommunityList', () => {
  const onSelect = vi.fn();

  beforeEach(() => {
    onSelect.mockClear();
    clearCommunityListScrollCache();
    clearCollapsibleCategoryCache();
  });

  afterEach(async () => {
    // Wait a brief moment to allow VKUI's useStateWithDelay active state timeouts to run
    // before Vitest tears down the JSDOM environment, avoiding "window is not defined" uncaught errors.
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  // C-1: All 4 categories render headers
  it('C-1: renders all 4 category headers — Общие, Фандомные, ВПИ, Закрытые', () => {
    render(React.createElement(CommunityList, { onSelect }));

    expect(screen.queryByText('Авторские')).not.toBeInTheDocument();
    expect(screen.getByText('Общие')).toBeInTheDocument();
    expect(screen.getByText('Фандомные')).toBeInTheDocument();
    expect(screen.getByText('ВПИ')).toBeInTheDocument();
    expect(screen.getByText('Закрытые')).toBeInTheDocument();
  });

  // C-16: authors category is removed
  it('C-16: does not render authors category toggle or section', () => {
    render(React.createElement(CommunityList, { onSelect }));

    expect(screen.queryByTestId('category-toggle-authors')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-authors')).not.toBeInTheDocument();
  });

  // C-6: Collapsed by default
  it('C-6: all 4 categories collapsed initially', () => {
    render(React.createElement(CommunityList, { onSelect }));

    const categories = ['general', 'fandom', 'vpi', 'closed'];
    for (const cat of categories) {
      const toggle = screen.getByTestId(`category-toggle-${cat}`);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      
      const groupSection = screen.getByTestId(`category-${cat}`);
      // Community item rows should NOT be rendered in the DOM
      expect(groupSection.querySelectorAll('.community-item-row')).toHaveLength(0);
    }
  });

  // C-7: Toggle expands/collapses category
  it('C-7: clicking CellButton chevron toggles category and aria-expanded flips', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    const toggle = screen.getByTestId('category-toggle-fandom');
    const groupSection = screen.getByTestId('category-fandom');

    // Initially collapsed
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(groupSection.querySelectorAll('.community-item-row')).toHaveLength(0);

    // Expand
    await expandCategory('fandom');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(groupSection.querySelectorAll('.community-item-row')).toHaveLength(5);

    // Collapse
    await expandCategory('fandom');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(groupSection.querySelectorAll('.community-item-row')).toHaveLength(0);
  });

  // C-2 (UI side): Correct counts when expanded
  it('C-2: renders correct number of community items per category when expanded', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');
    await expandCategory('fandom');
    await expandCategory('vpi');
    await expandCategory('closed');

    const generalSection = screen.getByTestId('category-general');
    const fandomSection = screen.getByTestId('category-fandom');
    const vpiSection = screen.getByTestId('category-vpi');
    const closedSection = screen.getByTestId('category-closed');

    expect(generalSection.querySelectorAll('.community-item-row')).toHaveLength(19);
    expect(fandomSection.querySelectorAll('.community-item-row')).toHaveLength(5);
    expect(vpiSection.querySelectorAll('.community-item-row')).toHaveLength(4);
    expect(closedSection.querySelectorAll('.community-item-row')).toHaveLength(5);
  });

  // C-3: Disclaimer inside closed
  it('C-3: closed category shows disclaimer when expanded', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('closed');
    const disclaimer = screen.getByTestId('closed-disclaimer');
    expect(disclaimer).toBeInTheDocument();
    expect(disclaimer.textContent).toContain('Перед подачей убедитесь, что вы подписаны');
  });

  // C-4: Each item renders Avatar, name, and link
  it('C-4: each expanded community item renders name and VK link', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');

    const firstGeneral = COMMUNITIES.find((c) => c.category === 'general')!;
    expect(screen.getByText(firstGeneral.name)).toBeInTheDocument();

    const link = screen.getByTestId(`community-link-${firstGeneral.id}`);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', firstGeneral.vkUrl);
  });

  // C-8: Avatar source and initials fallback
  it('C-8: CommunityItem renders Avatar with fetched url or fallback initials', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');

    // general-1 has vkId 36873781 which is mocked with a URL
    const avatar1 = screen.getByTestId('community-avatar-general-1');
    const img1 = avatar1.querySelector('img');
    expect(img1).toHaveAttribute('src', 'http://example.com/avatar-36873781.jpg');

    // general-2 has vkId 152524818 which is simulated as missing / fallback initials
    const avatar2 = screen.getByTestId('community-avatar-general-2');
    const img2 = avatar2.querySelector('img');
    // If image fails to load or no src, VKUI Avatar renders fallback children (first letter of name: "R")
    expect(img2).toBeNull();
    expect(avatar2.textContent).toBe('R');
  });

  // C-5: Row click fires onSelect
  it('C-5: onSelect callback fires with correct community data on row body click', async () => {
    const user = userEvent.setup();
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');

    const targetCommunity = COMMUNITIES.find((c) => c.category === 'general' && !c.isOurs)!;
    const row = screen.getByTestId(`community-${targetCommunity.id}`);

    await user.click(row);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: targetCommunity.id,
        name: targetCommunity.name,
      }),
    );
  });

  // C-9: stopPropagation on link click
  it('C-9: VK link button click opens link and does NOT fire onSelect (stopPropagation)', async () => {
    const user = userEvent.setup();
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');

    const targetCommunity = COMMUNITIES.find((c) => c.category === 'general')!;
    const linkButton = screen.getByTestId(`community-link-${targetCommunity.id}`);

    await user.click(linkButton);

    // onSelect must not be called because click on link stops propagation
    expect(onSelect).not.toHaveBeenCalled();
  });

  // C-10: Link button opens in new tab
  it('C-10: VK link button opens vkUrl in new tab with proper attributes', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');

    const targetCommunity = COMMUNITIES.find((c) => c.category === 'general')!;
    const linkButton = screen.getByTestId(`community-link-${targetCommunity.id}`);

    expect(linkButton).toHaveAttribute('href', targetCommunity.vkUrl);
    expect(linkButton).toHaveAttribute('target', '_blank');
    expect(linkButton).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders only a single category when category prop is provided', () => {
    render(React.createElement(CommunityList, { category: 'fandom', onSelect }));

    expect(screen.getByText('Фандомные')).toBeInTheDocument();
    expect(screen.queryByText('Общие')).not.toBeInTheDocument();
    expect(screen.queryByText('ВПИ')).not.toBeInTheDocument();
    expect(screen.queryByText('Закрытые')).not.toBeInTheDocument();
  });

  it('C-11: category expanded state and scroll position are persisted across unmount and remount', async () => {
    // 1. Render first instance
    const { unmount } = render(React.createElement(CommunityList, { onSelect }));

    // 2. Expand category
    const generalHeader = screen.getByTestId('category-toggle-general');
    expect(generalHeader).toHaveAttribute('aria-expanded', 'false');
    await expandCategory('general');
    expect(generalHeader).toHaveAttribute('aria-expanded', 'true');

    // Mock scroll on the container
    const container = screen.getByTestId('community-list');
    Object.defineProperty(container, 'scrollTop', {
      writable: true,
      configurable: true,
      value: 125,
    });
    // Trigger scroll event manually
    container.dispatchEvent(new Event('scroll'));

    // 3. Unmount
    unmount();

    // 4. Remount new instance
    render(React.createElement(CommunityList, { onSelect }));

    // 5. Verify states are restored
    const newGeneralHeader = screen.getByTestId('category-toggle-general');
    expect(newGeneralHeader).toHaveAttribute('aria-expanded', 'true');

    const newContainer = screen.getByTestId('community-list');
    expect(newContainer.scrollTop).toBe(125);
  });

  // C-15: renders isOurs badge
  it('C-15: renders "это мы" badge and ours layout for Gate and Дом ВПИ', async () => {
    render(React.createElement(CommunityList, { onSelect }));

    await expandCategory('general');
    await expandCategory('vpi');

    const generalOursBadge = screen.getByTestId('community-ours-hint-general-ours-1');
    expect(generalOursBadge).toBeInTheDocument();
    expect(generalOursBadge).toHaveTextContent('это мы');

    const vpiOursBadge = screen.getByTestId('community-ours-hint-vpi-ours-1');
    expect(vpiOursBadge).toBeInTheDocument();
    expect(vpiOursBadge).toHaveTextContent('это мы');
  });
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.5.0 - Add test verifying "без предложки" hint is rendered for suggestDisabled communities]
// END_CHANGE_SUMMARY
