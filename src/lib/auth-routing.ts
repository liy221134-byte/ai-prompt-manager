const SAFE_REDIRECT_ORIGIN = "https://auth-routing.local";

export function getSafeNextPath(
  value: string | null | undefined,
  fallback = "/",
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const candidate = value.trim();

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const url = new URL(candidate, SAFE_REDIRECT_ORIGIN);

    if (url.origin !== SAFE_REDIRECT_ORIGIN) {
      return fallback;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function isPublicAuthPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/auth" ||
    pathname.startsWith("/auth/")
  );
}

export function isProtectedApiPath(pathname: string) {
  return pathname.startsWith("/api/") && pathname !== "/api/health/db";
}
