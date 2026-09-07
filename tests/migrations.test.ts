import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(rootDir, "supabase", "migrations");

describe("migrations", () => {
  it("validate-migrations.mjs passes", () => {
    expect(() =>
      execFileSync("node", [path.join(rootDir, "scripts", "validate-migrations.mjs")], {
        stdio: "pipe",
      })
    ).not.toThrow();
  });

  it("every table with organization_id enables row level security", () => {
    const files = readdirSync(migrationsDir).filter((f: string) => f.endsWith(".sql"));
    const combined = files.map((f) => readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");

    const tablesWithOrgId = new Set<string>();
    const tableBlockRe = /create table (?:if not exists )?public\.(\w+) \(([\s\S]*?)\n\);/g;
    for (const match of combined.matchAll(tableBlockRe)) {
      const [, tableName, body] = match;
      if (tableName && body && /organization_id/.test(body)) {
        tablesWithOrgId.add(tableName);
      }
    }

    expect(tablesWithOrgId.size).toBeGreaterThan(15);

    const rlsTables = new Set(
      [...combined.matchAll(/alter table public\.(\w+) enable row level security/g)].map((m) => m[1])
    );

    for (const table of tablesWithOrgId) {
      expect(rlsTables.has(table), `expected RLS enabled on ${table}`).toBe(true);
    }
  });

  it("audit_logs has no UPDATE or DELETE policy (immutability)", () => {
    const content = readFileSync(path.join(migrationsDir, "20250101000015_audit_logs.sql"), "utf8");
    expect(content).not.toMatch(/create policy audit_logs_update/);
    expect(content).not.toMatch(/create policy audit_logs_delete/);
  });

  it("the Critical Rule (no autonomous adverse action) is never violated by an enum value", () => {
    const files = readdirSync(migrationsDir).filter((f: string) => f.endsWith(".sql"));
    const combined = files.map((f) => readFileSync(path.join(migrationsDir, f), "utf8")).join("\n");
    const forbidden = ["AUTO_CLOSE", "AUTO_FILE_SAR", "AUTO_MOVE_FUNDS", "AUTO_DENY", "AUTO_RELEASE"];
    for (const value of forbidden) {
      expect(combined).not.toContain(value);
    }
  });
});
