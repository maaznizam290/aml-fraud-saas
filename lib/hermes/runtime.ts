/**
 * Assembles the right HermesStore/HermesProvider for the configured mode
 * (mirrors lib/orchestration/runtime.ts). This is the one place that
 * decides DEMO vs REAL and enabled vs disabled — every other Hermes module
 * takes its store/provider as a parameter and has no idea which was chosen.
 *
 * Construction never throws: if building the Supabase-backed provider fails
 * for any reason (missing env, client construction error), `buildHermesRuntime`
 * falls back to `UnavailableHermesProvider` rather than let that failure
 * propagate into a caller — see providers/unavailableHermesProvider.ts and
 * task section 10's fail-safe requirement.
 */
import { createServiceClient } from "../supabase/serviceClient.js";
import { loadHermesConfig, type HermesConfig } from "./config.js";
import type { HermesProvider } from "./provider.js";
import { LocalHermesProvider } from "./providers/localHermesProvider.js";
import { UnavailableHermesProvider } from "./providers/unavailableHermesProvider.js";
import type { HermesStore } from "./store.js";
import { InMemoryHermesStore } from "./stores/inMemoryHermesStore.js";
import { SupabaseHermesStore } from "./stores/supabaseHermesStore.js";

export interface HermesRuntime {
  config: HermesConfig;
  provider: HermesProvider;
}

let demoStoreSingleton: HermesStore | null = null;

export function buildHermesRuntime(overrideConfig?: HermesConfig): HermesRuntime {
  const config = overrideConfig ?? loadHermesConfig();

  if (!config.enabled) {
    return { config, provider: new UnavailableHermesProvider("Hermes is disabled (HERMES_ENABLED=false).") };
  }

  try {
    if (config.mode === "DEMO") {
      if (!demoStoreSingleton) demoStoreSingleton = new InMemoryHermesStore();
      return { config, provider: new LocalHermesProvider(demoStoreSingleton) };
    }

    const store = new SupabaseHermesStore(createServiceClient());
    return { config, provider: new LocalHermesProvider(store) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      config,
      provider: new UnavailableHermesProvider(`Hermes provider construction failed: ${message}`),
    };
  }
}

/** Test-only: reset the DEMO singleton between test cases. */
export function resetHermesDemoStoreForTests(): void {
  demoStoreSingleton = null;
}
