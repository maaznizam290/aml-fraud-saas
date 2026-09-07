import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

/**
 * Client for trusted server-only code (background jobs, webhooks, seed
 * scripts, the future ML/n8n/Claude integration layers). Uses the
 * service-role key, which bypasses RLS entirely — every caller of this
 * client is responsible for its own tenant scoping.
 *
 * NEVER import this module from client-side/browser code, and never let
 * SUPABASE_SERVICE_ROLE_KEY reach a NEXT_PUBLIC_* variable.
 */
export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
