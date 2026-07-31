export const HUB_SLUG_MAX_LENGTH = 60;

export function slugifyHubName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, HUB_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function normalizeHubSlug(value: string): string {
  return slugifyHubName(value);
}

export function hubPublicPath(hub: {
  id: string;
  slug?: string | null;
}): string {
  return `/hubs/${hub.slug || hub.id}`;
}
