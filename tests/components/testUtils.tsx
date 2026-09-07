import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { SessionContext, type Identity, type SessionState } from "../../lib/auth/session.js";
import type { UserRole } from "../../lib/supabase/types.js";

export const TEST_ORG_ID = "org-test-0001";

export function makeIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    userId: "user-test-1",
    organizationId: TEST_ORG_ID,
    role: "ADMIN",
    displayName: "Test Analyst",
    email: "analyst@example.test",
    ...overrides,
  };
}

export function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    appMode: "DEMO",
    appModeError: null,
    identity: makeIdentity(),
    loading: false,
    setDemoRole: () => {},
    signOut: async () => {},
    ...overrides,
  };
}

export function renderWithSession(ui: ReactElement, session: Partial<SessionState> = {}) {
  const value = makeSessionState(session);
  return render(<SessionContext.Provider value={value}>{ui}</SessionContext.Provider>);
}

export function renderAsRole(ui: ReactElement, role: UserRole) {
  return renderWithSession(ui, { identity: makeIdentity({ role }) });
}

/** Installs a `fetch` mock for the duration of one test. Pass a map of
 * URL-substring -> JSON response (checked in insertion order). */
export function mockFetchJson(responses: Array<[string | RegExp, unknown, number?]>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [match, body, status] of responses) {
      const hit = typeof match === "string" ? url.includes(match) : match.test(url);
      if (hit) {
        return new Response(JSON.stringify(body), {
          status: status ?? 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    throw new Error(`mockFetchJson: no handler registered for ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
