import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isProtectedApiPath,
  isPublicAuthPath,
} from "./lib/auth-routing";
import { updateSupabaseSession } from "./lib/supabase/middleware";

const SESSION_CACHE_HEADERS = ["cache-control", "expires", "pragma"];

function copySessionResponse(
  target: NextResponse,
  source: NextResponse,
) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }

  for (const header of SESSION_CACHE_HEADERS) {
    const value = source.headers.get(header);

    if (value) {
      target.headers.set(header, value);
    }
  }

  return target;
}

function redirectWithSession(url: URL, source: NextResponse) {
  return copySessionResponse(NextResponse.redirect(url), source);
}

function createLoginUrl(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return loginUrl;
}

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase") {
    return NextResponse.next();
  }

  const { response, claims } = await updateSupabaseSession(request);
  const user = typeof claims?.sub === "string" ? claims : null;
  const pathname = request.nextUrl.pathname;

  if (isPublicAuthPath(pathname)) {
    if (pathname === "/login" && user) {
      return redirectWithSession(new URL("/", request.url), response);
    }

    return response;
  }

  if (pathname === "/api/health/db") {
    return response;
  }

  if (isProtectedApiPath(pathname)) {
    if (!user) {
      return copySessionResponse(
        NextResponse.json(
          { error: "登录状态已失效，请重新登录。" },
          { status: 401 },
        ),
        response,
      );
    }

    return response;
  }

  if (!user) {
    return redirectWithSession(createLoginUrl(request), response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
