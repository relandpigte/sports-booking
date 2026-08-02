import type { MetadataRoute } from "next";

import { listPublicHubs } from "@/lib/hubs";
import { hubPublicPath } from "@/lib/hub-slug";
import { listPublicEventSitemapEntries } from "@/lib/events";
import { absoluteUrl, isPublicHttpUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [hubsResult, eventsResult] = await Promise.allSettled([
    listPublicHubs(),
    listPublicEventSitemapEntries(),
  ]);

  // Keep the static sitemap available to crawlers when a database-backed
  // section is temporarily unavailable. Dynamic URLs will return on the next
  // successful request instead of making the complete sitemap respond with 500.
  if (hubsResult.status === "rejected") {
    console.error("Unable to add public hubs to the sitemap.", hubsResult.reason);
  }
  if (eventsResult.status === "rejected") {
    console.error(
      "Unable to add public events to the sitemap.",
      eventsResult.reason
    );
  }

  const hubs = hubsResult.status === "fulfilled" ? hubsResult.value : [];
  const events = eventsResult.status === "fulfilled" ? eventsResult.value : [];

  return [
    {
      url: absoluteUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/hubs"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/leaderboard"),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/events"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...events.map((event) => ({
      url: absoluteUrl(`/events/${event.publicId}`),
      lastModified: event.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...hubs.map((hub) => ({
      url: absoluteUrl(hubPublicPath(hub)),
      lastModified: hub.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: hub.coverPhotos.filter(isPublicHttpUrl),
    })),
    {
      url: absoluteUrl("/privacy"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: absoluteUrl("/terms"),
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
