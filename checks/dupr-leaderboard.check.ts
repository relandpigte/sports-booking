// DUPR leaderboard requests stay server-side and preserve the two rating lanes.
//
//   npm run check:leaderboard
import { ok, report } from "./harness";
import {
  fetchDuprLeaderboard,
  getDuprLeaderboard,
  type DuprConfig,
} from "@/lib/dupr";

const config: DuprConfig = {
  baseUrl: "https://dupr-check.example.test/api",
  clientKey: "check-client",
  clientSecret: "check-secret",
  clubId: 102387102937,
};

const requests: Array<{ url: string; init?: RequestInit }> = [];
const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  requests.push({ url, init });

  if (url.endsWith("/auth/v1.0/token")) {
    return new Response(
      JSON.stringify({
        status: "SUCCESS",
        result: {
          token: "leaderboard-token",
          expiry: "2099-01-01T00:00:00.000Z",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      status: "SUCCESS",
      results: [
        {
          id: "PLAYER1",
          fullName: "Ana Santos",
          ratings: {
            singles: "4.125",
            doubles: "3.800",
            isSinglesReliable: true,
            isDoublesReliable: false,
          },
        },
        {
          id: "PLAYER2",
          fullName: "Ben Cruz",
          ratings: {
            singles: "4.500",
            doubles: null,
            isSinglesReliable: false,
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}) as typeof fetch;

async function check() {
  const snapshot = await fetchDuprLeaderboard(config, fetcher);

  ok(
    "DUPR authentication happens before the club request",
    requests.length === 2
  );
  ok(
    "credentials are sent in the server-only authorization header",
    new Headers(requests[0]?.init?.headers).get("x-authorization") ===
      Buffer.from("check-client:check-secret").toString("base64")
  );
  ok(
    "club members use the bearer token",
    new Headers(requests[1]?.init?.headers).get("Authorization") ===
      "Bearer leaderboard-token"
  );
  ok(
    "the configured numeric club id is sent to DUPR",
    requests[1]?.init?.body === JSON.stringify({ clubId: config.clubId })
  );
  ok(
    "Singles and Doubles are sorted independently",
    snapshot.singles.map((entry) => entry.fullName).join(",") ===
      "Ben Cruz,Ana Santos" &&
      snapshot.doubles.map((entry) => entry.fullName).join(",") ===
        "Ana Santos,Ben Cruz"
  );
  ok(
    "unrated formats stay visible as NR-ready null ratings",
    snapshot.doubles[1]?.rating === null &&
      snapshot.doubles[1]?.reliability === "not-rated"
  );
  ok(
    "DUPR reliability is preserved per format",
    snapshot.singles[0]?.reliability === "provisional" &&
      snapshot.singles[1]?.reliability === "reliable"
  );

  const envNames = [
    "DUPR_API_BASE_URL",
    "DUPR_CLIENT_KEY",
    "DUPR_CLIENT_SECRET",
    "DUPR_CLUB_ID",
  ] as const;
  const originalEnv = Object.fromEntries(
    envNames.map((name) => [name, process.env[name]])
  );
  for (const name of envNames) delete process.env[name];
  try {
    ok(
      "missing credentials produce the honest unconfigured state",
      (await getDuprLeaderboard()).status === "unconfigured"
    );
  } finally {
    for (const name of envNames) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

void check().then(report, (error) => {
  console.error(error);
  ok(
    "DUPR leaderboard check completed without an unexpected exception",
    false
  );
  report();
});
