#!/usr/bin/env node
// Static checks over supabase/migrations and supabase/seed.sql. Not a
// substitute for actually running them against Postgres (see
// docs/DATABASE.md for how to do that with the Supabase CLI) — this just
// catches regressions cheaply in an environment without Docker/Supabase CLI.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(rootDir, "supabase", "migrations");

const MIGRATION_NAME_RE = /^\d{14}_[a-z0-9_]+\.sql$/;
const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9-_]+/,
  /sk-[a-zA-Z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const errors = [];

const filenames = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
if (filenames.length === 0) {
  errors.push("No migration files found in supabase/migrations.");
}

const sorted = [...filenames].sort();
if (JSON.stringify(filenames.sort()) !== JSON.stringify(sorted)) {
  errors.push("Migration filenames are not in a stable sortable order.");
}

for (const name of filenames) {
  if (!MIGRATION_NAME_RE.test(name)) {
    errors.push(`Migration filename "${name}" does not match <14-digit-timestamp>_<snake_case>.sql`);
  }
}

let combined = "";
for (const name of filenames) {
  combined += `\n-- FILE:${name}\n` + readFileSync(path.join(migrationsDir, name), "utf8");
}

const seedPath = path.join(rootDir, "supabase", "seed.sql");
const seedContent = readFileSync(seedPath, "utf8");

for (const pattern of SECRET_PATTERNS) {
  if (pattern.test(combined)) {
    errors.push(`Possible hardcoded secret matching ${pattern} found in migrations.`);
  }
  if (pattern.test(seedContent)) {
    errors.push(`Possible hardcoded secret matching ${pattern} found in seed.sql.`);
  }
}

// Every `create table public.<name>` must eventually get
// `alter table public.<name> enable row level security` somewhere in the
// migration set (RLS can be enabled in a later file than table creation,
// e.g. organizations/profiles, which need helper functions defined first).
const createdTables = new Set(
  [...combined.matchAll(/create table (?:if not exists )?public\.(\w+)/g)].map((m) => m[1])
);
const rlsEnabledTables = new Set(
  [...combined.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1])
);

for (const table of createdTables) {
  if (!rlsEnabledTables.has(table)) {
    errors.push(`Table "${table}" is created but RLS is never enabled for it.`);
  }
}

if (errors.length > 0) {
  console.error("Migration validation failed:\n");
  for (const err of errors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
}

console.log(`Migration validation passed: ${filenames.length} migration files, ${createdTables.size} tables, all RLS-enabled.`);
