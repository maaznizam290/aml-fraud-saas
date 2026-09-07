import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.js";

/**
 * Client for browser/user-context code. Uses the anon key only — safe to
 * bundle into client-side JS. All access is governed by RLS as the signed-in
 * user, never elevated.
 */
export function createBrowserClient(): SupabaseClient<Database> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anonKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example)."
    );
  }

  return createClient<Database>(url, anonKey);
}
