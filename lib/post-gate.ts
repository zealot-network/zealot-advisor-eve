export type PostRejection = "content-type" | "origin";

function mediaType(header: string | null): string {
  return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function hasJsonContentType(request: Request): boolean {
  return mediaType(request.headers.get("content-type")) === "application/json";
}

function parsedOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function ownOrigin(request: Request): string | undefined {
  try {
    const url = new URL(request.url);
    if (url.host) return url.origin;
  } catch {
    // A relative URL has no host. Fall through to the forwarded host.
  }
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const host = forwardedHost?.split(",")[0]?.trim();
  if (!host) return undefined;
  const proto = (request.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  return parsedOrigin(`${proto}://${host}`);
}

function originsMatch(left: string, right: string): boolean {
  const a = parsedOrigin(left);
  const b = parsedOrigin(right);
  return a !== undefined && a === b;
}

// No Origin header is a server-to-server call and stays allowed.
// A browser Origin must be this request's own origin, or an exact extra origin.
export function inspectJsonPost(
  request: Request,
  extraOrigins: readonly string[] = [],
): PostRejection | undefined {
  if (!hasJsonContentType(request)) return "content-type";
  const origin = request.headers.get("origin");
  if (origin === null || origin.trim() === "") return undefined;
  const own = ownOrigin(request);
  if (own && originsMatch(origin, own)) return undefined;
  if (extraOrigins.some((allowed) => originsMatch(origin, allowed))) return undefined;
  return "origin";
}
