/**
 * UI-only mirror of lib/hermes/governance.ts's `VALID_ACTIONS_FROM` state
 * machine — used to decide which action buttons to render for a candidate
 * at a given status. The actual transition is still validated server-side
 * by governance.ts on every call; this only avoids rendering a button for
 * an action the server would reject outright.
 */
import type { GovernanceStatus } from "../supabase/types.js";

export type GovernanceAction = "REVIEW" | "APPROVE" | "VERSION" | "DEPLOY" | "REJECT";

export const VALID_ACTIONS_FROM: Record<GovernanceStatus, GovernanceAction[]> = {
  PROPOSED: ["REVIEW", "REJECT"],
  REVIEW: ["APPROVE", "REJECT"],
  APPROVED: ["VERSION"],
  VERSIONED: ["DEPLOY"],
  DEPLOYED: [],
};

export const ACTION_LABELS: Record<GovernanceAction, string> = {
  REVIEW: "Move to review",
  APPROVE: "Approve",
  VERSION: "Version",
  DEPLOY: "Deploy",
  REJECT: "Reject",
};
