"use client";

import { cloneElement } from "react";

import { useSession } from "../lib/auth/session.js";
import type { UserRole } from "../lib/supabase/types.js";

/**
 * Hides (or, with `disable`, shows-but-disables) children when the current
 * identity's role doesn't satisfy `test`. UX gating only — see
 * lib/auth/roles.ts's module docstring: the backend is the real boundary.
 */
export function RoleGate({
  test,
  disable,
  fallback = null,
  children,
}: {
  test: (role: UserRole | undefined) => boolean;
  disable?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactElement;
}) {
  const { identity } = useSession();
  const allowed = test(identity?.role);

  if (allowed) return children;
  if (disable) {
    return (
      <span title="You don't have permission to do this.">
        {cloneElement(children, { disabled: true, "aria-disabled": true } as Partial<unknown>)}
      </span>
    );
  }
  return <>{fallback}</>;
}
