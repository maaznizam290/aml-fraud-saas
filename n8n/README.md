# n8n Orchestration

Three workflows, matching the three points a human or an external system
kicks off part of the investigation lifecycle. None of them contain the
actual investigation logic (evidence collection, ML scoring, Claude
investigation, structured-output parsing, audit trail) — that all lives in
`lib/orchestration/` and is unit-tested there (see `tests/orchestration/`).
n8n's job is purely: receive the trigger, call the right API with the right
shape, respond. This split matters for auditability and testing: business
logic inside n8n Function nodes is much harder to unit test than
TypeScript, and this way the same logic runs identically whether it's
triggered by n8n, a direct API call, or a test.

## Why this split

The task's conceptual sequence is:

```
Webhook -> Normalize Alert -> Fetch Transaction History -> Fetch Customer/KYC Evidence
  -> Sanctions Evidence -> ML Features/Score -> Merge Evidence -> Claude Investigation
  -> Parse Structured Output -> Store Recommendation -> Create Audit Event
  -> Notify Analyst -> Human Review -> Decision -> Update Case -> Audit Decision
```

Everything from "Fetch Transaction History" through "Notify Analyst" happens
in one call to `POST /api/webhooks/aml-fraud-alert`
(`lib/orchestration/investigationService.ts`), because those steps are one
atomic, safe-failure-aware unit of work with its own audit trail and
idempotency guarantee — splitting them across n8n nodes would mean losing
that atomicity (a partial n8n workflow failure could leave evidence
collected but no recommendation stored, with no single place enforcing
consistency). "Human Review" and "Decision" are NOT part of that call at
all — they only happen later, driven by an analyst, via the second and
third workflows below.

## Workflows

### `01-alert-intake.workflow.json` — the webhook

**Webhook** (`aml-fraud-alert`) → **Normalize Alert** (Code node, tolerates
either camelCase or snake_case field names from the upstream rule engine) →
**Compute Webhook Signature** (Code node, HMAC-SHA256 via `AML_WEBHOOK_SECRET`
— must match `lib/orchestration/webhookAuth.ts` exactly) → **Call
Investigation API** (HTTP Request to `/api/webhooks/aml-fraud-alert`) → **If**
succeeded → **Acknowledge**; if not → **Notify Ops (Slack)** then
**Acknowledge Failure**.

The "Investigation Call Succeeded?" branch is about the *pipeline itself*
being reachable (HTTP < 300), not about whether Claude/ML degraded — a
degraded-but-handled investigation (task section 13's safe failure) still
returns HTTP 200/202 from the API and takes the success branch, because it
already produced a valid (REFER, human-reviewed) outcome. Only a hard
failure (API unreachable, 5xx) takes the ops-alert branch, because in that
case the alert genuinely didn't get investigated at all and a human needs
to know outside of the normal recommendation flow.

### `02-human-review.workflow.json` — approve / reject / override

**Webhook** (`aml-human-review`, called from the dashboard or a Slack
interactive button) → **HTTP Request** to
`/api/investigations/:alertId/review` → **Respond**. All the audit/case
logic (analyst, timestamp, original recommendation, final decision,
override status, rationale) is in `lib/orchestration/humanReview.ts`.

### `03-case-resolution.workflow.json` — final resolution

**Webhook** (`aml-case-resolution`) → **HTTP Request** to
`/api/cases/:caseId/resolve` → **Respond**. Resolution notifications are
sent server-side (`notifier.notifyCaseResolved`).

## Status ladder (task section 12)

`alerts.status` (the `investigation_state` enum from feature/supabase-schema)
walks through exactly these values as `investigationService.ts` runs:
`RECEIVED → ANALYZING → EVIDENCE_COLLECTED → AI_INVESTIGATING →
RECOMMENDATION_READY → HUMAN_REVIEW`, then `RESOLVED` once
`resolveCase()` runs. `GET /api/investigations/:alertId` returns the
current value at any point — poll it for a live-demo status display.

## Required n8n environment / credentials

| Name | Used by | Purpose |
| --- | --- | --- |
| `APP_BASE_URL` | all 3 workflows | Base URL of the deployed orchestration API |
| `AML_WEBHOOK_SECRET` | 01 (Compute Webhook Signature) | Must match the API's `AML_WEBHOOK_SECRET` exactly |
| `SLACK_OPS_CHANNEL_ID` | 01 (Notify Ops) | Channel for hard-failure alerts (requires an n8n Slack credential configured separately) |

Never hardcode these in the workflow JSON — they're read via `$env` at
execution time, from n8n's own environment/credential configuration.

## Importing

In n8n: **Workflows → Import from File**, pick each `.json`. Then:
1. Set the three env vars above in your n8n instance's environment (or as
   workflow-level variables).
2. Attach a Slack credential to the "Notify Ops (Pipeline Failure)" node in
   workflow 01.
3. Activate all three workflows to get their webhook URLs.

## Validation

`npm run validate:n8n` (`scripts/validate-n8n-workflow.mjs`) runs static
structural checks — valid JSON, every node has its required fields, every
connection points at a real node, every webhook node has a path, no
hardcoded secrets. **It does not execute the workflows** — this sandbox has
no running n8n instance to import into. Before relying on these in a real
deployment, import them into an actual n8n instance and run each one
end-to-end against a real (or staging) deployment of the API. See
`docs/ORCHESTRATION.md` "Known limitations".
