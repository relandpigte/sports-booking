import "server-only";

import crypto from "node:crypto";

// AES-256-GCM at rest for partner gateway credentials.
//
// WHAT THIS PROTECTS AGAINST, precisely:
//   YES — a Postgres dump, a leaked backup, a read replica, a `SELECT *` in a
//         support tool, a laptop with a database export on it. The ciphertext
//         is useless without ENCRYPTION_KEY, which lives only in the app's
//         environment and is never written to the database.
//   NO  — a compromised app server. Anything running in this process can call
//         decrypt(), and anything that can read the environment has the key.
//   NO  — an operator with production shell access.
//
// It is a real reduction in blast radius, not a vault. Saying so plainly beats
// implying more.
//
// Nothing in this file may log. No console.*, and no error message ever
// includes plaintext, ciphertext or key material.

const VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

type KeyRing = {
  currentId: string;
  current: Buffer;
  all: Map<string, Buffer>;
};

let cached: KeyRing | null | undefined;

// "k1:<base64 of 32 random bytes>"
function parseKey(entry: string): { id: string; key: Buffer } | null {
  const idx = entry.indexOf(":");
  if (idx <= 0) return null;
  const id = entry.slice(0, idx).trim();
  const b64 = entry.slice(idx + 1).trim();
  if (!id || !b64) return null;
  let key: Buffer;
  try {
    key = Buffer.from(b64, "base64");
  } catch {
    return null;
  }
  if (key.length !== KEY_BYTES) return null;
  return { id, key };
}

function keyRing(): KeyRing | null {
  if (cached !== undefined) return cached;

  const current = parseKey(process.env.ENCRYPTION_KEY ?? "");
  if (!current) {
    cached = null;
    return cached;
  }

  const all = new Map<string, Buffer>([[current.id, current.key]]);
  // Rotation: mint a new id into ENCRYPTION_KEY and move the old value here.
  // Existing rows keep decrypting and get re-encrypted with the new key the
  // next time they're written — nothing has to be migrated at once.
  for (const entry of (process.env.ENCRYPTION_KEYS_PREVIOUS ?? "").split(",")) {
    const parsed = parseKey(entry);
    if (parsed && !all.has(parsed.id)) all.set(parsed.id, parsed.key);
  }

  cached = { currentId: current.id, current: current.key, all };
  return cached;
}

// Connecting a gateway must REFUSE when this is false — never fall back to
// storing a secret in plaintext.
export function isEncryptionConfigured(): boolean {
  return keyRing() !== null;
}

const b64u = (b: Buffer) => b.toString("base64url");

/**
 * Returns "v1.<keyId>.<iv>.<tag>.<ciphertext>", all base64url.
 *
 * `purpose` is bound in as GCM additional authenticated data, so a ciphertext
 * cannot be moved from the webhook-secret column into the secret-key column and
 * still decrypt. It deliberately does NOT bind to a row id — the row doesn't
 * exist yet at encrypt time — so an attacker who can WRITE to the database
 * could swap two partners' whole rows. Accepted: that attacker can already do
 * worse.
 */
export function encrypt(plaintext: string, purpose: string): string {
  const ring = keyRing();
  if (!ring) {
    throw new Error("ENCRYPTION_KEY is not configured");
  }
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", ring.current, iv);
  cipher.setAAD(Buffer.from(purpose, "utf8"));
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${ring.currentId}.${b64u(iv)}.${b64u(tag)}.${b64u(ct)}`;
}

// Throws DecryptionError on a bad version, an unknown key id, tampering, or a
// purpose mismatch. Never returns a partial or best-effort result.
export function decrypt(token: string, purpose: string): string {
  const ring = keyRing();
  if (!ring) throw new DecryptionError("Encryption is not configured");

  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new DecryptionError("Unrecognised ciphertext format");
  }
  const [, keyId, ivB64, tagB64, ctB64] = parts;

  const key = ring.all.get(keyId);
  if (!key) throw new DecryptionError("Unknown encryption key id");

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(ivB64, "base64url")
    );
    decipher.setAAD(Buffer.from(purpose, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Deliberately opaque — the underlying error can carry key details.
    throw new DecryptionError("Could not decrypt value");
  }
}

// Whether a stored value was written with a key other than the current one, so
// callers can re-encrypt opportunistically after a rotation.
export function needsReencryption(token: string): boolean {
  const ring = keyRing();
  if (!ring) return false;
  const parts = token.split(".");
  return parts.length === 5 && parts[1] !== ring.currentId;
}

// "sk_test_51Hxxxxxxxxxxxx9f2a" -> "…9f2a". Stored in PLAINTEXT beside the
// ciphertext so the connected-state UI never needs a key in memory.
export function secretHint(value: string): string {
  const tail = value.slice(-4);
  return tail ? `…${tail}` : "…";
}

// Purposes — the AAD values. Kept here so a typo can't silently weaken the
// binding at a call site.
export const CRYPTO_PURPOSE = {
  gatewaySecretKey: "partner-gateway.secretKey",
  gatewayWebhookSecret: "partner-gateway.webhookSecret",
  platformGatewaySecretKey: "platform-gateway.secretKey",
  platformGatewayWebhookSecret: "platform-gateway.webhookSecret",
} as const;
