import type { Metadata } from "next";

import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/site";

export function buildEventMetadata({
  publicId,
  title,
  description,
}: {
  publicId: string;
  title: string;
  description: string;
}): Metadata {
  const pageTitle = `${title} — Bunal.club`;
  const url = absoluteUrl(`/events/${publicId}`);

  return {
    title: pageTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: pageTitle,
      description,
      url,
      siteName: SITE_NAME,
      images: [DEFAULT_SOCIAL_IMAGE],
      locale: "en_PH",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [DEFAULT_SOCIAL_IMAGE],
    },
  };
}
