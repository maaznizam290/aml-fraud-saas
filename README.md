# AML Fraud SaaS — MVP

An investor-demo-ready AML/fraud detection platform: an Express API gateway
scores incoming transactions against a mocked ML microservice, freezes
grey-area transactions for human review with a Claude-generated brief, and
lets a compliance analyst approve or block them from a React dashboard. A
"Hermes" governance layer proposes new detection rules from confirmed
analyst decisions, but every rule stays `PENDING` until a Chief Compliance
Officer explicitly promotes it — see [Critical Rule](./CLAUDE.md#critical-rule).

## Architecture

```
┌─────────────┐     POST /api/v1/fraud/evaluate     ┌──────────────────┐
│ React (Vite)│ ───────────────────────────────────▶│ Express gateway  │
│ src/        │◀─────────── REST + SSE ──────────────│ server/          │
└─────────────┘                                      └────────┬─────────┘
                                                                │ POST /api/v1/score
                                                                ▼
                                                      ┌──────────────────┐
                                                      │ FastAPI ML engine│
                                                      │ ml-engine/main.py│
                                                      └──────────────────┘
                          ┌──────────────────┐
Express gateway ────────▶ │ Supabase Postgres │  (or in-memory fallback
(service-role key)        │ supabase/migrations│   store if unconfigured)
                          └──────────────────┘
Express gateway ────────▶ Claude API (Hermes briefs + rule synthesis;
                          template fallback if ANTHROPIC_API_KEY unset)
```

- **Frontend**: React + Vite + TypeScript + Tailwind (`src/`)
- **Backend gateway**: Node.js + Express + TypeScript (`server/`)
- **ML engine**: Python + FastAPI, a deterministic mathematical stand-in for
  a trained XGBoost classifier (`ml-engine/main.py` — see its docstring)
- **Database**: Supabase Postgres with Row-Level Security
  (`supabase/migrations/01_init_schema.sql`), with a graceful in-memory
  fallback store when Supabase secrets aren't configured
- **AI**: Claude API for the Hermes investigation brief and rule synthesis

## Quick start (demo mode — no secrets required)

```bash
# 1. Install Node dependencies
npm install

# 2. Set up the ML engine
cd ml-engine
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 &
cd ..

# 3. Start the Express gateway (in-memory store, template Hermes briefs)
npm run dev:server &

# 4. Start the frontend
npm run dev:client
```

Open the printed Vite URL (default `http://localhost:5173`). Use the
Transaction Simulator to submit a transaction — small/old-account
transactions auto-approve, large amounts auto-block, and anything in
between freezes for analyst review in the dashboard below. Switch the
"Signed in as" selector to the Chief Compliance Officer to unlock the
"Promote to DEPLOYED" button in the Hermes rule deck.

## Configuring real persistence + real Claude output

Copy `.env.example` to `.env` and fill in:

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — apply
  `supabase/migrations/01_init_schema.sql` to your Supabase project first
  (`supabase db reset` locally, or run the migration via the Supabase CLI/dashboard).
- `ANTHROPIC_API_KEY` — enables real Claude-generated investigation briefs
  and Hermes rule proposals instead of the deterministic template fallback.

Every one of these is optional; the platform runs end-to-end without any of
them (see `server/db.ts` and `server/lib/claude.ts` for the fallback logic).

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/fraud/evaluate` | Ingress pipeline: score a transaction, triage APPROVED/BLOCKED/PENDING_REVIEW, freeze + alert grey-area cases |
| `GET` | `/api/v1/alerts` | List alerts (`?status=OPEN\|RESOLVED_APPROVED\|RESOLVED_BLOCKED`) |
| `GET` | `/api/v1/alerts/:id` | Investigation view detail |
| `POST` | `/api/v1/alerts/:id/resolve` | Analyst decision (`{"decision":"APPROVE"\|"BLOCK"}`), human-in-the-loop only |
| `GET` | `/api/v1/alerts/stream/live` | Server-Sent Events feed for real-time dashboard updates (in-memory mode) |
| `POST` | `/api/v1/hermes/synthesize` | Propose new heuristic rules from confirmed analyst decisions (always `PENDING`) |
| `GET` | `/api/v1/hermes/rules` | List Hermes rules (the governance rule deck) |
| `POST` | `/api/v1/hermes/rules/:id/promote` | The **only** path from `PENDING` to `DEPLOYED` — requires `x-user-id` header resolving to role `chief_compliance_officer` |

## Testing

```bash
npm run typecheck   # frontend + server TypeScript
npm run lint
npm test            # Vitest — server routes, rule engine, ML client fallback
cd ml-engine && .venv/bin/pytest   # ML scoring engine
```

## Repository layout

```
supabase/migrations/01_init_schema.sql   Consolidated schema + RLS
ml-engine/main.py                        FastAPI mock-XGBoost scoring service
server/                                  Express gateway
  index.ts / app.ts                      Entry point / app factory
  db.ts                                  Supabase + in-memory Store
  routes/fraud.ts                        Ingress pipeline
  routes/alerts.ts                       Alert list/detail/resolve + SSE stream
  routes/hermes.ts                       Rule synthesis + promotion guardrail
  lib/mlClient.ts                        ML engine client + fallback heuristic
  lib/claude.ts                          Claude wrapper (briefs + rule synthesis)
  lib/ruleEngine.ts                      Rule DSL evaluator + backtest engine
src/                                     Vite React frontend
  components/Dashboard.tsx               Analyst workspace + Hermes rule deck
  components/TransactionSimulator.tsx    Demo transaction ingress form
```
