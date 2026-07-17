// @vitest-environment jsdom
// FILE: packages/web/src/modules/auth-ui/__tests__/auth-ui.test.tsx
// VERSION: 2.2.3
// START_MODULE_CONTRACT
//   PURPOSE: Tests for AuthUi ensuring OneTap widget mounting and test bypass button work correctly
//   SCOPE: rendering, OneTap widget mounting validation, and test bypass trigger validation
//   DEPENDS: M-AUTH-UI, M-AUTH, M-VKID-CLIENT
//   LINKS: M-AUTH-UI, V-M-AUTH-UI
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   scenario-AUI1 - AuthPage renders OneTap widget container on mount, calls renderOneTap, and emits trace
//   scenario-AUI2 - AuthPage no longer renders test bypass button (security hardening: removed from prod)
// END_MODULE_MAP
//
// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v2.2.3 - Clean up DOM between tests using cleanup(), use standard Vitest assertions instead of jest-dom matchers]
//   PREVIOUS_CHANGES:
//     - [v2.2.0 - Update tests for VK ID OneTap widget mounting and mock vkid-client renderOneTap]
//     - [v2.1.0 - Removed FZ-152 compliance notice checks as part of disclaimer removal]
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AuthPage } from "../index";
import { useAuth } from "../../auth/useAuth";
import { renderOneTap } from "../../vkid-client";

// Mock useAuth hook
vi.mock("../../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mock vkid-client
vi.mock("../../vkid-client", () => ({
  renderOneTap: vi.fn(),
  init: vi.fn(),
}));

describe("AuthUI (v2.2.0 VK ID Authentication UI)", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    cleanup();
  });

  it("scenario-AUI1: AuthPage renders OneTap widget container on mount, calls renderOneTap, and emits trace.", () => {
    const mockHandleOneTapLogin = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      handleOneTapLogin: mockHandleOneTapLogin,
      logout: vi.fn(),
      login: vi.fn(),
      isAuthenticated: false,
      accessToken: null,
      sessionToken: null,
      userId: null,
    });

    const { container } = render(<AuthPage />);

    // Check title and description
    expect(screen.getByText("Пиар-помощник")).not.toBeNull();
    expect(screen.getByText(/Управляйте рекламными шаблонами/)).not.toBeNull();

    // Check widget container
    const onetapContainer = container.querySelector("#vkid-onetap-container");
    expect(onetapContainer).not.toBeNull();

    // Verify renderOneTap was called
    expect(renderOneTap).toHaveBeenCalledWith(onetapContainer, expect.any(Object));

    // Verify trace log marker was output
    const calls = consoleSpy.mock.calls.flat();
    expect(calls.some(c => typeof c === 'string' && c.includes('[AuthUI][BLOCK_VKID_ONETAP_MOUNT]'))).toBe(true);
  });

  it("scenario-AUI2: AuthPage no longer renders test bypass button (security hardening)", () => {
    vi.mocked(useAuth).mockReturnValue({
      handleOneTapLogin: vi.fn(),
      logout: vi.fn(),
      login: vi.fn(),
      isAuthenticated: false,
      accessToken: null,
      sessionToken: null,
      userId: null,
    });

    render(<AuthPage />);

    // Verify the bypass button is no longer rendered in production
    expect(screen.queryByRole("button", { name: "Пропустить авторизацию (Тест)" })).toBeNull();
  });
});
