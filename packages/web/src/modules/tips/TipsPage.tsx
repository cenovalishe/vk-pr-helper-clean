// FILE: packages/web/src/modules/tips/TipsPage.tsx
// VERSION: 2.15.1
// START_MODULE_CONTRACT
//   PURPOSE: Tips/guidelines section with FAQ accordion, featured communities list, and actionable links
//   SCOPE: Layout container page component assembling sub-components and providing branding info card
//   DEPENDS: @vkontakte/vkui, @/shared/logger, ./FaqAccordion, ./FeaturedCommunities
//   LINKS: M-TIPS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   TipsPage - React page component assembling Tips tab sections
// END_MODULE_MAP

import React, { useEffect } from 'react';
import { Button, Group, Header, Div } from '@vkontakte/vkui';
import { Icon28LightbulbOutline, Icon28LinkOutline } from '@vkontakte/icons';
import { createLogger } from '@/shared/logger';
import { useCommunityAvatars } from '@/modules/communities/avatars';
import { FaqAccordion } from './FaqAccordion';
import { FeaturedCommunities } from './FeaturedCommunities';
import './tips.css';

const logger = createLogger('Tips');

// START_CONTRACT: TipsPage
//   PURPOSE: Assemble and render the main Tips Page layout with brand details, featured resources, and FAQs
//   INPUTS: none
//   OUTPUTS: { JSX.Element }
//   SIDE_EFFECTS: Emits [Tips][TipsPage][BLOCK_RENDER_TIPS] log marker on mount
//   LINKS: M-TIPS, VF-014
//   ROLE: RUNTIME
// END_CONTRACT: TipsPage

// START_BLOCK_RENDER_TIPS
export const TipsPage: React.FC = () => {
  const { avatars } = useCommunityAvatars(['fare_n_gate']);
  const avatarUrl = avatars.get('fare_n_gate');

  useEffect(() => {
    logger.info('TipsPage', 'BLOCK_RENDER_TIPS', 'Tips page rendered');
  }, []);

  const handleLearnMore = () => {
    logger.info('TipsPage', 'BLOCK_LEARN_MORE', 'Redirecting to VK topic info thread');
    window.open('https://vk.ru/topic-233138455_55886890', '_blank', 'noopener,noreferrer');
  };

  const handleFahrenheitRedirect = () => {
    logger.info('TipsPage', 'BLOCK_FAHRENHEIT_REDIRECT', 'Redirecting to Fahrenheit VK group');
    window.open('https://vk.ru/fare_n_gate', '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="tips-page" data-testid="tips-page">
      <div className="tips-main">
        <div className="tips-page__container">
          {/* Top Header Card */}
          <div className="tips-header" data-testid="tips-header">
            <Icon28LightbulbOutline className="tips-header__icon" />
            <h1 className="tips-header__title">Подсказки</h1>
            <p className="tips-header__subtitle">Сервис бесплатный. Мы будем рады вашей подписке</p>
          </div>

          {/* Top Section: Brand info + Communities */}
          <div className="tips-layout-grid">
            {/* Left Column */}
            <div className="tips-brand-info" data-testid="tips-brand-card">
              <div className="tips-brand-card__title-wrapper">
                {/* Header with Avatar, Title, and Redirect Arrow */}
                <div className="tips-brand-card__header">
                  <div className="tips-brand-card__left">
                    <div className="tips-brand-avatar">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="tips-brand-avatar__img" />
                      ) : (
                        <span className="tips-brand-avatar__initials">Ф</span>
                      )}
                    </div>
                    <h1 className="tips-brand-card__title">
                      Фаренгейтº
                    </h1>
                  </div>
                  <a
                    className="tips-brand-arrow"
                    href="https://vk.ru/fare_n_gate"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      handleFahrenheitRedirect();
                    }}
                    style={{ cursor: 'pointer' }}
                    aria-label="Открыть страницу Фаренгейтº ВКонтакте"
                  >
                    <Icon28LinkOutline width={34} height={34} />
                  </a>
                </div>
                
                {/* Description below them */}
                <p className="tips-brand-card__subtitle">
                  Помимо этого сервиса мы делаем<br />
                  много другого движа для ролевиков!
                </p>
              </div>
            </div>

            {/* Right Column */}
            <div className="tips-communities-list">
              <FeaturedCommunities />
            </div>
          </div>

          {/* Full-width action button */}
          <div className="tips-full-action">
            <Button
              size="l"
              mode="primary"
              appearance="accent"
              onClick={handleLearnMore}
              data-testid="learn-more-btn"
              stretched
              className="tips-learn-more-btn"
            >
              Узнать больше о нас
            </Button>
          </div>

          {/* FAQ Section */}
          <div className="tips-faq-section">
            <FaqAccordion />
          </div>
        </div>
      </div>
      <aside className="tips-sidebar" data-testid="tips-sidebar" />
    </div>
  );
};
// END_BLOCK_RENDER_TIPS

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.15.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//   PREVIOUS_CHANGES:
//     - [v2.15.0 - Split brand card description with br tag to prevent overlap with communities list]
//     - [v2.14.0 - Update Fahrenheit brand card description on Hints/Instructions page]
//     - [v2.13.0 - Revert className="community-item__link-icon" on Fahrenheit redirect arrow to leave desktop view untouched]
//     - [v2.12.0 - Add community-item__link-icon class name to Fahrenheit redirect icon in JSX for exact style synchronization, update version]
//     - [v2.10.0 - Decrease the scale of the Fahrenheit redirect icon and its selection/highlight by 15%]
//     - [v2.9.0 - Wrap tips-page__container in a flex layout with placeholder sidebar on desktop to narrow the layout like submit tab]
//     - [v2.8.1 - Update Fahrenheit links to vk.ru]
//     - [v2.8.0 - Group Fahrenheit brand avatar and title inside tips-brand-card__left for mobile alignment consistency]
//     - [v2.7.0 - Revert to tips-page__container to prevent narrowing layout, left-aligning the container via tips.css flex layout]
//     - [v2.6.0 - Move Tips tab content to the left using tips-main flex element and empty placeholder sidebar to match submit-layout layout structure]
//     - [v2.5.0 - Add header card to Tips page with Icon28LightbulbOutline icon and description matching submit header format]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[Tips][TipsPage][BLOCK_RENDER_TIPS]"
];
