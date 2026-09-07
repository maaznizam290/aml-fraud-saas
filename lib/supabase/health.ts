import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Cheap connectivity/RLS-sanity check: confirms the database is reachable
 * and that the schema this branch created is actually present. Intended for
 * a future health-check API route (owned by another branch), not a
 * substitute for real monitoring.
 */
export async function checkDatabaseHealth(client: SupabaseClient<Database>): Promise<DatabaseHealth> {
  const startedAt = Date.now();

  const { error } = await client.from("organizations").select("id").limit(1);

  const latencyMs = Date.now() - startedAt;

  if (error) {
    return { ok: false, latencyMs, error: error.message };
  }

  return { ok: true, latencyMs };
}
