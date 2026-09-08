/**
 * Assembles the right store/provider/notifier for the configured mode
 * (task section 11). This is the one place DEMO vs REAL is actually
 * decided — every other module takes its store/provider/notifier as
 * parameters and has no idea which mode is active.
 *
 * The DEMO singleton is intentionally process-lifetime (not per-request):
 * the investor demo walks through webhook -> review -> resolve as separate
 * calls, and needs the same in-memory case to still be there for the
 * second and third call.
 *
 * It's held on `globalThis` rather than a plain module-level variable
 * because `next dev` compiles each dynamic API route on demand — the
 * first request to a route Next hasn't touched yet can momentarily
 * evaluate this module as a separate instance with its own module scope,
 * which would give a fresh (empty) singleton to that one route while
 * every other, already-compiled route keeps talking to the original.
 * That surfaced as real bugs (e.g. "Alert ... not found" when submitting
 * a human review right after the demo simulator created it): the seed
 * landed in one instance's map, the review read from another's. Node's
 * `globalThis` is shared by every module instance in the same process
 * regardless of how many separate module graphs bundled it, so storing
 * the singleton there survives that split. This has no effect on REAL
 * mode (no singleton there) and none on a production build, where every
 * route is compiled once, up front, into one process before serving
 * traffic — see docs/DASHBOARD.md "Known limitations".
 */
import { createServiceClient } from "../supabase/serviceClient.js";
import { loadConfig, type OrchestrationConfig } from "./config.js";
import { ClaudeProvider } from "./llm/claudeProvider.js";
import { DemoLLMProvider } from "./llm/demoProvider.js";
import type { LLMProvider } from "./llm/provider.js";
import { createNoopNotifier, NotificationDispatcher } from "./notifications/notifier.js";
import type { NotificationProvider } from "./notifications/provider.js";
import { SlackNotifier } from "./notifications/slackNotifier.js";
import type { OrchestrationStore } from "./store.js";
import { createDemoStore } from "./stores/inMemoryStore.js";
import { SupabaseOrchestrationStore } from "./stores/supabaseStore.js";

export interface OrchestrationRuntime {
  config: OrchestrationConfig;
  store: OrchestrationStore;
  llm: LLMProvider;
  notifier: NotificationDispatcher;
}

declare global {
  var __amlDemoOrchestrationStore: OrchestrationStore | undefined;
}

function getDemoStore(): OrchestrationStore {
  if (!globalThis.__amlDemoOrchestrationStore) {
    globalThis.__amlDemoOrchestrationStore = createDemoStore();
  }
  return globalThis.__amlDemoOrchestrationStore;
}

export function buildRuntime(overrideConfig?: OrchestrationConfig): OrchestrationRuntime {
  const config = overrideConfig ?? loadConfig();

  if (config.mode === "DEMO") {
    return {
      config,
      store: getDemoStore(),
      llm: new DemoLLMProvider(),
      notifier: createNoopNotifier(),
    };
  }

  if (!config.anthropicApiKey) {
    // loadConfig() already enforces this for REAL mode, but keep the
    // invariant explicit here too rather than asserting with `!`.
    throw new Error("REAL mode requires ANTHROPIC_API_KEY");
  }

  const providers: NotificationProvider[] = [];
  if (config.slackWebhookUrl) providers.push(new SlackNotifier(config.slackWebhookUrl));
  // ResendNotifier (lib/orchestration/notifications/resendNotifier.ts) is
  // implemented and tested, but not wired in here: it needs a per-notification
  // recipient email address, which requires looking up the assigned
  // analyst's profile — a lookup this branch does not yet own. See
  // docs/ORCHESTRATION.md "Known limitations".

  return {
    config,
    store: new SupabaseOrchestrationStore(createServiceClient()),
    llm: new ClaudeProvider(config.anthropicApiKey, config.claudeModel),
    notifier: new NotificationDispatcher(providers),
  };
}

/** Test-only: reset the DEMO singleton between test cases. */
export function resetDemoStoreForTests(): void {
  globalThis.__amlDemoOrchestrationStore = undefined;
}
