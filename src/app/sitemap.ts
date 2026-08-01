import type { MetadataRoute } from "next";

import { listPublicHubs } from "@/lib/hubs";
import { hubPublicPath } from "@/lib/hub-slug";
import { absoluteUrl, isPublicHttpUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hubs = await listPublicHubs();

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
