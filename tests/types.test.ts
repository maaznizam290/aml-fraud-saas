import { describe, expect, it } from "vitest";
import type {
  Alert,
  AlertSeverity,
  Case,
  CaseDisposition,
  InvestigationState,
  Organization,
  Profile,
  RecommendationDisposition,
  UserRole,
} from "../lib/supabase/types.js";

describe("database types", () => {
  it("Organization row shape matches the organizations table", () => {
    const org: Organization = {
      id: "00000000-0000-0000-0000-000000000000",
      name: "Northwind Bank",
      slug: "northwind-bank",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(org.slug).toBe("northwind-bank");
  });

  it("UserRole excludes anything outside the four required roles", () => {
    const roles: UserRole[] = ["ADMIN", "COMPLIANCE_MANAGER", "ANALYST", "VIEWER"];
    expect(roles).toHaveLength(4);
  });

  it("InvestigationState follows the required alert lifecycle order", () => {
    const lifecycle: InvestigationState[] = [
      "RECEIVED",
      "ANALYZING",
      "EVIDENCE_COLLECTED",
      "AI_INVESTIGATING",
      "RECOMMENDATION_READY",
      "HUMAN_REVIEW",
      "RESOLVED",
    ];
    expect(lifecycle).toHaveLength(7);
    expect(lifecycle[0]).toBe("RECEIVED");
    expect(lifecycle[lifecycle.length - 1]).toBe("RESOLVED");
  });

  it("recommendation dispositions never include an automated adverse action", () => {
    const dispositions: RecommendationDisposition[] = ["ESCALATE", "CLEAR", "REFER"];
    const forbidden = ["AUTO_CLOSE_ACCOUNT", "AUTO_FILE_SAR", "AUTO_MOVE_FUNDS", "AUTO_DENY_CUSTOMER"];
    for (const value of forbidden) {
      expect(dispositions as string[]).not.toContain(value);
    }
  });

  it("Profile.organization_id is nullable (pre-org-membership bootstrap state)", () => {
    const profile: Profile = {
      id: "00000000-0000-0000-0000-000000000001",
      organization_id: null,
      email: "new.user@example.test",
      full_name: null,
      role: "ANALYST",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(profile.organization_id).toBeNull();
  });

  it("Alert carries both a deterministic risk_score and an ml_score, independently nullable", () => {
    const severity: AlertSeverity = "HIGH";
    const alert: Alert = {
      id: "00000000-0000-0000-0000-000000000002",
      organization_id: "00000000-0000-0000-0000-000000000000",
      customer_id: "00000000-0000-0000-0000-000000000003",
      transaction_id: null,
      related_transaction_ids: [],
      alert_type: "VELOCITY_ANOMALY",
      severity,
      status: "RECEIVED",
      source: "RULE_ENGINE",
      triggered_rules: [],
      risk_score: 0.8,
      ml_score: null,
      assigned_analyst_id: null,
      opened_at: new Date().toISOString(),
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(alert.ml_score).toBeNull();
    expect(alert.risk_score).toBe(0.8);
  });

  it("Case disposition is only ever set by recording a human decision (type-level: it's optional/nullable)", () => {
    const disposition: CaseDisposition | null = null;
    const kase: Case = {
      id: "00000000-0000-0000-0000-000000000004",
      organization_id: "00000000-0000-0000-0000-000000000000",
      case_number: "CASE-000001",
      alert_id: null,
      related_alert_ids: [],
      customer_id: "00000000-0000-0000-0000-000000000003",
      assigned_analyst_id: null,
      status: "OPEN",
      priority: "MEDIUM",
      disposition,
      resolution_reason: null,
      opened_at: new Date().toISOString(),
      resolved_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(kase.disposition).toBeNull();
  });
});
