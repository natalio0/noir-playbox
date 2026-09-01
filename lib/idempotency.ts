import { createHash } from "node:crypto";

export function normalizeIdempotencyKey(value: unknown): string | null {
  const key = String(value ?? "").trim();
  if (!key) return null;
  if (key.length > 160) throw new Error("IDEMPOTENCY_KEY_INVALID");
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  return key;
}

export function idempotencyDocumentId(scope: string, uid: string, key: string) {
  return createHash("sha256")
    .update(`${scope}:${uid}:${key}`)
    .digest("hex")
    .slice(0, 40);
}
