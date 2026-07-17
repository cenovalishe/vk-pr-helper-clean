// FILE: packages/web/src/modules/tips/__tests__/tips.test.tsx
// VERSION: 2.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Verification tests for the TipsPage, FaqAccordion, and FeaturedCommunities components of M-TIPS module.
//   SCOPE: Checks layout rendering, dynamic avatar lookup hook integrations, toggle accordions, scroll-lock attributes, and link clicks with logging signals.
//   DEPENDS: vitest, @testing-library/react, @/modules/communities/avatars
//   LINKS: M-TIPS, V-M-TIPS, VF-014, VF-015
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   test - Unit/integration tests asserting Tips requirements
// END_MODULE_MAP

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { TipsPage } from '../TipsPage';
import { FaqAccordion } from '../FaqAccordion';
import { FeaturedCommunities } from '../FeaturedCommunities';

// Mock avatars hook to prevent API dependencies
vi.mock('@/modules/communities/avatars', () => ({
  useCommunityAvatars: (ids: string[]) => {
    const avatars = new Map<string, string>();
    ids.forEach((id) => {
      avatars.set(id, `http://mocked-avatar/${id}.jpg`);
    });
    return { avatars, isLoading: false, error: null };
  },
}));

describe('M-TIPS Module Integration', () => {
  let infoSpy: any;
  let windowOpenSpy: any;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('TipsPage Component', () => {
    it('TI-1: renders main container, header, and emits BLOCK_RENDER_TIPS log marker', () => {
      render(<TipsPage />);
      expect(screen.getByTestId('tips-page')).toBeInTheDocument();
      expect(screen.getByTestId('tips-header')).toBeInTheDocument();
      expect(screen.getByText('Подсказки')).toBeInTheDocument();
      expect(screen.getByTestId('tips-brand-card')).toBeInTheDocument();

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Tips][TipsPage][BLOCK_RENDER_TIPS]')
      );
    });

    it('renders brand card titles, descriptions, lists, and transitioning VK button', () => {
      render(<TipsPage />);
      const brandCard = screen.getByTestId('tips-brand-card');
      expect(brandCard).toHaveTextContent('Фаренгейтº');
      expect(screen.getByText(/Сервис бесплатный/)).toBeInTheDocument();
      expect(brandCard).toHaveTextContent('Помимо этого сервиса мы делаем');
      expect(brandCard).toHaveTextContent('много другого движа для ролевиков!');
      
      const btn = screen.getByTestId('learn-more-btn');
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://vk.ru/topic-233138455_55886890',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('clicking brand card redirect arrow redirects to Fahrenheit group, but title wrapper does not', () => {
      render(<TipsPage />);
      const brandCard = screen.getByTestId('tips-brand-card');
      const titleWrapper = brandCard.querySelector('.tips-brand-card__title-wrapper');
      const redirectArrow = brandCard.querySelector('.tips-brand-arrow');
      
      expect(titleWrapper).toBeInTheDocument();
      expect(redirectArrow).toBeInTheDocument();

      // Clicking title wrapper does NOT trigger redirect
      fireEvent.click(titleWrapper!);
      expect(windowOpenSpy).not.toHaveBeenCalled();

      // Clicking redirect arrow triggers redirect
      fireEvent.click(redirectArrow!);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://vk.ru/fare_n_gate',
        '_blank',
        'noopener,noreferrer'
      );

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Tips][TipsPage][BLOCK_FAHRENHEIT_REDIRECT]')
      );
    });
  });

  describe('FeaturedCommunities Component (VF-014)', () => {
    it('renders the 3 featured communities with mocked avatars and isOurs badges', () => {
      render(<FeaturedCommunities />);
      expect(screen.getByTestId('featured-communities')).toBeInTheDocument();

      // Check community name texts
      expect(screen.queryByText('Фаренгейтº')).toBeNull();
      expect(screen.getByText('Gate°')).toBeInTheDocument();
      expect(screen.getByText('Fare°')).toBeInTheDocument();
      expect(screen.getByText('Дом ВПИ')).toBeInTheDocument();

      // Check avatars src attribute
      const gateImg = screen.getByTestId('featured-avatar-featured-gate_me').querySelector('img');
      expect(gateImg).toBeInTheDocument();
      expect(gateImg?.getAttribute('src')).toBe('http://mocked-avatar/gate_me.jpg');

      // Verify that descriptions are rendered as badges
      const gateBadge = screen.getByTestId('featured-description-badge-featured-gate_me');
      expect(gateBadge).toBeInTheDocument();
      expect(gateBadge.textContent).toContain('общий поисковик');

      const fareBadge = screen.getByTestId('featured-description-badge-featured-fare_me');
      expect(fareBadge).toBeInTheDocument();
      expect(fareBadge.textContent).toContain('конкурсы и литклуб');

      const houseBadge = screen.getByTestId('featured-description-badge-featured-housevpi');
      expect(houseBadge).toBeInTheDocument();
      expect(houseBadge.textContent).toContain('жанровый поисковик');
    });

    it('clicking featured item redirect icon emits BLOCK_OPEN_FEATURED_LINK and opens VK link, but clicking row does not', () => {
      render(<FeaturedCommunities />);
      const fareRow = screen.getByTestId('featured-item-featured-fare_me');
      const linkIcon = fareRow.querySelector('.community-item__link');
      
      expect(fareRow).toBeInTheDocument();
      expect(linkIcon).toBeInTheDocument();

      // Clicking row itself does NOT trigger redirect
      fireEvent.click(fareRow);
      expect(windowOpenSpy).not.toHaveBeenCalled();

      // Clicking redirect icon triggers redirect
      fireEvent.click(linkIcon!);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://vk.ru/fare_me',
        '_blank',
        'noopener,noreferrer'
      );

      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Tips][FeaturedCommunities][BLOCK_OPEN_FEATURED_LINK]'),
        expect.any(Object)
      );
    });
  });

  describe('FaqAccordion Component (VF-015)', () => {
    it('renders list of 7 FAQ questions collapsed by default', () => {
      render(<FaqAccordion />);
      expect(screen.getByTestId('faq-accordion')).toBeInTheDocument();

      for (let i = 1; i <= 7; i++) {
        expect(screen.getByTestId(`faq-summary-faq-${i}`)).toBeInTheDocument();
        expect(screen.getByTestId(`faq-content-faq-${i}`)).toBeInTheDocument();
      }
    });

    it('clicking an item expands it, clicks again collapse, and emits BLOCK_TOGGLE_FAQ log', () => {
      render(<FaqAccordion />);
      const summary = screen.getByTestId('faq-summary-faq-1');

      // Click to expand
      fireEvent.click(summary);
      expect(infoSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Tips][FaqAccordion][BLOCK_TOGGLE_FAQ]'),
        expect.any(Object)
      );
    });

    it('renders the Google Sheet link inside the second FAQ item answer', () => {
      render(<FaqAccordion />);
      const sheetLink = screen.getByTestId('google-sheet-link');
      expect(sheetLink).toBeInTheDocument();
      expect(sheetLink.getAttribute('href')).toContain('docs.google.com/spreadsheets');
      expect(sheetLink.textContent).toBe('Срез по поисковикам');
    });

    it('TI-5: sets data-first-faq-active attribute on documentElement when the first question is active', () => {
      render(<FaqAccordion />);
      const summary1 = screen.getByTestId('faq-summary-faq-1');
      const summary2 = screen.getByTestId('faq-summary-faq-2');

      // Default: should be false
      expect(document.documentElement.getAttribute('data-first-faq-active')).toBe('false');

      // Expand first FAQ item
      fireEvent.click(summary1);
      expect(document.documentElement.getAttribute('data-first-faq-active')).toBe('true');

      // Collapse first FAQ item
      fireEvent.click(summary1);
      expect(document.documentElement.getAttribute('data-first-faq-active')).toBe('false');

      // Expand second FAQ item
      fireEvent.click(summary2);
      expect(document.documentElement.getAttribute('data-first-faq-active')).toBe('false');

      // Cleanup attributes after test
      document.documentElement.removeAttribute('data-first-faq-active');
    });
  });
});

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.1.0 - Add TI-5 test asserting data-first-faq-active attribute toggling on documentElement]
//   PREVIOUS_CHANGES:
//     - [v2.0.8 - Update FaqAccordion test to assert 7 items instead of 6]
//     - [v2.0.7 - Update brand card description assertion to handle split lines with br tag]
//     - [v2.0.6 - Update brand card description assertion for Hints/Instructions page]
//     - [v2.0.5 - Update vk.com links to vk.ru]
// END_CHANGE_SUMMARY
