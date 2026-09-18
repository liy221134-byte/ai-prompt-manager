import { PasswordAuthGate } from "@/components/password-auth-gate";
import { PromptLibrary } from "@/components/prompt-library";

export default function Home() {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "supabase") {
    return <PasswordAuthGate />;
  }

  return <PromptLibrary dataMode="local" />;
}
