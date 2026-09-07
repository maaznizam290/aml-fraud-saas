"use client";

/**
 * Session/identity context (task sections 5, 13). Two modes, decided by
 * the server's own ORCHESTRATION_MODE (via GET /api/app-mode — never a
 * client-side flag that could drift from what the backend actually does):
 *
 * - REAL: a real Supabase Auth session is required. Role/organization come
 *   from the signed-in user's own `profiles` row, read with the anon key
 *   under RLS (never the service-role key — that never reaches the
 *   browser). No client-side role override exists in this mode.
 * - DEMO: no login is required. A fixed demo identity is used so an
 *   investor can explore every screen immediately; a role switcher lets
 *   them see the UI as each of the four roles. This is clearly labelled
 *   everywhere it appears — it must never be mistaken for real auth.
 *
 * Every role check this context enables is a UX convenience only — hiding
 * or disabling a control a user isn't supposed to use. The backend (RLS,
 * and each API route's own authorization) is the actual authority; nothing
 * here should ever be treated as a security boundary by a caller.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { createBrowserClient } from "../supabase/browserClient.js";
import type { UserRole } from "../supabase/types.js";
import { DEMO_ORGANIZATION_ID } from "../shared/constants.js";

export type AppMode = "DEMO" | "REAL" | "loading" | "error";

export interface Identity {
  userId: string;
  organizationId: string;
  role: UserRole;
  displayName: string;
  email: string | null;
}

export interface SessionState {
  appMode: AppMode;
  appModeError: string | null;
  identity: Identity | null;
  loading: boolean;
  /** DEMO mode only — lets an investor see the UI as any role. No-op in REAL mode. */
  setDemoRole: (role: UserRole) => void;
  signOut: () => Promise<void>;
}

const DEMO_IDENTITY_BASE: Omit<Identity, "role"> = {
  userId: "demo-user",
  organizationId: DEMO_ORGANIZATION_ID,
  displayName: "Demo Analyst",
  email: null,
};

// Exported for tests only — lets a test render a component tree under a
// fixed, synchronous session state without exercising the real
// fetch/Supabase-backed provider above.
export const SessionContext = createContext<SessionState | null>(null);

function supabaseConfigured(): boolean {
  return Boolean(process.env["NEXT_PUBLIC_SUPABASE_URL"] && process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [appMode, setAppMode] = useState<AppMode>("loading");
  const [appModeError, setAppModeError] = useState<string | null>(null);
  const [demoRole, setDemoRole] = useState<UserRole>("ADMIN");
  const [realIdentity, setRealIdentity] = useState<Identity | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/app-mode")
      .then(async (res) => {
        const body = (await res.json()) as { mode?: AppMode; error?: string; detail?: string };
        if (cancelled) return;
        if (!res.ok || !body.mode) {
          setAppMode("error");
          setAppModeError(body.detail ?? body.error ?? "Unable to determine application mode.");
          return;
        }
        setAppMode(body.mode);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAppMode("error");
        setAppModeError(err instanceof Error ? err.message : "Unable to reach the server.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (appMode !== "REAL" || !supabaseConfigured()) {
      setAuthLoading(false);
      return;
    }
    let cancelled = false;
    const supabase = createBrowserClient();

    async function loadFromSession(session: Session | null) {
      if (!session) {
        if (!cancelled) {
          setRealIdentity(null);
          setAuthLoading(false);
        }
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!profile || !profile.organization_id) {
        setRealIdentity(null);
      } else {
        setRealIdentity({
          userId: session.user.id,
          organizationId: profile.organization_id,
          role: profile.role,
          displayName: profile.full_name ?? profile.email,
          email: profile.email,
        });
      }
      setAuthLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => loadFromSession(data.session));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadFromSession(session);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [appMode]);

  const signOut = useCallback(async () => {
    if (!supabaseConfigured()) return;
    await createBrowserClient().auth.signOut();
    setRealIdentity(null);
  }, []);

  const identity = useMemo<Identity | null>(() => {
    if (appMode === "DEMO") return { ...DEMO_IDENTITY_BASE, role: demoRole };
    if (appMode === "REAL") return realIdentity;
    return null;
  }, [appMode, demoRole, realIdentity]);

  const value = useMemo<SessionState>(
    () => ({
      appMode,
      appModeError,
      identity,
      loading: appMode === "loading" || (appMode === "REAL" && authLoading),
      setDemoRole,
      signOut,
    }),
    [appMode, appModeError, identity, authLoading, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
