/**
 * Hermes-specific configuration. Reuses ORCHESTRATION_MODE (DEMO/REAL) for
 * which store backs Hermes — there is no separate "Hermes deployment mode",
 * it's the same application. HERMES_ENABLED is the independent fail-safe
 * knob: set it to "false" to deliberately exercise (or operate under) a
 * Hermes outage without touching orchestration at all — see
 * providers/unavailableHermesProvider.ts and docs/HERMES.md "Failure
 * behavior".
 */
import { loadConfig as loadOrchestrationConfig, type OrchestrationMode } from "../orchestration/config.js";

export interface HermesConfig {
  mode: OrchestrationMode;
  enabled: boolean;
}

export function loadHermesConfig(): HermesConfig {
  const orchestration = loadOrchestrationConfig();
  const enabled = (process.env["HERMES_ENABLED"] ?? "true").toLowerCase() !== "false";
  return { mode: orchestration.mode, enabled };
}
