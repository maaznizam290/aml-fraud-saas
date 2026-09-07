"use client";

import { useState } from "react";
import { Brain, CircleCheck, CircleOff } from "lucide-react";

import { useSession } from "../../../lib/auth/session.js";
import { useApiQuery } from "../../../lib/api/useApiQuery.js";
import { postJson } from "../../../lib/api/mutate.js";
import { canGovern, canPropose } from "../../../lib/auth/roles.js";
import { ACTION_LABELS, VALID_ACTIONS_FROM, type GovernanceAction } from "../../../lib/dashboard/governanceUi.js";
import type { AgentMemory, AgentSkill, LearningCandidate } from "../../../lib/hermes/types.js";
import { RoleGate } from "../../../components/RoleGate.js";
import { Badge } from "../../../components/ui/badge.js";
import { Button } from "../../../components/ui/button.js";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../../components/ui/card.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs.js";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/states.js";
import { GovernanceLadder } from "../../../components/domain/GovernanceLadder.js";

interface StatusResponse {
  providerName: string;
  available: boolean;
  mode: string;
  enabled: boolean;
}
interface MemoryResponse {
  data: AgentMemory[];
  degraded: boolean;
}
interface SkillsResponse {
  data: AgentSkill[];
  degraded: boolean;
}
interface CandidatesResponse {
  data: LearningCandidate[];
  degraded: boolean;
}

export default function AiLearningPage() {
  const { identity } = useSession();
  const org = identity?.organizationId;

  const status = useApiQuery<StatusResponse>("/api/hermes/status");
  const memories = useApiQuery<MemoryResponse>(org ? `/api/hermes/memory?organizationId=${org}&limit=20` : null);
  const skills = useApiQuery<SkillsResponse>(org ? `/api/hermes/skills?organizationId=${org}` : null);
  const candidates = useApiQuery<CandidatesResponse>(org ? `/api/hermes/candidates?organizationId=${org}` : null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink-primary">AI Learning</h1>
          <p className="text-sm text-ink-muted">
            Hermes turns analyst decisions into reviewable improvement proposals — nothing here changes production
            policy, thresholds, or models automatically.
          </p>
        </div>
        {status.data && (
          <Badge variant={status.data.available ? "good" : "critical"}>
            <Brain className="h-3 w-3" />
            Hermes {status.data.available ? "available" : "unavailable"} · {status.data.mode}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="candidates">
        <TabsList>
          <TabsTrigger value="candidates">Candidate improvements</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
          <TabsTrigger value="memory">Memory</TabsTrigger>
        </TabsList>

        <TabsContent value="candidates" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <RoleGate test={canPropose}>
              <GenerateCandidatesButton organizationId={org} onDone={candidates.refetch} />
            </RoleGate>
          </div>
          {candidates.loading && <LoadingState label="Loading candidates…" />}
          {candidates.error && <ErrorState detail={candidates.error} onRetry={candidates.refetch} />}
          {candidates.data && candidates.data.data.length === 0 && (
            <EmptyState
              title="No candidate improvements yet"
              description="Recurring patterns in analyst feedback (false positives, model disagreements) will surface here for review."
            />
          )}
          {candidates.data?.data.map((c) => (
            <CandidateCard key={c.id} candidate={c} organizationId={org} onChanged={candidates.refetch} />
          ))}
        </TabsContent>

        <TabsContent value="skills" className="flex flex-col gap-3">
          {skills.loading && <LoadingState label="Loading skills…" />}
          {skills.error && <ErrorState detail={skills.error} onRetry={skills.refetch} />}
          {skills.data && skills.data.data.length === 0 && (
            <EmptyState title="No skills proposed yet" description="Investigation skills (e.g. structuring analysis) appear here once proposed." />
          )}
          {skills.data?.data.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-medium text-ink-primary">
                    {s.name} <span className="text-ink-muted">v{s.version}</span>
                  </p>
                  <p className="text-xs text-ink-muted">{s.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">{s.status}</Badge>
                  <GovernanceLadder status={s.governance_state} rejected={false} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="memory" className="flex flex-col gap-3">
          {memories.loading && <LoadingState label="Loading memory…" />}
          {memories.error && <ErrorState detail={memories.error} onRetry={memories.refetch} />}
          {memories.data && memories.data.data.length === 0 && (
            <EmptyState title="No memories recorded yet" />
          )}
          {memories.data?.data.map((m) => (
            <Card key={m.id}>
              <CardContent className="py-4">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="brand">{m.category}</Badge>
                  {m.subject_type && <span className="text-xs text-ink-muted">{m.subject_type}</span>}
                </div>
                <p className="text-xs font-mono text-ink-secondary">{JSON.stringify(m.content)}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GenerateCandidatesButton({ organizationId, onDone }: { organizationId?: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!organizationId) return;
    setLoading(true);
    try {
      await postJson("/api/hermes/candidates/generate", { organizationId });
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? "Scanning feedback…" : "Scan feedback for patterns"}
    </Button>
  );
}

function CandidateCard({
  candidate,
  organizationId,
  onChanged,
}: {
  candidate: LearningCandidate;
  organizationId?: string;
  onChanged: () => void;
}) {
  const { identity } = useSession();
  const [submitting, setSubmitting] = useState<GovernanceAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rejected = candidate.status === "REVIEW" && Boolean(candidate.rejection_reason);
  const availableActions = rejected ? [] : VALID_ACTIONS_FROM[candidate.status];

  async function handleAction(action: GovernanceAction) {
    if (!identity || !organizationId) return;
    let reason: string | undefined;
    if (action === "REJECT") {
      reason = window.prompt("Reason for rejecting this candidate (required):") ?? undefined;
      if (!reason) return;
    }
    setSubmitting(action);
    setError(null);
    try {
      await postJson(`/api/hermes/candidates/${candidate.id}/transition`, {
        organizationId,
        action,
        actorId: identity.userId,
        actorRole: identity.role,
        reason,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>{candidate.title}</CardTitle>
          <CardDescription>{candidate.improvement_type.replace(/_/g, " ")}</CardDescription>
        </div>
        <GovernanceLadder status={candidate.status} rejected={rejected} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-ink-secondary">{candidate.description}</p>
        {rejected && candidate.rejection_reason && (
          <p className="flex items-center gap-1.5 text-xs text-status-critical">
            <CircleOff className="h-3.5 w-3.5" /> Rejected: {candidate.rejection_reason}
          </p>
        )}
        {candidate.status === "DEPLOYED" && (
          <p className="flex items-center gap-1.5 text-xs text-[#006300]">
            <CircleCheck className="h-3.5 w-3.5" /> Approved and deployed — a human authorized applying this
            elsewhere.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-status-critical">
            {error}
          </p>
        )}
        {availableActions.length > 0 && (
          <RoleGate test={canGovern} fallback={<p className="text-xs text-ink-muted">Only Compliance Managers and Admins can act on this.</p>}>
            <div className="flex flex-wrap gap-2">
              {availableActions.map((action) => (
                <Button
                  key={action}
                  size="sm"
                  variant={action === "REJECT" ? "destructive" : "secondary"}
                  disabled={submitting !== null}
                  onClick={() => handleAction(action)}
                >
                  {submitting === action ? "Working…" : ACTION_LABELS[action]}
                </Button>
              ))}
            </div>
          </RoleGate>
        )}
      </CardContent>
    </Card>
  );
}
