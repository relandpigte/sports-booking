import "server-only";

// Absolute URLs for anywhere a third party has to send the browser back to us:
// a payment redirect leaves the site, and a partner pastes their webhook URL
// into their gateway's dashboard.
//
// Subscription checkout keeps using relative paths — it never leaves the app —
// so nothing there changes.
export function appOrigin(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error("APP_URL must be an absolute URL");
    }
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    ) {
      throw new Error(
        "APP_URL must be a canonical HTTPS origin without credentials, query, or fragment"
      );
    }
    return url.origin;
  }

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be set in production");
  }
  return "http://localhost:3000";
}

// Only accepts an in-app path. Rejecting anything else is what stops a caller
// from turning a return URL into an open redirect.
export function appUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`appUrl expects a leading-slash path, got: ${path}`);
  }
  return `${appOrigin()}${path}`;
}
