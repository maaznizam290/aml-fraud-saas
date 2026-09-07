import { describe, expect, it } from "vitest";

import { buildHermesRuntime } from "../../lib/hermes/runtime.js";

describe("buildHermesRuntime", () => {
  it("DEMO mode returns an available LocalHermesProvider", () => {
    const runtime = buildHermesRuntime({ mode: "DEMO", enabled: true });
    expect(runtime.provider.available).toBe(true);
    expect(runtime.provider.providerName).toBe("local");
  });

  it("HERMES_ENABLED=false always yields the fail-safe provider, regardless of mode", () => {
    const runtime = buildHermesRuntime({ mode: "DEMO", enabled: false });
    expect(runtime.provider.available).toBe(false);
    expect(runtime.provider.providerName).toBe("unavailable");
  });

  it("required scenario: REAL mode without Supabase env vars degrades to the fail-safe provider instead of throwing", () => {
    const originalUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const originalKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];

    try {
      const runtime = buildHermesRuntime({ mode: "REAL", enabled: true });
      expect(runtime.provider.available).toBe(false);
      expect(runtime.provider.providerName).toBe("unavailable");
    } finally {
      if (originalUrl !== undefined) process.env["NEXT_PUBLIC_SUPABASE_URL"] = originalUrl;
      if (originalKey !== undefined) process.env["SUPABASE_SERVICE_ROLE_KEY"] = originalKey;
    }
  });
});
