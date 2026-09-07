# AML Fraud SaaS — Claude Code Instructions

## Project Goal

Build a production-oriented AML and fraud investigation SaaS MVP
suitable for investor demonstrations.

## Architecture

Frontend:
- Next.js
- TypeScript
- Tailwind
- shadcn/ui

Backend:
- Next.js API routes / server actions
- Supabase PostgreSQL

Workflow:
- n8n

AI:
- Claude API
- Hermes Agent

ML:
- Python
- scikit-learn
- XGBoost
- Isolation Forest
- LOF
- One-Class SVM
- KMeans

Infrastructure:
- Vercel
- Supabase
- n8n VPS
- Hugging Face

Notifications:
- Slack
- Resend

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
