import { redirect } from "next/navigation";

import { PasswordAuthGate } from "@/components/password-auth-gate";
import { getSafeNextPath } from "@/lib/auth-routing";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "supabase") {
    redirect("/");
  }

  const params = await searchParams;
  const requestedNext = Array.isArray(params.next)
    ? params.next[0]
    : params.next;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!error && typeof claims?.sub === "string") {
    redirect("/");
  }

  return <PasswordAuthGate redirectTo={getSafeNextPath(requestedNext)} />;
}
