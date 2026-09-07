# Hermes Controlled Self-Learning Layer

Implemented on `feature/hermes-learning`: a controlled, human-gated
learning layer that turns analyst decisions into reviewable improvement
proposals, without ever taking an autonomous adverse-AML action itself.

Out of scope here (owned by other branches): the full dashboard UI, the
deterministic risk engine and ML models (feature/fraud-detection-engine),
and the investigation pipeline that produces AI recommendations
(feature/n8n-orchestration). This branch reuses those branches' database
schema and types (`lib/supabase/types.ts`) and adds one new table,
`learning_candidates`, plus everything under `lib/hermes/`.

## Reconnaissance (what this branch found, and what it did about it)

Before writing any code, this branch inspected:

- The Supabase schema for anything Hermes-shaped: `agent_memory`,
  `agent_skills`, `agent_feedback`, `model_versions`, `rule_versions`
  (from `supabase/migrations/20250101000016_hermes_agent_memory.sql` and
  `.../20250101000017_model_governance.sql`). Both migration files are
  explicitly commented as "storage foundation only... owned by
  feature/hermes-learning" — i.e. earlier branches deliberately left the
  behavior on top of these tables for this branch to build.
- `lib/orchestration/*` for the investigation pipeline, human review, case
  workflow, and audit logging this branch needs to hook into
  (`AnalystDecisionContext` in `lib/hermes/types.ts` is shaped to match
  what `submitHumanReview` already has on hand).
- The project's dependencies (`package.json`) and repository for any
  existing "Hermes" SDK, client, or API. **There is none.** No MCP SDK is
  installed either.

**This branch does not invent a Hermes runtime API or a real MCP wire
integration.** Both would be exactly the kind of fabricated integration
the project's own rules warn against. Instead:

- `HermesProvider` (`lib/hermes/provider.ts`) is a clean, honest interface
  over this project's own Supabase tables — ready to be re-implemented
  against a real external Hermes service later without any caller
  changing.
- The "MCP-style tool interfaces" (`lib/hermes/tools/`) are a small
  internal abstraction that mirrors MCP's *shape* (a named, described,
  typed tool) without claiming to speak the actual Model Context Protocol.
  See `lib/hermes/tools/types.ts`'s module docstring for the full
  reasoning.

## What is and is not autonomous

This is the load-bearing rule for the whole branch, restated from
`CLAUDE.md`'s Critical Rule and the task brief's strict governance rule.

**Nothing in `lib/hermes/` can, by itself:**

- close an account, file a SAR/STR, move funds, deny a customer, or
  release funds (none of these concepts even appear in this branch's
  code — that's intentional, not an oversight);
- change an AML policy, a risk threshold, sanctions logic, or a
  production rule;
- deploy or retrain an ML model;
- make a skill `ACTIVE`, or a learning candidate `DEPLOYED`, without a
  human calling `transitionCandidate` with an authorized role.

**What Hermes *can* do autonomously (and only this):**

- classify an analyst's decision into learning-event types and store one
  `agent_feedback` row for it (`learningEvents.ts`) — a record, not an
  action;
- scan recent feedback for a recurring pattern and, only once a threshold
  of several matching events is met, write a `PROPOSED` (never further)
  `learning_candidates` row (`learningCandidates.ts`) — again, a proposal
  a human must review, not a change;
- store and retrieve memories that a human or an LLM investigation flow
  chooses to read (`lib/hermes/provider.ts`'s memory methods).

Every governance transition beyond `PROPOSED` requires an explicit call
to `transitionCandidate` with `actorRole` of `ADMIN` or
`COMPLIANCE_MANAGER`, and the proposer of a candidate cannot also approve
or deploy it (separation of duties, enforced in `governance.ts`).
`DEPLOYED` only *records* that a human approved applying a candidate's
payload elsewhere — nothing in this branch reads a `DEPLOYED` candidate
and automatically applies its payload to production policy, thresholds,
rules, or models. That wiring, if ever built, belongs to whichever branch
owns each of those systems, and must itself go through their own review
process — never through this one function.

## Architecture

```
Analyst decision (from feature/n8n-orchestration's humanReview.ts)
        │
        ▼
AnalystDecisionContext                         [types.ts]
        │
        ▼
ingestDecisionFeedback()                       [learningEvents.ts]
        │  classifies APPROVAL/REJECTION/OVERRIDE/FALSE_POSITIVE/
        │  CONFIRMED_SUSPICIOUS/INVESTIGATION_OUTCOME/ML_DISAGREEMENT/
        │  AI_RECOMMENDATION_DISAGREEMENT, dedups on analystDecisionId
        ▼
agent_feedback row (one per analyst decision, ever)
        │
        │  (separate, human- or scheduler-triggered call)
        ▼
generateCandidatesFromFeedback()               [learningCandidates.ts]
        │  deterministic threshold scan (>= 3 matching recent events),
        │  dedups against any still-open candidate with the same pattern
        ▼
learning_candidates row, status = PROPOSED
        │
        ▼
transitionCandidate()                          [governance.ts]
        │  PROPOSED -> REVIEW -> APPROVED -> VERSIONED -> DEPLOYED
        │  role-checked, separation-of-duties-checked, reason-checked
        ▼
learning_candidates row, status = DEPLOYED  (a record of approval —
                                              nothing auto-applies it)
```

`HermesProvider` (`lib/hermes/provider.ts`) is the single interface the
rest of the app is allowed to depend on for any of this — nothing outside
`lib/hermes/` should import `HermesStore` or query
`agent_memory`/`agent_skills`/`agent_feedback`/`learning_candidates`
directly. `LocalHermesProvider` is the concrete implementation today;
`UnavailableHermesProvider` is the fail-safe fallback (see "Failure
behavior" below). `buildHermesRuntime()` (`lib/hermes/runtime.ts`) is the
one place that picks between them.

## Memory model

Four memory categories share one `agent_memory` table
(`MemoryCategory` in `lib/supabase/types.ts`), distinguished only by
`category` and, optionally, `subject_type`/`subject_id`:

| Category        | What it holds                                                             |
|------------------|----------------------------------------------------------------------------|
| `EPISODIC`       | A specific investigation's experience (this alert, this outcome).         |
| `SEMANTIC`       | Generalized knowledge — a recurring fraud pattern, a common false positive, a heuristic. |
| `PROCEDURAL`     | An investigation procedure or skill's internal notes (distinct from the `agent_skills` table itself, which tracks the skill's governance lifecycle). |
| `INVESTIGATION`  | Working notes scoped to one ongoing investigation.                        |
| `INSTITUTIONAL`  | Org-specific knowledge ("this org always escalates structuring regardless of amount"). |

All four are tenant-isolated by `organization_id` at both the RLS layer
(`supabase/migrations/20250101000016_hermes_agent_memory.sql`) and the
application layer (every `HermesStore`/`HermesProvider` method takes an
explicit `organizationId` and every query filters by it — see
`stores/supabaseHermesStore.ts` and `stores/inMemoryHermesStore.ts`).

`retrieveInstitutionalKnowledge()` is a convenience wrapper over
`retrieveMemories({ category: "INSTITUTIONAL" })` — nothing more.

## Learning events

`classifyLearningEvents()` (`learningEvents.ts`) turns one
`AnalystDecisionContext` into zero or more of:

`ANALYST_APPROVAL`, `ANALYST_REJECTION`, `ANALYST_OVERRIDE`,
`FALSE_POSITIVE`, `CONFIRMED_SUSPICIOUS`, `INVESTIGATION_OUTCOME`,
`ML_DISAGREEMENT`, `AI_RECOMMENDATION_DISAGREEMENT`.

Several can apply at once (an override that also disagrees with both the
AI recommendation and a high ML score is `ANALYST_OVERRIDE` +
`AI_RECOMMENDATION_DISAGREEMENT` + `ML_DISAGREEMENT`, all recorded in one
`agent_feedback` row's `learning_metadata.eventTypes` array, since the
column's own `feedback_type` is a single coarse enum). No secret,
credential, or raw PII beyond what the orchestration layer already
persists (alert/case/customer ids, a score, a rationale string the
analyst wrote) is ever written to `learning_metadata` — see
`ingestDecisionFeedback()`'s object literal for the exact field list.

**Idempotency**: `ingestDecisionFeedback()` looks up any existing
`agent_feedback` row by `learning_metadata->>analystDecisionId` first
(`findFeedbackByDecisionId`) and returns it unchanged if found — the same
analyst decision can never produce two learning events, even if the
caller (e.g. a retried API request) submits it twice.

## Learning candidates + governance

`learning_candidates` (new table, this branch) is the generic home for a
proposed improvement that doesn't fit the `agent_skills`/
`model_versions`/`rule_versions` shape — evidence prioritization
suggestions, false-positive patterns, prompt improvement proposals, model
or rule recommendations (`ImprovementType` enum).

Governance is a strict linear state machine
(`governance_status`: `PROPOSED -> REVIEW -> APPROVED -> VERSIONED ->
DEPLOYED`), enforced entirely in `lib/hermes/governance.ts`'s
`transitionCandidate()` — **not** by a database trigger (consistent with
`docs/DATABASE.md`'s stated philosophy that transition ordering belongs
to whichever branch owns the workflow). Rules enforced there:

- Only `ADMIN` or `COMPLIANCE_MANAGER` may call it at all.
- Only the next step in the sequence is valid from any given status — no
  skipping, no going backwards.
- `REJECT` requires a non-empty `reason`.
- A rejected candidate (`status = REVIEW` with `rejection_reason` set —
  see below) is terminal: no further transition is accepted.
- **Separation of duties**: the `proposed_by` actor cannot `APPROVE` or
  `DEPLOY` their own candidate.

**Why "rejected" reuses `REVIEW` instead of a `REJECTED` enum value**:
`governance_status` is shared across `agent_skills`, `model_versions`,
`rule_versions`, and now `learning_candidates` — it was not this branch's
place to add a new value to a shared enum other branches also depend on.
A rejection is instead represented as `status = REVIEW` with
`rejection_reason` populated, checked explicitly wherever "is this
terminal?" matters. This is documented at the top of `governance.ts` and
in the migration's own comments.

`generateCandidatesFromFeedback()` (`learningCandidates.ts`) is the only
thing that creates a candidate without a human explicitly asking for one
via `proposeCandidate` — and it is deterministic and threshold-gated
(`PATTERN_THRESHOLD = 3`), never triggered by a single feedback event
(task requirement: "do not automatically retrain or deploy models from a
single feedback event" — applied here to candidate *proposals* as well,
not just deployments). It dedups against any existing non-terminal
candidate carrying the same `payload.patternKey`, so re-running it
doesn't spam duplicate proposals for a pattern that's already under
review.

## Skills

`agent_skills` rows have `name` + `version`, `status`
(`DRAFT`/`ACTIVE`/`DEPRECATED`), and `governance_state` (the same
`PROPOSED..DEPLOYED` vocabulary as learning candidates) — two related but
independent lifecycles. `proposeSkill()` (`skills.ts`) refuses to
silently overwrite an existing `(name, version)` pair
(`SkillConflictError`), mirroring `ModelRegistry`'s "never silently
replace a version" rule from `feature/fraud-detection-engine`
(`ml-engine/src/fraud_ml/models/registry.py`) — a case's audit trail cites
an exact skill version, so that version must never change meaning after
the fact. `activateSkill()` refuses to set `status = ACTIVE` before
`governance_state` has independently reached `DEPLOYED`.

Example skills this system is meant to accumulate over time: high
velocity investigation, structuring investigation, geographic anomaly
investigation, new device investigation, false-positive analysis — none
of these ship pre-loaded; they arrive via `proposeSkill()` and earn
`ACTIVE` status only through full governance.

## Model/rule feedback signals

`ML_DISAGREEMENT` (ML score vs. final analyst decision) and
`AI_RECOMMENDATION_DISAGREEMENT` (AI recommendation vs. final analyst
decision) are both learning-event types, recorded as ordinary feedback —
see "Learning events" above. `generateCandidatesFromFeedback()`'s
`MODEL_RECOMMENDATION` rule turns a recurring `ML_DISAGREEMENT` pattern
into a `PROPOSED` candidate suggesting a model review. At no point does
anything in this branch retrain a model, change `model_versions`, or
redeploy anything — `listModelVersions`/`listRuleVersions` on
`HermesStore` are read-only, there to give a future review UI context on
what's currently active, nothing more.

## Tool boundary (task section 9 / "MCP-style" interfaces)

`lib/hermes/tools/` defines nine read-only tools — `get_customer`,
`get_transactions`, `get_alert`, `get_evidence`, `get_risk_signals`,
`get_ml_prediction`, `get_case_history`, `get_approved_skills`,
`get_institutional_knowledge` (`TOOL_REGISTRY` in
`tools/investigationTools.ts`) — as the one controlled path for a
Hermes-side flow (or, later, a real MCP client) to look up investigation
data, instead of reaching into `OrchestrationStore`/`HermesStore`
directly. `invokeTool()` (`tools/types.ts`) wraps every call with:

- **Org boundary**: every entity fetched by a bare id is checked against
  the caller's `organizationId` before being returned
  (`scopeToOrg()`) — a cross-org id is reported the same way as
  "not found," never as "forbidden," so a response never confirms that an
  id from another organization exists.
- **Authorization**: only the four known platform roles
  (`ADMIN`/`COMPLIANCE_MANAGER`/`ANALYST`/`VIEWER`) may invoke a tool.
  Every tool is read-only, so no further per-tool role restriction is
  layered on top today.
- **Auditability**: exactly one `audit_logs` row per call, success or
  failure (`action = "hermes_tool_invoked"`).
- **Exception containment**: a thrown error inside a tool becomes a
  `ToolResult`, never propagates.

`get_evidence` returns the evidence already recorded against a
recommendation (`ai_recommendations.supporting_evidence` /
`contradictory_evidence` / `red_flags`) — it does not re-run
`collectEvidence()` (which makes a live ML-service network call); a
Hermes tool call must never trigger new external calls of its own.

## Failure behavior (fail-safe / graceful degradation)

Every `HermesProvider` method returns a `HermesResult<T>` —
`{ ok: true, data }` or `{ ok: false, error, degraded: true }` — and
**never throws**. Concretely:

- `HERMES_ENABLED=false` (or Hermes provider construction failing for any
  reason, e.g. missing Supabase env vars in `REAL` mode) makes
  `buildHermesRuntime()` return `UnavailableHermesProvider`, whose every
  method resolves `hermesUnavailable(...)` immediately — no network call,
  no retry loop, no throw.
- `LocalHermesProvider` wraps every method body in try/catch; a store
  exception (a real connection failure, or literally anything a store
  throws, including a non-`Error` rejection) becomes a `HermesResult`
  with `ok: false`, never an unhandled rejection.
- Nothing in `feature/n8n-orchestration`'s investigation pipeline
  (`lib/orchestration/`) imports anything from `lib/hermes/` — a Hermes
  outage cannot block alert intake, ML scoring, human review, or case
  resolution, because those code paths do not depend on Hermes at all.
  Whatever *does* call into Hermes (e.g. a future post-review feedback
  hook, or the dashboard read APIs below) always gets a well-formed
  result back and is expected to treat `ok: false` as "skip gracefully,"
  not as an error to surface to the analyst.

## Dashboard read APIs

`app/api/hermes/*` — read/write access to Hermes data for a future
dashboard UI (not built on this branch, per the task brief). Like the
rest of this project's minimal API layer
(see `docs/ORCHESTRATION.md`'s "Known limitations"), there is no
session-based auth wired in yet: callers supply `organizationId`
directly and it is trusted as-is. Every read is still scoped to that
`organizationId` by `HermesProvider`, so the gap is authenticating *which*
organization a caller represents, not tenant isolation of the data
itself.

| Route | Method | Purpose |
|---|---|---|
| `/api/hermes/status` | GET | Provider availability/mode — lets a dashboard show a degraded banner. |
| `/api/hermes/memory` | GET/POST | Retrieve/create memories. |
| `/api/hermes/skills` | GET/POST | List skills / propose a new one. |
| `/api/hermes/feedback` | GET/POST | List feedback + a computed analytics summary / ingest a new decision's feedback. |
| `/api/hermes/candidates` | GET/POST | List candidates / manually propose one. |
| `/api/hermes/candidates/generate` | POST | Run the threshold-based pattern scan on demand. |
| `/api/hermes/candidates/:id/transition` | POST | The only HTTP path that can move a candidate's governance state. |

A degraded `HermesResult` on a **read** endpoint returns HTTP 200 with
`{ data: [], degraded: true, error }` — a dashboard should treat this as
"Hermes is temporarily unavailable," not as a hard failure. A failure on
a **write** endpoint (create memory, propose skill/candidate, ingest
feedback, transition) returns HTTP 422 with `{ error }` — this may be a
genuine validation conflict (e.g. a duplicate skill version, an invalid
governance transition) or a Hermes-layer failure; the two aren't
distinguished in the current `HermesResult` shape (a known limitation,
see below).

## Security

- Every table this branch reads or writes (`agent_memory`,
  `agent_skills`, `agent_feedback`, `learning_candidates`) has RLS
  enabled and scoped to `organization_id`, plus application-layer
  scoping in every `HermesStore` method — see `tests/hermes/*.test.ts`'s
  tenant-isolation cases.
- Hermes never sees or stores an API key, password, service-role key, or
  Slack token — nothing in `learning_metadata`/`content`/`payload` is
  sourced from environment variables, and `HermesConfig`
  (`lib/hermes/config.ts`) only ever reads `HERMES_ENABLED`, a boolean
  flag, never a credential.
- `SupabaseHermesStore` uses the service-role client (bypasses RLS by
  design, same as `SupabaseOrchestrationStore`) — every method is
  therefore solely responsible for its own `organization_id` filtering,
  which is why every query in that file has an explicit `.eq("organization_id", ...)`.
  RLS remains the second, independent layer (`SupabaseHermesStore` isn't
  the only way this data could ever be queried).

## Environment variables

- `HERMES_ENABLED` (default `true`) — set to `false` to force the
  fail-safe provider regardless of mode.
- `ORCHESTRATION_MODE` (`DEMO`/`REAL`, from `lib/orchestration/config.ts`,
  reused rather than duplicated) — `DEMO` uses an in-memory store,
  `REAL` uses Supabase and requires the same `NEXT_PUBLIC_SUPABASE_URL`/
  `SUPABASE_SERVICE_ROLE_KEY` as the orchestration layer.

## Known limitations

- **Not wired into the review endpoint yet**: `AnalystDecisionContext` is
  shaped to match what `submitHumanReview()`
  (`lib/orchestration/humanReview.ts`) already has on hand, but that
  endpoint does not yet call into Hermes automatically — a caller (or a
  future n8n step) must POST to `/api/hermes/feedback` separately today.
  This was a deliberate choice to keep this branch's changes to
  `lib/orchestration/` limited to additive, read-only store methods (see
  next point) rather than modifying the review flow itself.
- **`OrchestrationStore` gained four new read-only methods on this
  branch** (`getRiskSignalsForAlert`, `getLatestMlPredictionForAlert`,
  `getCaseEvents`, `getAnalystDecisionsForAlert`) so the tool boundary
  could retrieve risk signals, ML predictions, and case history without
  fabricating new storage. All four are additive and read-only; no
  existing method's behavior changed. `getCaseEvents` replaced an
  argument-less test-only debug helper of the same name that had no other
  caller.
- **No MCP transport**: as documented in "Tool boundary" above, this is
  an internal abstraction, not a running MCP server. Wiring a real MCP
  client to it later means writing one transport adapter over
  `ToolDefinition`, not redesigning the boundary.
- **Write-endpoint error codes don't distinguish "validation conflict"
  from "Hermes unavailable"** — both surface as HTTP 422 with a message,
  since `HermesResult`'s `ok: false` shape doesn't carry an error code.
  Good enough for this branch's scope; a real dashboard would likely want
  `LocalHermesProvider` to throw a typed error it can catch instead of
  folding everything into `hermesUnavailable(...)`.
- **No live Supabase connection was exercised for the Hermes tables from
  this branch** — `SupabaseHermesStore` was written directly against
  `lib/supabase/types.ts`'s generated shapes and unit-tested only via
  `InMemoryHermesStore`; the `learning_candidates` migration itself *was*
  validated against a live local Postgres instance (see its own commit),
  but the store code that queries it was not. Verify against a real
  Supabase project before relying on it in production, same caveat as
  `docs/ORCHESTRATION.md`'s equivalent note for `SupabaseOrchestrationStore`.
