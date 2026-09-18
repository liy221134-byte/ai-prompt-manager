import { CloudAuthGate } from "@/components/cloud-auth-gate";
import { PromptLibrary } from "@/components/prompt-library";

export default function Home() {
  if (process.env.NEXT_PUBLIC_DATA_MODE === "supabase") {
    return <CloudAuthGate />;
  }

  return <PromptLibrary dataMode="local" />;
}
