import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("token encryption", () => {
  it("round-trips and never stores the plain token", () => {
    const stored = encryptToken("refresh-abc123", key);
    expect(stored).not.toContain("refresh-abc123");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(decryptToken(stored, key)).toBe("refresh-abc123");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("rejects a tampered value or the wrong key", () => {
    const stored = encryptToken("refresh-abc123", key);
    const parts = stored.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptToken(parts.join(":"), key)).toThrow();
    expect(() =>
      decryptToken(stored, randomBytes(32).toString("base64")),
    ).toThrow();
  });

  it("refuses a missing or short key", () => {
    expect(() => encryptToken("x", "")).toThrow(/TOKEN_ENCRYPTION_KEY/);
    expect(() =>
      encryptToken("x", Buffer.alloc(16).toString("base64")),
    ).toThrow(/32 bytes/);
  });
});
