"use client";

import { Menu } from "lucide-react";

import { useSession } from "../../lib/auth/session.js";
import { ROLE_LABELS } from "../../lib/auth/roles.js";
import type { UserRole } from "../../lib/supabase/types.js";
import { Button } from "../ui/button.js";

const ALL_ROLES: UserRole[] = ["ADMIN", "COMPLIANCE_MANAGER", "ANALYST", "VIEWER"];

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { appMode, identity, setDemoRole } = useSession();

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-line bg-surface-raised px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label="Open navigation menu">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
        {appMode === "DEMO" && (
          <span className="hidden items-center gap-1.5 rounded-full bg-status-warning/15 px-2.5 py-1 text-xs font-medium text-[#8a5a00] sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-status-warning" aria-hidden="true" />
            Demo mode — synthetic data
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {appMode === "DEMO" && (
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            View as
            <select
              className="rounded-md border border-line bg-surface-raised px-2 py-1 text-xs text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              value={identity?.role ?? "ADMIN"}
              onChange={(e) => setDemoRole(e.target.value as UserRole)}
              aria-label="Preview the app as a different role (demo mode only)"
            >
              {ALL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
        )}
        {identity && (
          <div className="flex items-center gap-2 text-sm">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white"
              aria-hidden="true"
            >
              {identity.displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="font-medium text-ink-primary">{identity.displayName}</p>
              <p className="text-xs text-ink-muted">{ROLE_LABELS[identity.role]}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
