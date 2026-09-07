"use client";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import { ROLE_LABELS } from "../../../lib/auth/roles.js";
import type { UserRole } from "../../../lib/supabase/types.js";
import { Badge } from "../../../components/ui/badge.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card.js";
import { ErrorState, LoadingState } from "../../../components/ui/states.js";

interface ProvidersResponse {
  mode: "DEMO" | "REAL";
  claudeConfigured: boolean;
  claudeModel: string;
  slackConfigured: boolean;
  resendConfigured: boolean;
  mlServiceUrl: string;
  escalateThreshold: number;
  reviewThreshold: number;
}

const ROLE_CAPABILITIES: Record<UserRole, string> = {
  ADMIN: "Full access — manages settings, governs the learning layer, reviews alerts and cases.",
  COMPLIANCE_MANAGER: "Governs skill and candidate-improvement approvals, reviews alerts and cases.",
  ANALYST: "Investigates alerts, records human review decisions, resolves cases, proposes improvements.",
  VIEWER: "Read-only access across the platform.",
};

export default function SettingsPage() {
  const { identity, appMode } = useSession();
  const { data, error, loading, refetch } = useApiQuery<ProvidersResponse>("/api/settings/providers");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-primary">Settings</h1>
        <p className="text-sm text-ink-muted">Profile, organization, roles, and integration status.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row label="Name" value={identity?.displayName ?? "—"} />
          <Row label="Email" value={identity?.email ?? "—"} />
          <Row label="Role" value={identity ? ROLE_LABELS[identity.role] : "—"} />
          {appMode === "DEMO" && (
            <p className="mt-2 rounded-md bg-status-warning/10 px-3 py-2 text-xs text-[#8a5a00]">
              This is a demo identity, not a real account. Use the "View as" selector in the top bar to preview other
              roles.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <Row label="Organization ID" value={identity?.organizationId ?? "—"} />
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Mode</span>
            <Badge variant={appMode === "DEMO" ? "warning" : "good"}>{appMode}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>What each role can do in this platform.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
            <div key={role} className="flex items-start justify-between gap-4">
              <span className="font-medium text-ink-primary">{ROLE_LABELS[role]}</span>
              <span className="max-w-md text-right text-ink-muted">{ROLE_CAPABILITIES[role]}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Providers</CardTitle>
          <CardDescription>Configuration status only — no keys or secrets are ever sent to the browser.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading && <LoadingState label="Loading provider status…" />}
          {error && <ErrorState detail={error} onRetry={refetch} />}
          {data && (
            <div className="flex flex-col gap-2 text-sm">
              <ProviderRow label={`Claude (${data.claudeModel})`} configured={data.claudeConfigured} />
              <ProviderRow label="Slack notifications" configured={data.slackConfigured} />
              <ProviderRow label="Resend email notifications" configured={data.resendConfigured} />
              <Row label="ML service URL" value={data.mlServiceUrl} />
              <Row label="Escalate threshold" value={data.escalateThreshold.toFixed(2)} />
              <Row label="Review threshold" value={data.reviewThreshold.toFixed(2)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-muted">
            Notifications are currently configured at the organization level (see Providers above). Per-analyst
            notification preferences are not yet available — this is a known limitation, not a hidden toggle.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink-primary">{value}</span>
    </div>
  );
}

function ProviderRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-muted">{label}</span>
      <Badge variant={configured ? "good" : "neutral"}>{configured ? "Configured" : "Not configured"}</Badge>
    </div>
  );
}
