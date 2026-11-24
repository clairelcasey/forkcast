import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// publicEnv() caches its result, so load a fresh module for each test.
async function loadPublicEnv() {
  vi.resetModules();
  const { publicEnv } = await import("./env");
  return publicEnv;
}

describe("publicEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the Supabase URL and publishable key", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const publicEnv = await loadPublicEnv();
    expect(publicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
  });

  it("throws a setup hint when a value is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const publicEnv = await loadPublicEnv();
    expect(() => publicEnv()).toThrow(/\.env\.example/);
  });

  it("rejects a URL that isn't a URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const publicEnv = await loadPublicEnv();
    expect(() => publicEnv()).toThrow();
  });
});
