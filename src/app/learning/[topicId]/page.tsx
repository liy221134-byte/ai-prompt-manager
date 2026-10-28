import { redirect } from "next/navigation";

import { LearningTopic } from "@/components/learning-topic";
import { isSupabaseDataMode } from "@/lib/server/runtime-config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 单个学习目标：倒计时 + 「内容模块 × 能力层级」矩阵。
// 主题 id 走路由参数——M2 起多目标并存，不再「取第一条」。
export default async function LearningTopicPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  if (!isSupabaseDataMode()) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-950">学习计划</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          学习计划需要云端账号（Supabase）才能使用。请在部署的线上版本中访问。
        </p>
      </main>
    );
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || typeof claims?.sub !== "string") {
    redirect("/login");
  }

  const { topicId } = await params;

  return <LearningTopic topicId={topicId} />;
}
