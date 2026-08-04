import type { Metadata } from "next";

import { JsonLd } from "@/components/JsonLd";
import { HomePage } from "@/components/home/HomePage";
import { auth } from "@/lib/auth";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site";

export const metadata: Metadata = {
  title: "Book Sports Courts in the Philippines | Bunal.club",
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Book Sports Courts Across the Philippines | Bunal.club",
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    locale: "en_PH",
    type: "website",
  },
};

const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/bunal-logo-v2-wordmark.png"),
      description: SITE_DESCRIPTION,
      areaServed: {
        "@type": "Country",
        name: "Philippines",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "en-PH",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: "Book sports courts across the Philippines",
      description: SITE_DESCRIPTION,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-PH",
    },
  ],
};

export default async function Home() {
  const session = await auth();

  return (
    <>
      <JsonLd data={homeJsonLd} />
      <HomePage isLoggedIn={Boolean(session?.user?.id)} />
    </>
  );
}
