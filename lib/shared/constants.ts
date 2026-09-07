/**
 * Zero-dependency constants safe to import from both server code (Node)
 * and client components (browser bundle) — no Node builtins, no Supabase
 * client construction, nothing that only works server-side. Anything with
 * a runtime dependency belongs in its own module instead.
 */
export const DEMO_ORGANIZATION_ID = "00000000-0000-0000-0000-0000000000d0";
