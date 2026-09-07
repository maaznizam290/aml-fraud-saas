# AML Fraud SaaS

Database, authentication, and multi-tenancy foundation for an AML/fraud
investigation SaaS. See `CLAUDE.md` for the overall project scope and rules.

This branch (`feature/supabase-schema`) owns the Supabase/Postgres schema,
migrations, RLS, seed data, and shared database types only. The ML engine,
Claude investigation layer, Hermes learning engine, n8n workflows, and
frontend dashboard live on other feature branches.

## Getting started

```bash
npm install

# Everything below requires the Supabase CLI + Docker:
npm install -g supabase
supabase start       # local Postgres + Auth + Studio
supabase db reset    # applies supabase/migrations/*.sql, then supabase/seed.sql
```

Copy `.env.example` to `.env.local` and fill in the values `supabase start`
prints out.

Demo login (after `supabase db reset`), one per role, password
`DemoPass123!`: `admin@demo.amlfraud.dev`, `compliance@demo.amlfraud.dev`,
`analyst1@demo.amlfraud.dev`, `analyst2@demo.amlfraud.dev`,
`viewer@demo.amlfraud.dev`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint over `lib/`, `scripts/`, `tests/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest — type shape + migration/RLS static checks |
| `npm run build` | Compiles `lib/` to `dist/` |
| `npm run validate:db` | Static checks over `supabase/migrations` + `supabase/seed.sql` |

## Documentation

- [`docs/DATABASE.md`](docs/DATABASE.md) — schema, RLS, multi-tenancy,
  roles, migrations, seed data, environment variables.
- [`IMPLEMENTATION_NOTES.md`](IMPLEMENTATION_NOTES.md) — what this branch
  changed and how it was validated.
