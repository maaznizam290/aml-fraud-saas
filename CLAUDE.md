# AML Fraud SaaS — Claude Code Instructions

## Project Goal

Build a production-oriented AML and fraud investigation SaaS MVP
suitable for investor demonstrations.

## Architecture

_Rebuilt as an MVP on `rebuild/express-mvp-platform` (see git history for the
prior Next.js-monolith version if any of that work needs to be recovered)._

Frontend:
- React + Vite
- TypeScript
- Tailwind

Backend (API gateway):
- Node.js + Express + TypeScript
- Supabase PostgreSQL (Row-Level Security), with a graceful in-memory
  fallback store when Supabase secrets are not configured

ML Engine:
- Python + FastAPI
- A deterministic, mathematically-defined stand-in for a trained XGBoost
  classifier (see ml-engine/main.py's own docstring) — mapping amount,
  velocity, account age, and device risk to a fraud probability

AI:
- Claude API (Anthropic) — structured JSON only, used by the Hermes
  synthesis endpoint
- Hermes Agent — proposes new heuristic rules from confirmed analyst
  decisions; never deploys them itself (see Critical Rule)

Infrastructure:
- Supabase (Postgres + Auth)
- Any Node host for the Express gateway, any Python host (or the same
  box) for the FastAPI ML engine

## Critical Rule

Never implement autonomous adverse AML decisions.

AI recommendations must always be reviewable by a human analyst.

Never automatically:
- close an account
- file SAR/STR
- move funds
- deny a customer
- release funds

## Development Rules

Before modifying code:

1. Inspect the existing architecture.
2. Identify dependencies.
3. Reuse existing components.
4. Do not unnecessarily rewrite working code.
5. Run tests.
6. Run lint.
7. Run build.
8. Fix errors before completion.
9. Commit changes.
10. Push the feature branch.

## Git Rules

Never push directly to main.

Create a feature branch.

Use descriptive commits.

Example:

feat: implement fraud risk scoring engine

## Security

Never commit:
- API keys
- passwords
- Supabase service-role keys
- Anthropic API keys
- Slack tokens
- database credentials

Use environment variables.

## Completion Requirement

A feature is NOT complete merely because the code compiles.

It must:
- work end-to-end
- have error handling
- have loading states
- have tests where appropriate
- have proper database integration
- have appropriate logging
- have documentation
