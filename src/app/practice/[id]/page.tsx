import { redirect } from "next/navigation";

import { PracticeQuestion } from "@/components/practice-question";
import { isSupabaseDataMode } from "@/lib/server/runtime-config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PracticeQuestionPageProps = {
  params: Promise<{ id: string }>;
};

// 单题页：同样复用现有账号体系鉴权，未登录跳 /login。
export default async function PracticeQuestionPage({
  params,
}: PracticeQuestionPageProps) {
  const { id } = await params;

  if (!isSupabaseDataMode()) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-950">练习题库</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          练习功能需要云端账号（Supabase）才能使用。请在部署的线上版本中访问。
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

  return <PracticeQuestion id={id} />;
}
