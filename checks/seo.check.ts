// Nationwide SEO positioning and public metadata invariants.
//
//   npm run check:seo
import { readFile } from "node:fs/promises";

import { ok, report } from "./harness";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

const nationwideFiles = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/hubs/page.tsx",
  "src/app/events/page.tsx",
  "src/app/opengraph-image.tsx",
  "src/app/register/page.tsx",
  "src/components/AuthLayout.tsx",
  "src/components/registration/RegistrationSuccessPage.tsx",
  "src/components/home/HomePage.tsx",
  "src/components/hubs/HubDirectory.tsx",
  "src/components/dashboard/home/PlayerHome.tsx",
  "src/lib/welcome-email.ts",
  "src/lib/email-html.ts",
];

async function check() {
  const entries = await Promise.all(
    nationwideFiles.map(async (path) => ({
      path,
      source: await readFile(path, "utf8"),
    }))
  );
  const homeSource = entries.find(({ path }) => path === "src/app/page.tsx")
    ?.source;
  const layoutSource = entries.find(
    ({ path }) => path === "src/app/layout.tsx"
  )?.source;

  ok(
    "the shared site description targets the Philippines",
    SITE_DESCRIPTION.includes("across the Philippines") &&
      !SITE_DESCRIPTION.includes("Bohol")
  );
  ok(
    "public positioning no longer limits discovery to Bohol",
    entries.every(({ source }) => !/\bBohol\b/i.test(source))
  );
  ok(
    "the organization schema declares the Philippines as its service country",
    homeSource?.includes('"@type": "Country"') === true &&
      homeSource.includes('name: "Philippines"')
  );
  ok(
    "default, Open Graph, and Twitter titles are nationwide",
    (layoutSource?.match(/Book Sports Courts in the Philippines/g)?.length ??
      0) === 3
  );
  ok(
    "canonical metadata uses the final production hostname",
    SITE_URL === "https://www.bunal.club"
  );
}

void check()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(report);
