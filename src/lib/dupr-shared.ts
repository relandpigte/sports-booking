// A connected player's DUPR ratings as the UI shows them. Safe for client
// components; the server builds it with toDuprRatingView in dupr-link.ts.
export type DuprRatingView = {
  duprId: string;
  doubles: number | null;
  singles: number | null;
  doublesReliable: boolean;
  singlesReliable: boolean;
};

export function formatDuprRating(value: number | null): string {
  return value == null ? "NR" : value.toFixed(3);
}

const DUPR_ID = /^[A-Z0-9]{6}$/;

// Reads the DUPR ID from the message DUPR's consent window posts back. DUPR
// has not published that message's shape, so this accepts the likely forms
// (an object or JSON string carrying duprId / id, possibly under user or
// result). The browser can be lied to, so the server re-checks every ID with
// DUPR before linking; see verifyDuprConsent for what that check proves.
export function duprIdFromConsentMessage(data: unknown): string | null {
  let value: unknown = data;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const candidates: unknown[] = [];
  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    candidates.push(record.duprId, record.duprID, record.dupr_id, record.id);
  };
  collect(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    collect(record.user);
    collect(record.result);
    collect(record.data);
  }
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const id = candidate.trim().toUpperCase();
    if (DUPR_ID.test(id)) return id;
  }
  return null;
}
