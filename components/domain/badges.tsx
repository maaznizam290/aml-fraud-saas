import { Badge } from "../ui/badge.js";
import type {
  AlertSeverity,
  CaseStatus,
  GovernanceStatus,
  InvestigationState,
  RecommendationDisposition,
} from "../../lib/supabase/types.js";

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  const map: Record<AlertSeverity, { variant: "good" | "warning" | "serious" | "critical"; label: string }> = {
    LOW: { variant: "good", label: "Low" },
    MEDIUM: { variant: "warning", label: "Medium" },
    HIGH: { variant: "serious", label: "High" },
    CRITICAL: { variant: "critical", label: "Critical" },
  };
  const { variant, label } = map[severity];
  return <Badge variant={variant}>{label}</Badge>;
}

export function InvestigationStatusBadge({ status }: { status: InvestigationState }) {
  const labels: Record<InvestigationState, string> = {
    RECEIVED: "Received",
    ANALYZING: "Analyzing",
    EVIDENCE_COLLECTED: "Evidence collected",
    AI_INVESTIGATING: "AI investigating",
    RECOMMENDATION_READY: "Recommendation ready",
    HUMAN_REVIEW: "Human review",
    RESOLVED: "Resolved",
  };
  const variant = status === "RESOLVED" ? "good" : status === "HUMAN_REVIEW" ? "warning" : "brand";
  return <Badge variant={variant}>{labels[status]}</Badge>;
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const map: Record<CaseStatus, { variant: "good" | "warning" | "brand" | "neutral" | "serious"; label: string }> = {
    OPEN: { variant: "brand", label: "Open" },
    IN_PROGRESS: { variant: "warning", label: "In progress" },
    PENDING_REVIEW: { variant: "warning", label: "Pending review" },
    RESOLVED: { variant: "good", label: "Resolved" },
    CLOSED: { variant: "neutral", label: "Closed" },
    REOPENED: { variant: "serious", label: "Reopened" },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function DispositionBadge({ disposition }: { disposition: RecommendationDisposition }) {
  const map: Record<RecommendationDisposition, { variant: "critical" | "warning" | "good"; label: string }> = {
    ESCALATE: { variant: "critical", label: "Escalate" },
    REFER: { variant: "warning", label: "Refer" },
    CLEAR: { variant: "good", label: "Clear" },
  };
  const { variant, label } = map[disposition];
  return <Badge variant={variant}>{label}</Badge>;
}

const GOVERNANCE_ORDER: GovernanceStatus[] = ["PROPOSED", "REVIEW", "APPROVED", "VERSIONED", "DEPLOYED"];

export function GovernanceStatusBadge({ status, rejected = false }: { status: GovernanceStatus; rejected?: boolean }) {
  if (rejected) return <Badge variant="critical">Rejected</Badge>;
  const variant = status === "DEPLOYED" ? "good" : status === "PROPOSED" ? "neutral" : "brand";
  const labels: Record<GovernanceStatus, string> = {
    PROPOSED: "Proposed",
    REVIEW: "In review",
    APPROVED: "Approved",
    VERSIONED: "Versioned",
    DEPLOYED: "Deployed",
  };
  return <Badge variant={variant}>{labels[status]}</Badge>;
}

export { GOVERNANCE_ORDER };
