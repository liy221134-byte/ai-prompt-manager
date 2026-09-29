import { redirect } from "next/navigation";

import { ExternalSourcesLedgerView } from "@/components/external-sources-ledger-view";
import { isSupabaseDataMode } from "@/lib/server/runtime-config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 采集台账（线索 3 M2）：数据来自资产库里的「采集记录」文档。
// 本地模式走 /api/assets，云端模式走 Supabase，两边的读写都在客户端组件里按
// dataMode 分流（与资产库首页同一套 PromptDataSource），所以这里只负责判登录、传模式。
export default async function ExternalSourcesPage() {
  if (isSupabaseDataMode()) {
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;

    if (error || typeof claims?.sub !== "string") {
      redirect("/login");
    }

    return <ExternalSourcesLedgerView dataMode="supabase" />;
  }

  return <ExternalSourcesLedgerView dataMode="local" />;
}
