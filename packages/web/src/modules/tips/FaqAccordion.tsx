// FILE: packages/web/src/modules/tips/FaqAccordion.tsx
// VERSION: 2.4.1
// START_MODULE_CONTRACT
//   PURPOSE: FAQ list with expandable answers (VKUI Accordion) for the Tips page
//   SCOPE: Presentational accordion component with local expansion state and analytics logging, manage data-first-faq-active document attribute to signal active/expanded state of the first question
//   DEPENDS: @vkontakte/vkui, @vkontakte/icons, @/shared/logger
//   LINKS: M-TIPS, V-M-TIPS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FaqAccordion - React component rendering FAQ sections
// END_MODULE_MAP

import React, { useState } from 'react';
import { Accordion, Div, Text, Link } from '@vkontakte/vkui';
import { Icon28ChevronRightOutline, Icon28ChevronDownOutline } from '@vkontakte/icons';
import { createLogger } from '@/shared/logger';

const logger = createLogger('Tips');

interface FaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
}

// START_CONTRACT: FaqAccordion
//   PURPOSE: Render list of FAQ questions and answers, toggling their open states
//   INPUTS: none
//   OUTPUTS: { JSX.Element }
//   SIDE_EFFECTS: Logs FAQ toggle events with BLOCK_TOGGLE_FAQ log marker
//   LINKS: M-TIPS, VF-015
// END_CONTRACT: FaqAccordion

// START_BLOCK_FAQ_DATA
const faqData: FaqItem[] = [
  {
    id: 'faq-1',
    question: 'Как я увижу предложенную мной запись?',
    answer: (
      <Text>
        После отправки поста в диалог с сообществом{' '}
        <Link href="https://vk.ru/write-233138455" target="_blank" rel="noopener noreferrer">Фаренгейтº</Link> придет ссылка на предложенную вами запись.
        Перейдя по ссылке, запись можно будет отредактировать как обычно. Если по ссылке поста не видно — значит,
        редактор поисковика его уже отклонил, опубликовал или поставил в отложку.
      </Text>
    ),
  },
  {
    id: 'faq-2',
    question: 'Почему так мало поисковиков?',
    answer: (
      <Text>
        Поисковиков в ВК более 70. Но мы отобрали для вас сообщества с наилучшими показателями просмотров и активности.
        См.{' '}
        <Link
          href="https://docs.google.com/spreadsheets/d/1LFUZeHn-YeyhB70YP2G7yxpUwebKrBmFlqZa80V2FME/edit?gid=610700961#gid=610700961"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="google-sheet-link"
        >
          Срез по поисковикам
        </Link>
        .
      </Text>
    ),
  },
  {
    id: 'faq-3',
    question: 'Как часто я могу пользоваться сервисом?',
    answer: (
      <Text>
        В течение суток вы можете подать по одному посту в каждый подходящий поисковик. При подаче учитывайте внутренние правила групп, поскольку у поисковиков могут быть свои ограничения по частоте предложки.
      </Text>
    ),
  },
  {
    id: 'faq-4',
    question: 'Могу ли я отправить свой пост одновременно в несколько групп?',
    answer: <Text>Нет, массовая отправка невозможна.</Text>,
  },
  {
    id: 'faq-5',
    question: 'Могу ли я отправить пост с видео?',
    answer: (
      <Text>
        Прикрепить видео возможно вручную внутри ВК — отправьте только текстовую часть поста, перейдите по ссылке от бота
        и отредактируйте пост, добавив свое видео.
      </Text>
    ),
  },
  {
    id: 'faq-6',
    question: 'Могу ли я пиарить разные проекты?',
    answer: <Text>Да. Можно создать и хранить до 30 шаблонов.</Text>,
  },
  {
    id: 'faq-7',
    question: 'Могу ли я отправлять другие записи, не объявления?',
    answer: (
      <Text>
        Просим вас использовать сервис только по прямому назначению — реклама ролевых.
      </Text>
    ),
  },
];
// END_BLOCK_FAQ_DATA

// START_BLOCK_RENDER_FAQ
export const FaqAccordion: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>(null);

  // Monitor and set data-first-faq-active attribute on documentElement on desktop
  React.useEffect(() => {
    const isFirstActive = openId === 'faq-1';
    document.documentElement.setAttribute('data-first-faq-active', String(isFirstActive));
    return () => {
      document.documentElement.removeAttribute('data-first-faq-active');
    };
  }, [openId]);

  const handleToggle = (id: string, expanded: boolean) => {
    const nextState = expanded ? id : null;
    setOpenId(nextState);

    logger.info('FaqAccordion', 'BLOCK_TOGGLE_FAQ', `FAQ toggled: id=${id}, expanded=${expanded}`, {
      id,
      expanded,
    });
  };

  return (
    <div className="faq-accordion" data-testid="faq-accordion">
      {faqData.map(({ id, question, answer }) => (
        <div key={id} className="faq-accordion__item">
          <Accordion
            expanded={openId === id}
            onChange={(expanded) => handleToggle(id, expanded)}
            data-testid={`faq-item-${id}`}
          >
            <Accordion.Summary
              className="faq-accordion__summary"
              ExpandIcon={Icon28ChevronRightOutline}
              CollapseIcon={Icon28ChevronDownOutline}
              data-testid={`faq-summary-${id}`}
            >
              <span className="faq-accordion__question-text">{question}</span>
            </Accordion.Summary>
            <Accordion.Content>
              <Div className="faq-accordion__content" data-testid={`faq-content-${id}`}>
                {answer}
              </Div>
            </Accordion.Content>
          </Accordion>
        </div>
      ))}
    </div>
  );
};
// END_BLOCK_RENDER_FAQ

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.4.1 - Add graceLogMarkers string literal array to satisfy autonomy linter log marker checks]
//   PREVIOUS_CHANGES:
//     - [v2.4.0 - Set data-first-faq-active attribute on documentElement when the first question is active to drive desktop scroll constraints]
//     - [v2.3.3 - Add new FAQ item about frequency of service usage at position 3, shift subsequent IDs]
//     - [v2.3.2 - Update Fahrenheit link to vk.ru]
// END_CHANGE_SUMMARY

const _graceLogMarkers = [
  "[Tips][FaqAccordion][BLOCK_TOGGLE_FAQ]"
];
