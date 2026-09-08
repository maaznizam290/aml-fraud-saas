# Investigation Dashboard (Frontend)

Implemented on `feature/investigation-dashboard`: the Next.js App Router
frontend for the AML/Fraud Investigation SaaS — landing page, executive
dashboard, alert center, investigation workspace, human review, cases,
analytics, audit trail, AI learning, model registry, settings, and the
investor demo simulator. This branch consumes the APIs built by
`feature/supabase-schema`, `feature/fraud-detection-engine`,
`feature/n8n-orchestration`, and `feature/hermes-learning` — it does not
reimplement ML scoring, Claude prompts, n8n workflows, or Hermes's
governance logic.

## Reconnaissance

Before writing any UI, this branch inspected the repository and found: no
`app/layout.tsx`, no `app/page.tsx`, no Tailwind config, no component
library, and no auth wiring beyond `lib/supabase/browserClient.ts` — the
prior branches were deliberately API-routes-only (see
`next.config.mjs`'s own comment: "This app is API-routes-only for this
branch (no pages/UI) — the investigation-dashboard branch owns the
frontend"). Everything under `app/(dashboard)/`, `components/`, and the
Tailwind/design-system setup is new on this branch.

## Architecture

```
app/
  page.tsx                      Landing page (marketing, no sidebar)
  layout.tsx                    Root layout — wraps everything in SessionProvider
  (dashboard)/
    layout.tsx                  AppShell: sidebar + topbar + auth gate
    dashboard/  alerts/  alerts/[alertId]/  cases/  cases/[caseId]/
    analytics/  audit/  learning/  models/  settings/  demo/
  api/
    alerts/  alerts/[alertId]/workspace/  cases/  cases/[caseId]/
    customers/[customerId]/  audit/  models/  dashboard/summary/
    demo/scenarios/  demo/trigger/  app-mode/  settings/providers/
    hermes/... investigations/... webhooks/...   (pre-existing, unchanged)

lib/
  auth/       session.tsx (SessionProvider/useSession), roles.ts (UX gating)
  api/        useApiQuery.ts, mutate.ts — the two data-fetching primitives every page uses
  dashboard/  aggregate.ts, demoScenarios.ts, governanceUi.ts, util.ts — presentation-layer only
  ui/         cn.ts, json.ts

components/
  ui/         Button, Badge, Card, Table, Tabs, StatTile, states (loading/empty/error), Skeleton
  domain/     badges, InvestigationProgress, RecommendationPanel, HumanReviewPanel,
              AuditTimeline, GovernanceLadder
  charts/     BarChart, TrendChart (hand-built per the dataviz skill, no charting library)
  layout/     Sidebar, Topbar, AppShell, SignInPrompt
```

## New backend surface (additive only)

Several dashboard pages need list/aggregate reads that didn't exist yet.
Every addition below is read-only composition over data the backend
already computes — no ML, Claude, n8n, or Hermes governance logic was
touched:

- `OrchestrationStore` gained `listAlerts`, `listCases`, `listAuditLogs`,
  `getCaseByAlertId` (both store implementations, both additive).
  `listAlerts` also joins each alert's primary transaction amount — the
  Alert Center's required "amount" column — via a second `.in(...)` query
  in the Supabase store, or a plain in-memory lookup in DEMO mode.
- `HermesStore`/`HermesProvider` gained `listAuditLogs`, exposing
  `listModelVersions`/`listRuleVersions` (already on `HermesStore`)
  through the provider for the Model Registry page.
- New read routes: `GET /api/alerts`, `GET /api/alerts/:id/workspace`
  (one consolidated fetch for the whole Investigation Workspace — see
  "Performance" below), `GET /api/customers/:id`, `GET /api/cases`,
  `GET /api/cases/:id`, `GET /api/audit`, `GET /api/models`,
  `GET /api/dashboard/summary`, `GET /api/app-mode`,
  `GET /api/settings/providers`.
- New action routes: `GET /api/demo/scenarios`, `POST /api/demo/trigger`
  (DEMO mode only — seeds a synthetic customer/transactions/alert into the
  DEMO in-memory store and calls the *real* `runInvestigation`, nothing
  about the pipeline is reimplemented).

## Auth and app mode

There is still no session-based auth infrastructure to build on (see
`docs/ORCHESTRATION.md`'s own "Known limitations" — this predates this
branch). `lib/auth/session.tsx` handles the two modes the server itself
reports via `GET /api/app-mode` (mirroring `ORCHESTRATION_MODE`, never a
client-side guess):

- **REAL**: requires a genuine Supabase Auth session (`SignInPrompt`,
  email+password via the anon key only). Role and organization come from
  the signed-in user's own `profiles` row, read under RLS. There is no
  client-side role override in this mode.
- **DEMO**: no login required — a fixed demo identity
  (`DEMO_ORGANIZATION_ID` from `lib/shared/constants.ts`) lets an investor
  explore every screen immediately. A "View as" role switcher in the top
  bar lets them preview the UI as each of the four roles, clearly labelled
  as a demo-only affordance (never available in REAL mode).

`lib/auth/roles.ts` + `<RoleGate>` hide or disable controls a role
shouldn't use (task section 5) — this is UX only. The backend (RLS,
`lib/hermes/governance.ts`'s own role check, each route's own logic)
remains the actual authority; a hidden button here is a convenience, not a
security boundary.

## The demo simulator and the investor journey

`POST /api/demo/trigger` seeds one of five scenarios (high velocity, new
device + large transfer, multi-country anomaly, structuring, false
positive) and runs it through the same `runInvestigation` the production
webhook calls. DEMO mode has no live fraud-ml service to call (see
`docs/ORCHESTRATION.md`), so `DemoLLMProvider`'s disposition mostly
follows each scenario's sanctions-screening status, chosen deliberately
per scenario's narrative — this is exactly the "controlled simulation"
task section 4 allows for demo mode, not fabricated evidence. The demo
page then renders the real recommendation, lets the analyst record a real
human-review decision (which also best-effort records a Hermes learning
event), and shows the real, live audit trail for that investigation —
Landing → Demo → Alert → Evidence → ML → AI → Recommendation → Human
Review → Case → Audit → Learning, all through real API calls.

`InvestigationProgress`'s `simulate` prop is DEMO-only: because
`runInvestigation` completes synchronously in one call, there is no
intermediate state to poll, so the component replays the *already-true*
final status as a staged reveal for the demo's pacing. In REAL mode
`simulate` is never set — the ladder renders `alert.status` exactly as
polled, never an invented pace (task section 4's explicit requirement).

## Performance

The Investigation Workspace is the most data-heavy page (task section 6),
so `GET /api/alerts/:id/workspace` fetches everything it needs — alert,
customer, profile, transaction, recent transactions, risk signals, ML
prediction, recommendation, case, analyst decisions — in one round trip
instead of eight separate ones. `lib/api/useApiQuery.ts` is the one
data-fetching hook every page uses; it cancels in-flight requests on
unmount/param change so a fast filter change never lets a stale response
overwrite a newer one.

## Charts

`components/charts/` follows the dataviz skill's method directly rather
than adding a charting library: status colors (good/warning/serious/
critical) for severity/risk-level breakdowns, the single validated
sequential blue hue for the alert-volume trend, thin 2px lines, a
crosshair + tooltip on the trend line, per-bar hover tooltips, and
"No data yet" text instead of an empty axis when a series is all zero.

## Accessibility

Every interactive control has a visible focus ring
(`:focus-visible` in `app/globals.css`), form fields have associated
`<label>`s, tables use real `<table>`/`<th scope="col">` markup, status is
never conveyed by color alone (every `Badge` carries a text label), and
the mobile nav toggle and role switcher are keyboard-operable native
elements (`<button>`, `<select>`).

## Testing

`tests/components/` (Vitest + Testing Library, jsdom) covers the pages
task section 14 names explicitly: the executive dashboard, alert center,
investigation workspace, human review (including an unauthorized-role
case), cases, the audit timeline, role restrictions in isolation
(`RoleGate`), and the demo simulator (including its "disabled in REAL
mode" case and a full run-through). `lib/auth/session.tsx` exports its
`SessionContext` for tests only, so a test can render a component tree
under a fixed session state without exercising the real fetch/Supabase
logic — see `tests/components/testUtils.tsx`.

## Known limitations

- **Fixed: `next dev` cold-start bug in the demo simulator** (reported as
  "Alert ... not found" when approving/rejecting right after a demo run).
  Root cause: `next dev` compiles each dynamic API route on demand, and
  the first hit to a route Next hasn't touched yet can momentarily
  evaluate `lib/orchestration/runtime.ts` / `lib/hermes/runtime.ts` as a
  *separate* module instance — so the DEMO-mode in-memory singleton
  (previously a plain module-level `let`) could end up as two different
  objects, one per route, each empty from the other's point of view. Fixed
  by holding the singleton on `globalThis` instead (the same fix
  Prisma-style singletons use for the same reason) — `globalThis` is
  shared by every module instance in the process regardless of how many
  separate bundles compiled the same source file. A related instance of
  the same root cause broke `POST /api/demo/trigger`'s own
  `instanceof InMemoryOrchestrationStore` check (two bundles of the same
  class are not `instanceof`-equal to each other); replaced with a
  structural (duck-typed) check for the seed methods it actually needs,
  which has no class identity to get wrong. Verified by clearing `.next`,
  starting a fresh `next dev` process, and hitting `trigger` →
  `workspace` → `review` as literally the first requests to each of those
  routes — all three now succeed, and all 5 demo scenarios were exercised
  end-to-end (including both Approve and Reject) via browser automation
  with zero failures. No effect on REAL mode or on a production build
  (`next build && next start`), which never had this bug (every route is
  compiled once, up front, into one process before serving traffic) but
  is unaffected by the fix either way.
- **Audit correlation is resolved, not redesigned.** `investigationService.ts`
  correlates its own audit rows by a per-run UUID (stored in
  `ai_recommendations.metadata.correlationId`), while `resolveCase()` and
  Hermes's learning-event capture correlate directly by `alertId`. Rather
  than changing either (out of this branch's scope), `GET /api/audit`
  accepts `alertId` and resolves the per-run id via the alert's own
  recommendation, querying both. See the route's own docstring.
- **No live Supabase/Claude/ML service was exercised from this branch** —
  same caveat as every prior branch's docs. All manual verification here
  used DEMO mode (`npm run dev` and a full `next build && next start`
  pass), which is honest about being demo/synthetic data throughout the UI.
- **Settings page is read-only.** Profile editing, per-analyst notification
  preferences, and organization management have no backend yet — the page
  says so rather than shipping a control that does nothing.
- **No dark mode.** Not required by the task brief; the design system
  (`tailwind.config.ts`) defines a light-only palette to keep scope
  bounded.
