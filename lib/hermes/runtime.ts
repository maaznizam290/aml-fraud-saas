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
 *
 * Like lib/orchestration/runtime.ts's DEMO singleton, this one is held on
 * `globalThis` rather than a plain module-level variable, for the same
 * reason: `next dev` compiling a new dynamic route on demand can briefly
 * evaluate this module as a second instance with its own module scope,
 * which would hand that one route an empty store while every other route
 * keeps using the original. `globalThis` is shared across every module
 * instance in the process, so it survives that split. No effect on REAL
 * mode or a production build — see docs/DASHBOARD.md "Known limitations".
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

declare global {
  var __amlDemoHermesStore: HermesStore | undefined;
}

function getDemoStore(): HermesStore {
  if (!globalThis.__amlDemoHermesStore) {
    globalThis.__amlDemoHermesStore = new InMemoryHermesStore();
  }
  return globalThis.__amlDemoHermesStore;
}

export function buildHermesRuntime(overrideConfig?: HermesConfig): HermesRuntime {
  const config = overrideConfig ?? loadHermesConfig();

  if (!config.enabled) {
    return { config, provider: new UnavailableHermesProvider("Hermes is disabled (HERMES_ENABLED=false).") };
  }

  try {
    if (config.mode === "DEMO") {
      return { config, provider: new LocalHermesProvider(getDemoStore()) };
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
  globalThis.__amlDemoHermesStore = undefined;
}
