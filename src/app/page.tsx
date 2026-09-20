import { redirect } from "next/navigation";

import { CloudPromptLibrary } from "@/components/cloud-prompt-library";
import { PromptLibrary } from "@/components/prompt-library";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "supabase") {
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
