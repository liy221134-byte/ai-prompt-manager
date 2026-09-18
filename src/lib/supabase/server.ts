import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicConfig } from "./config";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 服务端组件不能写 Cookie 时，由中间件刷新会话。
        }
      },
    },
  });
}
