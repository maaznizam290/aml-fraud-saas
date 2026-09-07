/**
 * Role-capability mapping for UX gating only (task section 5) — mirrors,
 * but does not replace, the backend's own authorization: governance role
 * checks live in lib/hermes/governance.ts, RLS policies live in
 * supabase/migrations. If this file and the backend ever disagree, the
 * backend wins; a hidden/disabled control here is a convenience, not a
 * boundary.
 */
import type { UserRole } from "../supabase/types.js";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrator",
  COMPLIANCE_MANAGER: "Compliance Manager",
  ANALYST: "Analyst",
  VIEWER: "Viewer",
};

const REVIEW_ROLES = new Set<UserRole>(["ADMIN", "COMPLIANCE_MANAGER", "ANALYST"]);
const GOVERNANCE_ROLES = new Set<UserRole>(["ADMIN", "COMPLIANCE_MANAGER"]);
const PROPOSE_ROLES = new Set<UserRole>(["ADMIN", "COMPLIANCE_MANAGER", "ANALYST"]);

export function canReviewAlerts(role: UserRole | undefined): boolean {
  return !!role && REVIEW_ROLES.has(role);
}

export function canResolveCases(role: UserRole | undefined): boolean {
  return !!role && REVIEW_ROLES.has(role);
}

export function canGovern(role: UserRole | undefined): boolean {
  return !!role && GOVERNANCE_ROLES.has(role);
}

export function canPropose(role: UserRole | undefined): boolean {
  return !!role && PROPOSE_ROLES.has(role);
}

export function canManageSettings(role: UserRole | undefined): boolean {
  return role === "ADMIN";
}

export function canRunDemoSimulator(role: UserRole | undefined): boolean {
  return !!role;
}
