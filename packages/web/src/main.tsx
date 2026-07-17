// FILE: packages/web/src/main.tsx
// VERSION: 1.3.0
// START_MODULE_CONTRACT
//   PURPOSE: Entry point for the web application, initializing React and REST API client with fallback environment variables
//   SCOPE: Boots the application, configures providers
//   DEPENDS: M-FE-API-CLIENT, M-AUTH, M-SESSION-MANAGER, @vkontakte/vkui
//   LINKS: none
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.4.0 - Clean up legacy ConvexProviderWrapper from tree]
//   PREVIOUS_CHANGES:
//     - [v1.3.0 - Wrap root components in VKUI ConfigProvider and AdaptivityProvider to enable useAdaptivityConditionalRender inside layout hooks]
//     - [v1.2.0 - Wrap VkAuthProvider in SessionProvider to prevent white screen / hook error]
//     - [v1.1.1 - Fix env var name: VITE_VK_OAUTH_REDIRECT_URI → VITE_VK_OAUTH_REDIRECT_URL to match VkAuthProvider and VK ID dashboard convention]
// END_CHANGE_SUMMARY

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, AdaptivityProvider } from '@vkontakte/vkui';
import '@vkontakte/vkui/dist/vkui.css';
import { VkAuthProvider } from '@/modules/auth';
import { SessionProvider } from '@/modules/session-manager';
import { App } from './App';

const vkAppId = Number(import.meta.env.VITE_VK_APP_ID || '54669660');
const redirectUri = window.location.origin;
const apiVersion = String(import.meta.env.VITE_VK_API_VERSION || '5.131');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider colorScheme="light">
      <AdaptivityProvider>
        <BrowserRouter>
          <SessionProvider>
            <VkAuthProvider appId={vkAppId} redirectUri={redirectUri} apiVersion={apiVersion}>
              <App />
            </VkAuthProvider>
          </SessionProvider>
        </BrowserRouter>
      </AdaptivityProvider>
    </ConfigProvider>
  </StrictMode>
);