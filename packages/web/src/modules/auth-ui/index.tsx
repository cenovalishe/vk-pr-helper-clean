// START_MODULE_CONTRACT
//   PURPOSE: AuthUI page component with VK OneTap widget
//   SCOPE: AuthPage component rendering login UI, mounting OneTap widget
//   DEPENDS: M-AUTH, M-VKID-CLIENT
//   LINKS: M-AUTH-UI
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AuthPage - Component presenting the VK ID OneTap widget
//   AuthPageProps - type
// END_MODULE_MAP
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.4.0 - Replace inline SVG lock icon with WebP logo image]
//   PREVIOUS_CHANGES:
//     - [v2.3.0 - Update authorization page disclaimer message with standard VK ID terms and privacy policy links]
//     - [v2.2.5 - Use robust getRedirectUri helper from VkAuthProvider to prevent invalid localhost redirect URI in production]
//     - [v2.2.4 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//     - [v2.2.3 - Fix desktop shifting and scrollbar on auth page by using a standard centering div wrapper instead of conflicting VKUI SplitLayout/SplitCol]
//     - [v2.2.2 - Update greeting text: change "ролевые сообщества" to "ролевые поисковики"]
//     - [v2.2.1 - Center VK ID auth card cleanly on all devices, fix bottom-left offset and scroll overflow using position: fixed SplitLayout]
//     - [v2.2.0 - Replace redirect VK login button with inline VK ID OneTap widget, mounting it on mount via renderOneTap]
//     - [v2.1.0 - Removed FZ-152 compliance notice block and centered the authorization card panel using VKUI SplitLayout/SplitCol layout framework]
// END_CHANGE_SUMMARY

import React, { useEffect, useRef } from "react";
import { ConfigProvider, AdaptivityProvider, AppRoot, Button, Div, Title, Text, Card } from "@vkontakte/vkui";
import { useAuth } from "../auth/useAuth";
import { getRedirectUri } from "../auth/VkAuthProvider";
import { renderOneTap, init as initVkId } from "../vkid-client";

export interface AuthPageProps {
  appId?: number;
  redirectUri?: string;
  apiVersion?: string;
}

// START_CONTRACT: AuthPage
//   PURPOSE: Renders a VK ID OneTap widget for login (centered panel)
//   INPUTS: { appId?: number, redirectUri?: string, apiVersion?: string }
//   OUTPUTS: React UI element
//   SIDE_EFFECTS: mounts OneTap widget on mount, triggers useAuth.handleOneTapLogin on success
//   LINKS: M-AUTH-UI
// END_CONTRACT: AuthPage
export function AuthPage({
  appId,
  redirectUri,
  apiVersion,
}: AuthPageProps) {
  const { handleOneTapLogin } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    console.info('[AuthUI][BLOCK_VKID_ONETAP_MOUNT] Mounting OneTap widget');
    
    // Initialize VKID client before rendering
    const resolvedAppId = appId || Number(import.meta.env.VITE_VK_APP_ID || '54669660');
    const resolvedRedirectUri = getRedirectUri(redirectUri);
    initVkId(resolvedAppId, resolvedRedirectUri);

    renderOneTap(containerRef.current, {
      onSuccess: (tokenSet) => {
        handleOneTapLogin(tokenSet).catch((err) => {
          console.error('Failed to handle OneTap login success', err);
        });
      },
      onError: (err) => {
        console.error('OneTap widget error', err);
      }
    });
  }, [appId, redirectUri, handleOneTapLogin]);

  return (
    <ConfigProvider colorScheme="light">
      <AdaptivityProvider>
        <AppRoot>
          <div
            style={{
              background: "#edeef0",
              position: "fixed",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              boxSizing: "border-box",
            }}
          >
            <Card
              mode="shadow"
              style={{
                width: "100%",
                maxWidth: "440px",
                borderRadius: "8px",
                background: "#ffffff",
                border: "1px solid #e7e8ec",
                padding: "32px 24px",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
              }}
            >
              <Div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: 0 }}>
                <img
                  src="/logo.webp"
                  alt="Логотип"
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "12px",
                    marginBottom: "20px",
                    boxShadow: "0 4px 10px rgba(0, 0, 0, 0.08)",
                    objectFit: "cover",
                  }}
                />

                <Title level="1" style={{ color: "#2c2d2e", marginBottom: "10px", fontSize: "28px", fontWeight: "700" }}>
                  Пиар-помощник
                </Title>

                <Text style={{ color: "#6f7985", fontSize: "15px", lineHeight: "1.5", marginBottom: "28px" }}>
                  Управляйте рекламными шаблонами и предлагайте посты в ролевые поисковики ВКонтакте.
                </Text>

                <div 
                  ref={containerRef} 
                  id="vkid-onetap-container" 
                  style={{ 
                    width: "100%", 
                    height: "44px", // Default VK ID button height
                    marginBottom: "16px" 
                  }} 
                />

                <Text style={{ color: "#99a2ad", fontSize: "12px", lineHeight: "1.4" }}>
                  Продолжая, вы принимаете <a href="https://id.vk.ru/about/business/go/legal/vkid/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#2688eb", textDecoration: "none" }}>Пользовательское соглашение</a> и соглашаетесь с <a href="https://id.vk.ru/about/business/go/legal/vkid/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#2688eb", textDecoration: "none" }}>Политикой конфиденциальности</a> VK ID.
                </Text>
              </Div>
            </Card>
          </div>
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  );
}