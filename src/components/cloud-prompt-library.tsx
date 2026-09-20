"use client";

import { useRouter } from "next/navigation";

import { PromptLibrary } from "@/components/prompt-library";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type CloudPromptLibraryProps = {
  userEmail: string | null;
};

export function CloudPromptLibrary({
  userEmail,
}: CloudPromptLibraryProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();

    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <PromptLibrary
      dataMode="supabase"
      onSignOut={handleSignOut}
      userEmail={userEmail}
    />
  );
}
