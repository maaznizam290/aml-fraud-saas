import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Vitest doesn't auto-detect Testing Library's Jest-only cleanup hook —
// without this, each test's rendered DOM leaks into the next one.
afterEach(() => {
  cleanup();
});

// Component tests render App Router pages outside of Next's own router —
// stub the navigation hooks pages/components use so they don't crash.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
