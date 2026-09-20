import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isProtectedApiPath,
  isPublicAuthPath,
} from "./lib/auth-routing";
import {
  getRuntimeConfigurationError,
  isSupabaseDataMode,
} from "./lib/server/runtime-config";
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

function createConfigurationErrorResponse(
  request: NextRequest,
  message: string,
) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: message }, { status: 503 });
  }

  return new NextResponse(
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>服务配置异常</title>
  </head>
  <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#eef6ff;color:#0f172a;font-family:system-ui,sans-serif">
    <main style="max-width:560px;padding:32px;text-align:center">
      <h1 style="margin:0;font-size:24px">服务配置异常</h1>
      <p style="margin:16px 0 0;line-height:1.8;color:#475569">${message}</p>
      <p style="margin:12px 0 0;line-height:1.8;color:#64748b">请检查 Vercel 环境变量后重新部署。</p>
    </main>
  </body>
</html>`,
    {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function proxy(request: NextRequest) {
  const configurationError = getRuntimeConfigurationError();

  if (configurationError) {
    return createConfigurationErrorResponse(request, configurationError);
  }

  if (!isSupabaseDataMode()) {
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
