// Hub public URL normalization and validation.
//
//   npm run check:hub-slug
import { ok, report } from "./harness";
import {
  HUB_SLUG_MAX_LENGTH,
  hubPublicPath,
  normalizeHubSlug,
  slugifyHubName,
} from "@/lib/hub-slug";
import { HubSlugSchema } from "@/lib/validation";

const examples: Array<[string, string]> = [
  ["Bunal Club", "bunal-club"],
  ["Café & Courts Bohol", "cafe-and-courts-bohol"],
  ["  Juan's Sports Hub!!!  ", "juans-sports-hub"],
  ["Already---Slugged", "already-slugged"],
];

ok(
  "hub names normalize into stable URL slugs",
  examples.every(([input, expected]) => slugifyHubName(input) === expected)
);
ok(
  "custom slug input uses the same normalization",
  normalizeHubSlug("My Custom URL!!") === "my-custom-url"
);

const longSlug = slugifyHubName(`${"court-".repeat(20)}club`);
ok(
  "generated slugs respect the limit without a trailing hyphen",
  longSlug.length <= HUB_SLUG_MAX_LENGTH && !longSlug.endsWith("-")
);

const accepted = ["bunal-club", "court-24", "abc"];
ok(
  "valid public URL slugs are accepted",
  accepted.every((slug) => HubSlugSchema.safeParse(slug).success)
);

const rejected = ["new", "ab", "Bunal-Club", "bunal club", "-bunal", "bunal-"];
ok(
  "reserved or malformed slugs are rejected",
  rejected.every((slug) => !HubSlugSchema.safeParse(slug).success)
);

ok(
  "public paths prefer a slug and fall back to legacy ids",
  hubPublicPath({ id: "hub_123", slug: "bunal-club" }) ===
    "/hubs/bunal-club" &&
    hubPublicPath({ id: "hub_123", slug: null }) === "/hubs/hub_123"
);

report();
