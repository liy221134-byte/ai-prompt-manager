import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

function getSafeNextPath(requestUrl: URL) {
  const requestedNext = requestUrl.searchParams.get("next");

  return requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeNextPath(requestUrl);

  const supabase = await getSupabaseServerClient();

  if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  } else if (tokenHash && type) {
    await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
