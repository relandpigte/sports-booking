// A Facebook page, however the venue happened to type it.
//
// In the Philippines a venue's Facebook page is often their whole web presence,
// so this is asked for at signup — and asked for loosely. People paste
// "@PickleCourtPH", "facebook.com/picklecourt", the full https URL with a pile
// of tracking parameters, or an m.facebook.com link off their phone. All of
// those mean the same page, so all of them are accepted and stored one way.

// Hosts that are really Facebook. A link to anywhere else is a mistake worth
// pointing out rather than storing.
const HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "fb.com",
  "www.fb.com",
  "fb.me",
]);

// Page names allow letters, digits, dots and hyphens. `profile.php` is kept as
// a special case because an older venue page is sometimes only reachable that
// way.
const HANDLE = /^[A-Za-z0-9.-]{3,100}$/;

// Returns the canonical URL, or null when the input isn't a page at all.
// An empty string returns null too — the caller decides whether that's allowed.
export function facebookPageUrl(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  // A bare handle, with or without the @ people type out of habit.
  if (!input.includes("/") && !input.includes(".com")) {
    const handle = input.replace(/^@/, "");
    return HANDLE.test(handle) ? `https://www.facebook.com/${handle}` : null;
  }

  // A relative segment is never part of a page name, and URL would silently
  // resolve it — "facebook.com/../etc" becomes facebook.com/etc, which is a
  // real page but not the one they typed. Better to say so than to store a
  // different venue's link.
  if (/(^|\/)\.\.(\/|$)/.test(input)) return null;

  // Anything URL-shaped. Adding the scheme lets URL do the parsing rather than
  // a regex trying to guess where the host ends.
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  // profile.php?id=… — the numeric id is the page.
  if (url.pathname.replace(/^\//, "").toLowerCase() === "profile.php") {
    const id = url.searchParams.get("id");
    return id && /^\d+$/.test(id)
      ? `https://www.facebook.com/profile.php?id=${id}`
      : null;
  }

  // Everything else: the first path segment is the page name. Query strings are
  // dropped — they are tracking parameters, never part of the identity.
  const handle = url.pathname.split("/").filter(Boolean)[0];
  if (!handle) return null;
  const decoded = decodeURIComponent(handle).replace(/^@/, "");
  return HANDLE.test(decoded) ? `https://www.facebook.com/${decoded}` : null;
}

// "https://www.facebook.com/picklecourt" -> "facebook.com/picklecourt"
// For display, where the scheme and the www are noise.
export function facebookPageLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "");
}
