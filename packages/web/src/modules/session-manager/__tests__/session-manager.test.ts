// FILE: packages/web/src/modules/session-manager/__tests__/session-manager.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Tests for SessionManager ensuring storing JWT in context and localStorage on login works correctly
//   SCOPE: session token persistence and hook validation
//   DEPENDS: M-SESSION-MANAGER
//   LINKS: M-SESSION-MANAGER, V-M-SESSION-MANAGER
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   scenario-SM1 - useSession returns isAuthenticated true and sessionToken jwt, and localStorage has sessionToken jwt
// END_MODULE_MAP

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Initial creation of SessionManager tests
// END_CHANGE_SUMMARY

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { SessionProvider, useSession } from "../index";

function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(SessionProvider, { children });
  };
}

describe("SessionManager", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("scenario-SM1: Stores JWT in context and localStorage on login", () => {
    const { result } = renderHook(() => useSession(), {
      wrapper: createWrapper(),
    });

    // Unauthenticated initially
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionToken).toBeNull();
    expect(localStorage.getItem("sessionToken")).toBeNull();

    // Authenticate
    act(() => {
      result.current.setSession("jwt-token-xyz");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.sessionToken).toBe("jwt-token-xyz");
    expect(localStorage.getItem("sessionToken")).toBe("jwt-token-xyz");

    // Clear session
    act(() => {
      result.current.setSession(null);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.sessionToken).toBeNull();
    expect(localStorage.getItem("sessionToken")).toBeNull();
  });
});
