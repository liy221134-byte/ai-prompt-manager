import { redirect } from "next/navigation";

import { ExternalSourcesLedgerView } from "@/components/external-sources-ledger-view";
import { isSupabaseDataMode } from "@/lib/server/runtime-config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 采集台账（只读）：数据来自构建期生成的 JSON 快照（src/data/external-sources-ledger.json），
// 本地和云端读的是同一份，所以两种模式都渲染。云端模式仍复用账号体系——
// 未登录先跳登录页，和其他页面保持一致。
export default async function ExternalSourcesPage() {
  if (isSupabaseDataMode()) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (error || typeof claims?.sub !== "string") {
      redirect("/login");
    }
  }

  return <ExternalSourcesLedgerView />;
}
