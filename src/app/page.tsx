import { redirect } from "next/navigation";

import { CloudPromptLibrary } from "@/components/cloud-prompt-library";
import { PromptLibrary } from "@/components/prompt-library";
import { isSupabaseDataMode } from "@/lib/server/runtime-config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (isSupabaseDataMode()) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (error || typeof claims?.sub !== "string") {
      redirect("/login");
    }

    return (
      <CloudPromptLibrary
        userEmail={
          typeof claims.email === "string" ? claims.email : null
        }
      />
    );
  }

  return <PromptLibrary dataMode="local" />;
}
