# Implementation Notes — `feature/supabase-schema`

## What existed before this branch

The repository was effectively empty: a single `CLAUDE.md` at the root
(project instructions) and nothing else — no `package.json`, no Supabase
project, no source code, no other migrations. There was nothing to reuse or
avoid rewriting; everything under this branch is new.

## What this branch adds

- **Tooling**: `package.json`, `tsconfig.json`/`tsconfig.build.json`,
  `eslint.config.mjs`, `vitest.config.ts`, `.env.example`, `.gitignore`,
  `supabase/config.toml`.
- **Migrations** (`supabase/migrations/`, 18 files, applied in filename
  order): extensions/enums → utility trigger function → organizations →
  profiles + auth trigger → RLS helper functions + bootstrap RPC → RLS on
  organizations/profiles → customers/customer_profiles → transactions →
  alerts → risk_signals → ml_predictions → ai_recommendations +
  analyst_decisions → cases + case_events → audit_logs → Hermes tables
  (agent_memory/agent_skills/agent_feedback) → model_versions + rule_versions
  (plus the deferred `ml_predictions` → `model_versions` FK) → notifications.
- **Seed data** (`supabase/seed.sql`): one demo organization, 5 demo users
  (one per role), 120 customers, 596 transactions, 55 alerts, 20 cases,
  including 5 hand-built scenario walkthroughs. See `docs/DATABASE.md` for
  detail.
- **Shared types** (`lib/supabase/types.ts`) and thin client factories
  (`lib/supabase/browserClient.ts`, `serviceClient.ts`, `health.ts`).
- **Validation**: `scripts/validate-migrations.mjs` (static checks: filename
  format, no hardcoded secrets, every created table has RLS enabled) and
  `tests/` (vitest: type shape sanity, migration/RLS coverage, Critical Rule
  literal check).
- **Docs**: `docs/DATABASE.md`, this file, and a root `README.md` with
  getting-started instructions.

## How this was actually validated (no Docker in this environment)

This sandbox has `psql` and a local Postgres 16 cluster, but no Docker
daemon, so the Supabase CLI's full local stack (`supabase start`) could not
be used. Instead:

1. Started the local Postgres 16 cluster (`pg_ctlcluster 16 main start`),
   created a throwaway `aml_test` database.
2. Applied `scripts/local_auth_mock.sql` — a small, clearly-commented,
   test-only stand-in for the parts of Supabase's built-in `auth` schema the
   migrations reference: `auth.users`, `auth.identities`, `auth.uid()`, the
   `anon`/`authenticated`/`service_role` roles, and the default table grants
   Supabase normally provisions automatically for those roles (a real
   Supabase project already has all of this; this mock exists purely so the
   migrations/seed/RLS could be exercised here).
3. Applied all 18 migration files in order with `ON_ERROR_STOP=1` — all
   applied cleanly.
4. Applied `supabase/seed.sql` — required two rounds of fixes (below).
5. Ran row-count checks against every table (see `docs/DATABASE.md` for the
   numbers) and confirmed they meet/exceed the required volumes.
6. Directly exercised RLS as different roles using
   `set role authenticated; set request.jwt.claim.sub = '<uuid>';` in psql:
   - A `VIEWER` sees exactly their own org's 120 customers, zero from a
     second seeded tenant, and is denied `INSERT`.
   - An `ANALYST` cannot update an alert assigned to a *different* analyst
     (0 rows affected).
   - A non-admin `UPDATE` on their own `profiles` row attempting to change
     `role` is rejected by `protect_profile_privileges()`.
   - An `ADMIN`-inserted `audit_logs` row cannot be `UPDATE`d or `DELETE`d
     (0 rows affected either way, even as `ADMIN`).
   - `create_organization_with_admin()` correctly bootstraps a brand-new
     user into a new org as its `ADMIN`.
7. Dropped the throwaway database when done. `aml_test` and
   `scripts/local_auth_mock.sql` are dev/test-only — the latter is kept in
   the repo (clearly commented as such) so the same validation is
   reproducible without Docker; it is never applied to a real Supabase
   project.

### Bugs this caught (fixed before commit)

- **`RETURNING ... INTO` on a multi-row `INSERT`** in `seed.sql` (3
  occurrences: multi-country, structuring, and false-positive scenarios)
  raised `query returned more than one row`. Fixed by inserting without
  `RETURNING`, then selecting the most recent transaction id separately.
- **Enum type mismatch**: `alert_severity` and `risk_level` share label
  names (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`) but are distinct Postgres enum
  types; the bulk alert-seeding loop needed an explicit
  `::text::risk_level` cast when reusing an `alert_severity[]` value for an
  `ai_recommendations.risk_level` column.
- **`create_organization_with_admin` was blocked by its own safety net**:
  `protect_profile_privileges()` (meant to stop a non-admin from granting
  themselves a role/org) also blocked this `SECURITY DEFINER` bootstrap RPC
  from promoting a brand-new user to `ADMIN` of their own new org, because
  the trigger evaluates the caller's *current* role (not yet `ADMIN` at that
  point). Fixed with a transaction-local escape hatch
  (`set_config('app.bypass_profile_privilege_check', 'true', true)`,
  `true` = local to the transaction) that the RPC sets itself immediately
  before the one `UPDATE` it needs — verified the flag does **not** leak to
  a subsequent statement in the same session.
- **Real tenant-isolation gap, found while testing the fix above**: because
  `profiles`' self-update policy (`id = auth.uid()`) doesn't check
  `organization_id`, the original trigger logic (block role/org changes
  *unless the caller is already ADMIN*) meant any `ADMIN` could set their
  own `organization_id` to a different tenant's id and gain access to it —
  exactly the "manipulate another tenant's records by changing IDs" failure
  mode called out in the task. Fixed by making `organization_id` completely
  unchangeable via a plain `UPDATE`, for every role including `ADMIN`; the
  only way to set it is the bootstrap RPC's bypass-flagged path. Re-verified
  live: an `ADMIN` of a freshly-created "Rival Bank" org attempting to set
  their own `organization_id` to the demo org's id gets
  `organization_id cannot be changed directly` and the row is unchanged.

## Validation status

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and
`npm run validate:db` all pass. Migrations, RLS, and seed data were also
validated by actually running them (see above) — not just read for syntax.

## Files changed

See `git diff --stat` against the branch's base for the full list; in
summary, everything under `supabase/`, `lib/supabase/`, `scripts/`,
`tests/`, `docs/DATABASE.md`, this file, and the root tooling config files
listed above is new.

## Known limitations

See the "Known limitations" section of `docs/DATABASE.md` — not repeated
here to avoid the two documents drifting out of sync.
