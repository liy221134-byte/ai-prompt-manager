import type { NextRequest } from "next/server";

import { updateSupabaseSession } from "./lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase") {
    return undefined;
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
