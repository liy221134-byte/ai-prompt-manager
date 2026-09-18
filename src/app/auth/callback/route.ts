import { NextResponse } from "next/server";

import { getSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextCandidate = requestUrl.searchParams.get("next"); const next = nextCandidate?.startsWith("/") && !nextCandidate.startsWith("//") ? nextCandidate : "/";

  if (code) {
    const supabase = await getSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
