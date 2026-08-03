import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(value: Buffer): string {
  let bits = 0;
  let accumulator = 0;
  let encoded = "";
  for (const byte of value) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    encoded += BASE32_ALPHABET[(accumulator << (5 - bits)) & 31];
  }
  return encoded;
}

function base32Decode(value: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/g, "")) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid base32 secret");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpCode(secret: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto
    .createHmac("sha1", base32Decode(secret))
    .update(message)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(secret: string, code: string): boolean {
  const normalized = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (const offset of [-30_000, 0, 30_000]) {
    const expected = Buffer.from(totpCode(secret, Date.now() + offset));
    const actual = Buffer.from(normalized);
    if (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    ) {
      return true;
    }
  }
  return false;
}

export function authenticatorUri({
  secret,
  email,
}: {
  secret: string;
  email: string;
}): string {
  const issuer = "Bunal.club";
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

