// Facebook page normalisation.
//
//   npm run check:social
//
// Pure functions, no database. The reason this is worth a check at all: the
// field is deliberately forgiving, and "forgiving" is one character away from
// "accepts anything". A venue pasting a Messenger link or a rival's site should
// be told, not stored.
import { ok, run } from "./harness";
import { facebookPageLabel, facebookPageUrl } from "@/lib/social";

const CANON = "https://www.facebook.com/picklecourt";

async function check() {
  // --- The shapes people actually paste --------------------------------------
  const accepted: [string, string][] = [
    ["picklecourt", CANON],
    ["@picklecourt", CANON],
    ["facebook.com/picklecourt", CANON],
    ["www.facebook.com/picklecourt", CANON],
    ["http://facebook.com/picklecourt", CANON],
    ["https://www.facebook.com/picklecourt", CANON],
    ["https://m.facebook.com/picklecourt", CANON],
    ["https://web.facebook.com/picklecourt", CANON],
    ["fb.com/picklecourt", CANON],
    ["https://fb.me/picklecourt", CANON],
    ["  https://www.facebook.com/picklecourt/  ", CANON],
    ["https://www.facebook.com/@picklecourt", CANON],
    // Tracking parameters are not part of the identity.
    ["https://www.facebook.com/picklecourt?ref=bookmarks&mibextid=abc", CANON],
    // Trailing path — a page's photos tab is still that page.
    ["https://www.facebook.com/picklecourt/photos", CANON],
    // Dots and hyphens are legal in a page name.
    ["https://www.facebook.com/Pickle.Court-PH", "https://www.facebook.com/Pickle.Court-PH"],
    // An older page reachable only by numeric id.
    [
      "https://www.facebook.com/profile.php?id=61550123456789",
      "https://www.facebook.com/profile.php?id=61550123456789",
    ],
  ];

  const wrong = accepted.filter(([input, want]) => facebookPageUrl(input) !== want);
  ok(
    `every accepted shape canonicalises (${accepted.length} of them)`,
    wrong.length === 0
  );
  for (const [input] of wrong) console.log(`    got ${facebookPageUrl(input)} for ${input}`);

  // --- What must be refused --------------------------------------------------
  const refused = [
    "",
    "   ",
    "ab", // too short to be a page name
    "not a url at all!",
    "https://instagram.com/picklecourt",
    "https://facebook.evil.com/picklecourt",
    "https://notfacebook.com/picklecourt",
    "https://www.facebook.com/", // no page
    "https://www.facebook.com/profile.php?id=abc", // id must be numeric
    "https://www.facebook.com/page name with spaces",
    "javascript:alert(1)",
    "https://www.facebook.com/../etc",
  ];
  const leaked = refused.filter((input) => facebookPageUrl(input) !== null);
  ok(`everything invalid is refused (${refused.length} cases)`, leaked.length === 0);
  for (const input of leaked) console.log(`    accepted ${JSON.stringify(input)}`);

  // The one that matters most: whatever comes out is always a facebook.com URL,
  // because it gets rendered as a link an admin will click.
  const outputs = accepted
    .map(([input]) => facebookPageUrl(input))
    .filter((v): v is string => v !== null);
  ok(
    "every output is an https facebook.com URL",
    outputs.every((u) => u.startsWith("https://www.facebook.com/"))
  );
  ok(
    "and never carries a query except a profile id",
    outputs.every((u) => !u.includes("?") || u.includes("profile.php?id="))
  );

  // --- Display ---------------------------------------------------------------
  ok(
    "the label drops the scheme and www",
    facebookPageLabel(CANON) === "facebook.com/picklecourt"
  );
  ok(
    "and leaves a bare host alone",
    facebookPageLabel("facebook.com/x") === "facebook.com/x"
  );

  // --- Idempotence -----------------------------------------------------------
  // A stored value re-submitted through an edit form must not drift.
  ok(
    "normalising twice changes nothing",
    outputs.every((u) => facebookPageUrl(u) === u)
  );
}

void run(check);
