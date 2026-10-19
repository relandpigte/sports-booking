import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import type {
  LeaderboardSnapshot,
  RankingEntry,
  RatingReliability,
} from "@/lib/leaderboard";

const API_VERSION = "v1.0";
const SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
// DUPR's batch user lookup accepts at most this many IDs per request.
export const DUPR_BATCH_LIMIT = 100;
// A DUPR ID as DUPR issues it: six upper-case letters or digits.
export const DUPR_ID_PATTERN = /^[A-Z0-9]{6}$/;

const partnerConfigSchema = z.object({
  baseUrl: z.string().url().transform((value) => value.replace(/\/+$/, "")),
  clientKey: z.string().min(1),
  clientSecret: z.string().min(1),
});

const configSchema = partnerConfigSchema.extend({
  clubId: z.coerce.number().int().positive().safe(),
});

const tokenResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  result: z.object({
    token: z.string().min(1),
    expiry: z.string().datetime().optional(),
  }),
});

const ratingSchema = z
  .union([
    z.number().min(2).max(8),
    z
      .string()
      .trim()
      .regex(/^\d(?:\.\d+)?$/)
      .transform(Number)
      .pipe(z.number().min(2).max(8)),
  ])
  .nullable()
  .optional();

const memberSchema = z.object({
  id: z.string().trim().min(1).max(32),
  fullName: z.string().trim().min(1).max(160),
  ratings: z.object({
    singles: ratingSchema,
    doubles: ratingSchema,
    isSinglesReliable: z.boolean().optional(),
    isDoublesReliable: z.boolean().optional(),
  }),
});

const membersResponseSchema = z.object({
  status: z.literal("SUCCESS"),
  results: z.array(memberSchema),
});

// A batch lookup may describe an unrated player with "NR" or similar, which
// must not fail the whole response, so unreadable ratings become null.
const batchMemberSchema = memberSchema.extend({
  ratings: z.object({
    singles: ratingSchema.catch(null),
    doubles: ratingSchema.catch(null),
    isSinglesReliable: z.boolean().optional().catch(undefined),
    isDoublesReliable: z.boolean().optional().catch(undefined),
  }),
});

const batchBodySchema = z.object({
  users: z.array(batchMemberSchema),
  notFound: z.array(z.string()).default([]),
});

// The published spec documents the batch body but not whether it arrives in
// the usual { status, result } envelope, so both shapes are accepted.
const batchResponseSchema = z.union([
  z
    .object({ status: z.literal("SUCCESS"), result: batchBodySchema })
    .transform((value) => value.result),
  batchBodySchema,
]);

export type DuprPartnerConfig = z.infer<typeof partnerConfigSchema>;
export type DuprConfig = z.infer<typeof configSchema>;
type DuprMember = z.infer<typeof memberSchema>;
type Fetcher = typeof fetch;

// A DUPR player as Bunal.club stores and shows them.
export type DuprPlayer = {
  duprId: string;
  fullName: string;
  singles: number | null;
  doubles: number | null;
  singlesReliable: boolean;
  doublesReliable: boolean;
};

type TokenCache = {
  key: string;
  token: string;
  expiresAt: number;
};

type SnapshotCache = {
  key: string;
  expiresAt: number;
  value: Promise<Extract<LeaderboardSnapshot, { status: "available" }>>;
};

let tokenCache: TokenCache | null = null;
let snapshotCache: SnapshotCache | null = null;

export class DuprApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "DuprApiError";
  }
}

function partnerKey(config: DuprPartnerConfig): string {
  return createHash("sha256")
    .update(
      [config.baseUrl, config.clientKey, config.clientSecret].join("\u0000")
    )
    .digest("hex");
}

function configKey(config: DuprConfig): string {
  return createHash("sha256")
    .update(`${partnerKey(config)}\u0000${config.clubId}`)
    .digest("hex");
}

function rawPartnerConfig() {
  return {
    baseUrl: process.env.DUPR_API_BASE_URL?.trim() ?? "",
    clientKey: process.env.DUPR_CLIENT_KEY?.trim() ?? "",
    clientSecret: process.env.DUPR_CLIENT_SECRET?.trim() ?? "",
  };
}

// The partner API credentials alone: enough for player lookups. The club
// leaderboard additionally needs DUPR_CLUB_ID (readConfig below).
export function readPartnerConfig(): DuprPartnerConfig | null {
  const raw = rawPartnerConfig();
  if (Object.values(raw).some((value) => !value)) return null;

  const parsed = partnerConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("DUPR configuration is invalid.", parsed.error.flatten());
    return null;
  }
  return parsed.data;
}

function readConfig(): DuprConfig | null {
  const raw = {
    ...rawPartnerConfig(),
    clubId: process.env.DUPR_CLUB_ID?.trim() ?? "",
  };

  if (Object.values(raw).some((value) => !value)) return null;

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("DUPR configuration is invalid.", parsed.error.flatten());
    return null;
  }

  return parsed.data;
}

// DUPR's consent page for this partner. Players open it to connect their DUPR
// account, and its origin is the only one whose messages are accepted.
export function readSsoConfig(): { url: string; origin: string } | null {
  const value = process.env.DUPR_SSO_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      console.error("DUPR_SSO_URL must use https.");
      return null;
    }
    return { url: url.toString(), origin: url.origin };
  } catch {
    console.error("DUPR_SSO_URL is not a valid URL.");
    return null;
  }
}

// Players can connect DUPR only when both the partner API and the consent
// page are configured.
export function duprLinkingAvailable(): boolean {
  return readPartnerConfig() !== null && readSsoConfig() !== null;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function postJson(
  url: string,
  init: RequestInit,
  fetcher: Fetcher
): Promise<unknown> {
  const response = await fetcher(url, {
    ...init,
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new DuprApiError(
      `DUPR returned HTTP ${response.status}.`,
      response.status,
      response.headers.get("X-Request-Id")
    );
  }

  return body;
}

async function getToken(
  config: DuprPartnerConfig,
  fetcher: Fetcher,
  forceRefresh = false
): Promise<string> {
  const key = partnerKey(config);
  if (
    !forceRefresh &&
    tokenCache?.key === key &&
    tokenCache.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER_MS
  ) {
    return tokenCache.token;
  }

  const encodedCredentials = Buffer.from(
    `${config.clientKey}:${config.clientSecret}`
  ).toString("base64");
  const body = await postJson(
    `${config.baseUrl}/auth/${API_VERSION}/token`,
    {
      headers: {
        Accept: "application/json",
        "x-authorization": encodedCredentials,
      },
    },
    fetcher
  );
  const parsed = tokenResponseSchema.parse(body);
  const parsedExpiry = parsed.result.expiry
    ? Date.parse(parsed.result.expiry)
    : Number.NaN;
  const expiresAt = Number.isFinite(parsedExpiry)
    ? parsedExpiry
    : Date.now() + 55 * 60 * 1000;

  tokenCache = { key, token: parsed.result.token, expiresAt };
  return parsed.result.token;
}

// Runs an authenticated partner request, refreshing the token once if DUPR
// rejects it as expired.
async function withPartnerToken<T>(
  config: DuprPartnerConfig,
  fetcher: Fetcher,
  request: (token: string) => Promise<T>
): Promise<T> {
  try {
    return await request(await getToken(config, fetcher));
  } catch (error) {
    if (!(error instanceof DuprApiError) || error.status !== 401) throw error;
    return request(await getToken(config, fetcher, true));
  }
}

async function getMembers(
  config: DuprConfig,
  fetcher: Fetcher,
  forceTokenRefresh = false
): Promise<DuprMember[]> {
  const token = await getToken(config, fetcher, forceTokenRefresh);
  const body = await postJson(
    `${config.baseUrl}/club/${API_VERSION}/members`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clubId: config.clubId }),
    },
    fetcher
  );

  return membersResponseSchema.parse(body).results;
}

function toPlayer(member: z.infer<typeof batchMemberSchema>): DuprPlayer {
  return {
    duprId: member.id,
    fullName: member.fullName,
    singles: member.ratings.singles ?? null,
    doubles: member.ratings.doubles ?? null,
    singlesReliable: member.ratings.isSinglesReliable === true,
    doublesReliable: member.ratings.isDoublesReliable === true,
  };
}

// Looks up DUPR players by ID (POST /user/v1.0/batch, permission
// USER::DETAIL). For a restricted partner, DUPR returns only players who have
// connected Bunal.club through its consent page; everyone else is notFound.
export async function fetchDuprUsers(
  input: DuprPartnerConfig,
  duprIds: string[],
  fetcher: Fetcher = fetch
): Promise<{ users: DuprPlayer[]; notFound: string[] }> {
  const config = partnerConfigSchema.parse(input);
  const ids = [...new Set(duprIds)].filter((id) => DUPR_ID_PATTERN.test(id));
  const users: DuprPlayer[] = [];
  const notFound: string[] = [];

  for (let start = 0; start < ids.length; start += DUPR_BATCH_LIMIT) {
    const chunk = ids.slice(start, start + DUPR_BATCH_LIMIT);
    const body = await withPartnerToken(config, fetcher, (token) =>
      postJson(
        `${config.baseUrl}/user/${API_VERSION}/batch`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ duprIds: chunk }),
        },
        fetcher
      )
    );
    const parsed = batchResponseSchema.parse(body);
    users.push(...parsed.users.map(toPlayer));
    notFound.push(...parsed.notFound);
  }

  return { users, notFound };
}

// Confirms a DUPR ID reported by the consent page before it is linked.
//
// DUPR's published spec does not describe what its consent page returns, so
// this relies on the documented restricted-partner rule: only players who
// consented to Bunal.club are visible to its partner token. This is the one
// place to tighten once DUPR confirms its flow (for example, by checking a
// user token it returns against the same DUPR ID).
export async function verifyDuprConsent(
  config: DuprPartnerConfig,
  duprId: string,
  fetcher: Fetcher = fetch
): Promise<DuprPlayer | null> {
  if (!DUPR_ID_PATTERN.test(duprId)) return null;
  const { users } = await fetchDuprUsers(config, [duprId], fetcher);
  return users.find((user) => user.duprId === duprId) ?? null;
}

function reliability(
  rating: number | null,
  reliable: boolean | undefined
): RatingReliability {
  if (rating == null) return "not-rated";
  if (reliable === true) return "reliable";
  if (reliable === false) return "provisional";
  return "unknown";
}

function ranking(
  members: DuprMember[],
  format: "singles" | "doubles"
): RankingEntry[] {
  const reliabilityKey =
    format === "singles" ? "isSinglesReliable" : "isDoublesReliable";

  return members
    .map((member) => {
      const rating = member.ratings[format] ?? null;
      return {
        duprId: member.id,
        fullName: member.fullName,
        rating,
        reliability: reliability(rating, member.ratings[reliabilityKey]),
      };
    })
    .sort((left, right) => {
      if (left.rating == null && right.rating != null) return 1;
      if (left.rating != null && right.rating == null) return -1;
      if (left.rating != null && right.rating != null) {
        const ratingDifference = right.rating - left.rating;
        if (ratingDifference) return ratingDifference;
      }
      return left.fullName.localeCompare(right.fullName);
    });
}

export async function fetchDuprLeaderboard(
  input: DuprConfig,
  fetcher: Fetcher = fetch
): Promise<Extract<LeaderboardSnapshot, { status: "available" }>> {
  const config = configSchema.parse(input);
  let members: DuprMember[];

  try {
    members = await getMembers(config, fetcher);
  } catch (error) {
    if (!(error instanceof DuprApiError) || error.status !== 401) throw error;
    members = await getMembers(config, fetcher, true);
  }

  return {
    status: "available",
    updatedAt: new Date().toISOString(),
    singles: ranking(members, "singles"),
    doubles: ranking(members, "doubles"),
  };
}

export async function getDuprLeaderboard(): Promise<LeaderboardSnapshot> {
  const config = readConfig();
  if (!config) return { status: "unconfigured" };

  const key = configKey(config);
  if (
    snapshotCache?.key === key &&
    snapshotCache.expiresAt > Date.now()
  ) {
    return resolveSnapshot(snapshotCache.value);
  }

  const value = fetchDuprLeaderboard(config);
  snapshotCache = {
    key,
    expiresAt: Date.now() + SNAPSHOT_TTL_MS,
    value,
  };

  return resolveSnapshot(value);
}

async function resolveSnapshot(
  value: Promise<Extract<LeaderboardSnapshot, { status: "available" }>>
): Promise<LeaderboardSnapshot> {
  try {
    return await value;
  } catch (error) {
    if (snapshotCache?.value === value) snapshotCache = null;
    const requestId = error instanceof DuprApiError ? error.requestId : null;
    console.error("Unable to refresh DUPR leaderboard.", {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { status: "unavailable" };
  }
}
