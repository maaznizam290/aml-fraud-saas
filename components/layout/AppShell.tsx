"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { useSession } from "../../lib/auth/session.js";
import { LoadingState, ErrorState } from "../ui/states.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { SignInPrompt } from "./SignInPrompt.js";

/**
 * The authenticated app frame around every internal page (task section 10:
 * desktop-first, but usable down to tablet — the sidebar collapses behind
 * a toggle below `lg`). Handles the three states every page would
 * otherwise have to repeat: still determining app mode, a real-mode
 * visitor who isn't signed in, and the normal signed-in/demo case.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { appMode, appModeError, identity, loading } = useSession();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading Meridian AML…" />
      </div>
    );
  }

  if (appMode === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <ErrorState title="Unable to reach the server" detail={appModeError ?? undefined} />
      </div>
    );
  }

  if (appMode === "REAL" && !identity) {
    return <SignInPrompt />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-page">
      <Sidebar className="hidden lg:flex" />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-ink-primary/40" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
          <div className="relative z-50 flex h-full">
            <Sidebar />
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation menu"
              className="mt-4 ml-2 h-9 w-9 shrink-0 rounded-full bg-surface-raised text-ink-secondary shadow-card"
            >
              <X className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileNavOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
