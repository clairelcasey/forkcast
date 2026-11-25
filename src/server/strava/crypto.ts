import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Strava tokens are encrypted before they reach the database (AES-256-GCM).
// The key exists only in the server environment, never in the database.

const VERSION = "v1";

function key(raw = process.env.TOKEN_ENCRYPTION_KEY): Buffer {
  if (!raw)
    throw new Error("TOKEN_ENCRYPTION_KEY is not set. See .env.example.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  }
  return buf;
}

export function encryptToken(plain: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64")))
    .join(":");
}

export function decryptToken(stored: string, rawKey?: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Unrecognized token format");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(rawKey),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
