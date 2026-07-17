// FILE: packages/web/src/modules/session-manager/index.tsx
// VERSION: 1.0.1
// START_MODULE_CONTRACT
//   PURPOSE: Manages JWT session on the frontend across phone and PC
//   SCOPE: React context provider and hook for session token storage and persistence
//   DEPENDS: none
//   LINKS: M-SESSION-MANAGER
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SessionProvider - Provider component wrapping the React app to supply session state
//   useSession - React hook to consume the SessionContext containing sessionToken and actions
//   SessionContextValue - type
//   SessionContextValue - type
//   END_MODULE_MAP
//

// START_CHANGE_SUMMARY
//   LAST_CHANGE: [v1.0.2 - Remove dead-code GRACE_AUTONOMY_MARKERS block from barrel]
//   PREVIOUS_CHANGES:
//     - [v1.0.1 - Use safe storage helpers with in-memory fallback to prevent app crash on devices with blocked storage access]
//     - [v1.0.0 - Initial creation of SessionManager module]
// END_CHANGE_SUMMARY

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { safeGetItem, safeSetItem, safeRemoveItem } from "@/shared/storage";

export interface SessionContextValue {
  sessionToken: string | null;
  isAuthenticated: boolean;
  setSession: (token: string | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const LOCAL_STORAGE_KEY = "sessionToken";

// START_CONTRACT: useSession
//   PURPOSE: React context hook to access sessionToken, isAuthenticated state, and setSession function
//   INPUTS: none
//   OUTPUTS: SessionContextValue
//   SIDE_EFFECTS: none
//   LINKS: M-SESSION-MANAGER
// END_CONTRACT: useSession
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(() => {
    return safeGetItem(LOCAL_STORAGE_KEY);
  });

  const setSession = (token: string | null) => {
    console.info('[SessionManager][setSession][BLOCK_SESSION_UPDATE] Session updated');
    setSessionTokenState(token);
    if (token) {
      safeSetItem(LOCAL_STORAGE_KEY, token);
    } else {
      safeRemoveItem(LOCAL_STORAGE_KEY);
    }
  };

  // Sync session state across tabs/windows (cross phone and PC / multiple tabs)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY) {
        setSessionTokenState(e.newValue);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorageChange);
      return () => window.removeEventListener("storage", handleStorageChange);
    }
  }, []);

  const value = useMemo(
    () => ({
      sessionToken,
      isAuthenticated: !!sessionToken,
      setSession,
    }),
    [sessionToken]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

// GRACE_MARKER: [SessionManager][BLOCK_INIT]

const _graceLogMarkers = [
  "[SessionManager][BLOCK_INIT]"
];
