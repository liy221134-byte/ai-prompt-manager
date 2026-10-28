import { redirect } from "next/navigation";

import { LearningGoals } from "@/components/learning-goals";
import { isSupabaseDataMode } from "@/lib/server/runtime-config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 学习目标列表：与练习题库同一套账号体系——云端模式用 getClaims 判登录，未登录跳 /login。
// M2 起这一页不再是某个主题的矩阵，而是「我有哪些目标、现在推哪个」。
export default async function LearningPage() {
  if (!isSupabaseDataMode()) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-950">学习目标</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          学习目标需要云端账号（Supabase）才能使用。请在部署的线上版本中访问。
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

  return <LearningGoals />;
}
