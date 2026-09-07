# AI Investigation + n8n Orchestration

Implemented on `feature/n8n-orchestration`: the orchestration layer that
turns an alert into an AI-assisted, human-reviewed case resolution —
evidence aggregation, the Claude investigation copilot, structured-output
validation, human review, case resolution, notifications, and the n8n
workflows that trigger all of it.

Out of scope here (owned by other branches): the full dashboard UI and the
Hermes learning engine. The deterministic risk engine and ML scoring
themselves are feature/fraud-detection-engine's — this branch calls that
service, it doesn't reimplement it. The database schema is
feature/supabase-schema's — this branch's types (`lib/orchestration/types.ts`)
reuse its enums directly rather than inventing a second vocabulary.

## Architecture

```
n8n webhook (aml-fraud-alert)
        │
        ▼
POST /api/webhooks/aml-fraud-alert  (HMAC-verified, schema-validated)
        │
        ▼
runInvestigation()  [lib/orchestration/investigationService.ts]
        │
        ├─ collectEvidence()        [evidence.ts]        → transaction history, customer/KYC,
        │                                                   sanctions, device, location, country
        │                                                   risk, deterministic risk signals,
        │                                                   ML prediction (via mlClient.ts)
        ├─ LLMProvider.investigate() [llm/*]              → Claude (or Demo) investigation
        ├─ parseInvestigationOutput() [llm/outputSchema.ts] → strict validation, never guesses
        ├─ store.insertRecommendation(...)                → persists the recommendation
        ├─ store.getOrCreateCase(...)                     → idempotent case creation
        └─ notifier.notifyRecommendationReady(...)        → Slack/Resend/in-app, never blocking
        │
        ▼
   alert.status = HUMAN_REVIEW   ◄── the pipeline stops here, always
        │
        │  (separate, analyst-driven trigger)
        ▼
POST /api/investigations/:alertId/review   [humanReview.ts: submitHumanReview]
        │
        ▼
POST /api/cases/:caseId/resolve            [humanReview.ts: resolveCase]
        │
        ▼
   alert.status = RESOLVED
```

Every arrow above is a real function call you can unit test directly — see
`tests/orchestration/`. n8n (`n8n/workflows/`) only triggers the two API
calls at the top and bottom of this diagram; it does not contain
investigation logic itself (see `n8n/README.md` for why).

## n8n workflows

Three workflows in `n8n/workflows/`, detailed in `n8n/README.md`:

1. **`01-alert-intake.workflow.json`** — the `aml-fraud-alert` webhook.
   Normalizes the incoming payload, HMAC-signs it, calls
   `/api/webhooks/aml-fraud-alert`, and alerts ops via Slack on a *hard*
   pipeline failure (the API being unreachable) — not on a normal
   ML/Claude-degraded-but-handled outcome, which already returns HTTP 200/202.
2. **`02-human-review.workflow.json`** — approve/reject/override, from the
   dashboard or a Slack interactive button.
3. **`03-case-resolution.workflow.json`** — final case resolution.

## Webhook (`aml-fraud-alert`)

`POST /api/webhooks/aml-fraud-alert` (`app/api/webhooks/aml-fraud-alert/route.ts`):

- **Signature**: `X-AML-Signature: sha256=<hmac>` over the raw request body,
  keyed by `AML_WEBHOOK_SECRET` (`lib/orchestration/webhookAuth.ts`,
  timing-safe compare). Enforced in REAL mode only — DEMO mode has no real
  secret to check (see "Demo vs. Real" below). The secret is never logged,
  never echoed back, and never appears in any response.
- **Payload validation**: `lib/orchestration/webhookSchema.ts` (Zod) —
  malformed/missing fields get a `400` with details, never a best-effort
  guess.
- **Idempotency**: if `alertId` already has a stored recommendation, the
  handler returns the existing one (`reused: true`, HTTP 200) instead of
  re-running Claude/ML or creating a second case. See
  `investigationService.ts`'s `findRecommendationByAlertId` check.

## Evidence collection

`lib/orchestration/evidence.ts` gathers, independently and
failure-isolated: transaction history, customer profile, KYC status,
sanctions result, device info, location info, country risk, deterministic
risk signals, and the ML prediction (via `mlClient.ts`, which calls
feature/fraud-detection-engine's `POST /api/ml/predict`). Every item is an
`EvidenceItem` with a stable `id`, a `summary`, the raw `data`, and a
`source` — citable by both Claude's structured output and a human reviewing
it later. One provider failing is recorded in `EvidenceBundle.errors` and
does **not** stop the others, and never gets replaced with a fabricated
value — see "Safe failure" below.

## LLM provider abstraction

`lib/orchestration/llm/provider.ts` defines `LLMProvider` — `investigate({
systemPrompt, userPrompt, correlationId }) -> { rawText, provider, model,
promptVersion }`. `investigationService.ts` depends only on this interface;
`@anthropic-ai/sdk` is imported in exactly one file
(`llm/claudeProvider.ts`), so nothing in the business logic is coupled to
Claude specifically. `llm/demoProvider.ts` is a second, fully deterministic
implementation used in DEMO mode and by default in tests.

### Prompt (`llm/prompt.ts`)

The system prompt instructs the model to act as an AML/Fraud investigation
copilot: analyze evidence, identify suspicious patterns, weigh
contradictory evidence, assess the ML score, explain its reasoning, cite
evidence by `[id]`, and recommend next steps — and explicitly **not** to
autonomously close accounts, move funds, file/claim to file a SAR/STR,
impose any adverse action, or change AML rules/ML thresholds. The prompt
alone is not the enforcement mechanism, though — see the next section and
"Critical Rule alignment".

### Structured output (`llm/outputSchema.ts`)

A Zod schema for exactly the shape required:
`disposition | confidence | riskLevel | rationale | redFlags |
supportingEvidence | contradictoryEvidence | recommendedNextSteps |
mlScoreAssessment | investigationSummary`. `parseInvestigationOutput()`
accepts a bare JSON object or one inside a fenced code block; anything else
is a typed parse failure, never a guess. On failure,
`investigationService.ts` synthesizes a `REFER` fallback recommendation
whose `rationale` states plainly that AI output failed validation, and
records a `claude_parse_failed` audit event with a truncated response
preview (never an unbounded blob).

## Human review (`lib/orchestration/humanReview.ts`)

`submitHumanReview({ alertId, analystId, action, overrideDisposition?,
rationale })`:

| action | resulting decision | agreedWithAi |
| --- | --- | --- |
| `APPROVE` | the AI's own disposition | `true` |
| `REJECT` | `CLEAR` | `false` |
| `OVERRIDE` | `overrideDisposition` (required) | `overrideDisposition === AI's disposition` |

Every call requires a non-empty `rationale`, inserts an `analyst_decisions`
row (analyst, timestamp, original recommendation, final decision, override
status, rationale — exactly the fields task section 8 requires), records an
`analyst_decision_recorded` audit event, and updates the case
(`IN_PROGRESS`, assigned to that analyst).

`resolveCase({ caseId, analystId, disposition, resolutionReason, priority?
})` is the terminal step: sets the case's disposition and `RESOLVED`
status, moves the linked alert to `RESOLVED`, records `case_resolved`, and
notifies (failure-isolated, per "Safe failure").

## Notifications (Slack + Resend)

`lib/orchestration/notifications/`: a `NotificationProvider` interface,
`SlackNotifier` (incoming webhook URL — no bot scopes to manage) and
`ResendNotifier` (plain fetch against the Resend API — implemented and
unit-tested, but not wired into the default `NotificationDispatcher`
construction yet, since it needs a per-notification recipient email address
that requires a profile lookup this branch doesn't own; see "Known
limitations"). `NotificationDispatcher` fans out to every configured
provider and **guarantees** its `notify*` methods never throw — a failing
provider is caught, audited as `notification_failed`, and every other
provider still runs. This is enforced once, centrally, rather than trusted
to each call site (`tests/orchestration/notifications.test.ts`).

## Demo vs. Real mode

`lib/orchestration/config.ts` + `runtime.ts`. `ORCHESTRATION_MODE` is
explicit and defaults to `DEMO` — never inferred from "a secret happens to
be missing", so a REAL deployment that's misconfigured fails loudly at
startup instead of silently behaving like a demo.

- **DEMO**: `InMemoryOrchestrationStore` seeded with one deterministic
  scenario (`createDemoStore()` — a velocity-anomaly alert, 8 prior
  transactions, one customer), `DemoLLMProvider` (no network calls, reads
  simple markers out of the same rendered prompt a real model would see),
  and a no-op notifier. The demo store is a process-lifetime singleton so a
  webhook → review → resolve walkthrough (task section 12's live demo) works
  across separate API calls.
- **REAL**: `SupabaseOrchestrationStore` (service-role client from
  feature/supabase-schema), `ClaudeProvider`, and whichever of
  Slack/Resend are configured. `loadConfig()` throws immediately if
  `AML_WEBHOOK_SECRET` or `ANTHROPIC_API_KEY` is missing — REAL mode simply
  cannot start half-configured.

Because these are two genuinely different implementations of the same
interfaces (`OrchestrationStore`, `LLMProvider`, `NotificationDispatcher`),
there is no code path where DEMO synthetic data and REAL credentials mix —
DEMO mode never touches `ANTHROPIC_API_KEY`, `AML_WEBHOOK_SECRET`, or any
Supabase credential at all.

## Safe failure (task section 13)

| Failure | Behavior |
| --- | --- |
| Evidence provider fails | Recorded in `EvidenceBundle.errors`; other evidence still collected; never fabricated |
| ML service fails/degrades | `mlClient.ts` returns `degraded: true`, never a fabricated score; investigation proceeds on deterministic evidence |
| Claude/LLM provider fails | `REFER` fallback recommendation, `claude_request_failed` audited, alert still reaches `HUMAN_REVIEW` |
| Claude response fails validation | Same `REFER` fallback, `claude_parse_failed` audited with a truncated preview |
| Notification fails | Caught per-provider, `notification_failed` audited, investigation/review/resolution unaffected |
| n8n → API call fails outright | `01-alert-intake.workflow.json`'s IF branch posts to a Slack ops channel and still acknowledges the original webhook |

No failure path anywhere in this branch executes an adverse action, and
none silently drops an alert — every failure either produces a
human-reviewable `REFER` outcome or an explicit ops alert.

## Auditability (task section 14)

Every meaningful step goes through `recordAudit()`
(`lib/orchestration/audit.ts`), tagged with a per-investigation
`correlationId`: `webhook_received`, `investigation_started`,
`evidence_collected` (+ `evidence_collection_failed` per provider),
`ml_prediction_generated`/`ml_prediction_failed`, `claude_request_sent`,
`claude_response_received`, `claude_request_failed`, `claude_parse_failed`,
`ai_recommendation_generated`, `case_created`, `analyst_decision_recorded`,
`case_resolved`, `notification_sent`/`notification_failed`. Given a
`correlationId` (or an `alertId`), the full investigation is reconstructable
from `audit_logs` alone.

## Critical Rule alignment

Per `CLAUDE.md`: no autonomous adverse AML action, ever.

- `Disposition` (`ESCALATE | CLEAR | REFER`) is the only output type Claude
  or the fallback path can produce — reused directly from
  feature/supabase-schema's `recommendation_disposition` enum, which has no
  `AUTO_*` value.
- A recommendation is never itself a decision: `analyst_decisions` (written
  only by `submitHumanReview`, which requires a human `analystId` and a
  `rationale`) is what's binding.
- `resolveCase` is the only function that sets a case's terminal state, and
  it is only ever called from the case-resolution API/n8n trigger — nothing
  upstream calls it automatically.
- `tests/orchestration/investigationService.test.ts` and the fusion-level
  test in feature/fraud-detection-engine both assert that failure paths
  route to `REFER`/human review rather than any adverse outcome.

## Testing

56 vitest tests across `tests/orchestration/`, covering every required
scenario: valid alert, invalid alert, missing evidence (customer not
found), ML failure (network error and HTTP error), Claude failure
(provider throws), malformed Claude response, duplicate webhook
(idempotency), human approval, rejection, override, notification failure
(one provider down, all providers down), DEMO mode end-to-end, and REAL
mode's webhook signature enforcement (missing and incorrect signature).

```bash
npm test                 # full vitest suite (DB + ML-contract + orchestration)
npm run validate:n8n     # static structural checks on the n8n workflow JSON
```

## Environment variables

See `.env.example`. `ORCHESTRATION_MODE=DEMO` is the default and requires
nothing else. REAL mode's requirements are listed there and enforced by
`loadConfig()`.

## Known limitations

- **n8n workflows are not executed against a live n8n instance** — this
  sandbox has none available. They were validated statically
  (`scripts/validate-n8n-workflow.mjs`: valid JSON, every node has its
  required fields, every connection resolves, no hardcoded secrets, every
  webhook node has a path) but not actually imported and run. Do that
  before relying on them in a real deployment — see `n8n/README.md`.
- **`ResendNotifier` is implemented and unit-tested but not wired into
  `runtime.ts`'s default provider list** — it needs a per-notification
  recipient email address, which requires looking up the assigned
  analyst's profile (a lookup this branch doesn't own; the profile itself
  is feature/supabase-schema's `profiles` table, but resolving "this
  analyst's email" into the notification path is future wiring).
- **No real Claude API calls were made** — `ClaudeProvider` is implemented
  against the documented `@anthropic-ai/sdk` `messages.create` API but
  exercised only through `DemoLLMProvider` and fakes in tests (no
  `ANTHROPIC_API_KEY` available in this environment). Verify against a real
  key before relying on it in production.
- **`mlClient.ts` was tested against fakes, not a live fraud-ml service** —
  the request/response shapes are taken directly from
  `ml-engine/src/fraud_ml/schemas.py` and `api/app.py`, but an actual
  running instance of that service was not exercised end-to-end from this
  branch. Run both services together before a real demo.
- **No profile-based recipient resolution for notifications** — the
  in-app `notifications` row is only written when
  `alert.assigned_analyst_id`/`case.assigned_analyst_id` is already set;
  there's no "notify all analysts in the org" fallback yet.
- **A genuine infrastructure bug was found and fixed on this branch**:
  `lib/supabase/types.ts` (from feature/supabase-schema) declared `Database`
  and its per-table `Row`/`Insert`/`Update` shapes as `interface`s missing a
  `Relationships` field and a `__InternalSupabase` version marker.
  supabase-js's generic inference silently collapsed every table's
  `Insert`/`Update` argument type to `never` as a result — `SupabaseOrchestrationStore`
  would not have compiled otherwise. Fixed by converting those declarations
  to `type` aliases and adding the missing fields (see the comments at the
  top of `lib/supabase/types.ts`). Separately, Next.js's default webpack
  config does not resolve a `.js`-suffixed import specifier to a sibling
  `.ts` file (unlike `tsc`'s NodeNext resolution, which every `.ts` file in
  this repo relies on) — fixed via `resolve.extensionAlias` in
  `next.config.mjs`. Both fixes benefit every branch that builds on this
  Next.js app, not just this one.
