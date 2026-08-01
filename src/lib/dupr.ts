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

const configSchema = z.object({
  baseUrl: z.string().url().transform((value) => value.replace(/\/+$/, "")),
  clientKey: z.string().min(1),
  clientSecret: z.string().min(1),
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

export type DuprConfig = z.infer<typeof configSchema>;
type DuprMember = z.infer<typeof memberSchema>;
type Fetcher = typeof fetch;

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

class DuprApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null
  ) {
    super(message);
    this.name = "DuprApiError";
  }
}

function configKey(config: DuprConfig): string {
  return createHash("sha256")
    .update(
      [config.baseUrl, config.clientKey, config.clientSecret, config.clubId].join(
        "\u0000"
      )
    )
    .digest("hex");
}

function readConfig(): DuprConfig | null {
  const raw = {
    baseUrl: process.env.DUPR_API_BASE_URL?.trim() ?? "",
    clientKey: process.env.DUPR_CLIENT_KEY?.trim() ?? "",
    clientSecret: process.env.DUPR_CLIENT_SECRET?.trim() ?? "",
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
  config: DuprConfig,
  fetcher: Fetcher,
  forceRefresh = false
): Promise<string> {
  const key = configKey(config);
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
