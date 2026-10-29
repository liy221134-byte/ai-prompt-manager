/**
 * 让测试看到的环境在本机与 CI 上一致（2026-10-29 加）。
 *
 * 为什么需要：本机跑 `node --test` 不会加载 `.env.local`，进程里本来就没有业务变量；
 * 而 Vercel 构建时会把项目环境变量直接注入进程。于是任何「断言没配置时怎样」的用例，
 * 本机过、线上挂——2026-10-29 就是这么挂的（dpl_Cbd66BZ…，构建在 43 秒报 exit 1）。
 *
 * 口径：测试要么自己 setEnv 给出它要的值，要么看到「什么都没有」。
 * 不允许出现「取决于跑在哪台机器上」。要哪个变量，用例自己设。
 *
 * 用命名空间前缀而不是逐个列名字，是为了新加变量时自动被覆盖，不用回来改这份清单。
 * 不动的：`VERCEL_*` 基础设施变量（`VERCEL_URL` 等）有些代码会读，只清凭据类那一项。
 */
const AMBIENT_PREFIXES = /^(?:AI_|CRON_|SUPABASE_|NEXT_PUBLIC_)/;
const EXTRA_KEYS = ["VERCEL_TOKEN"];

for (const key of Object.keys(process.env)) {
  if (AMBIENT_PREFIXES.test(key)) delete process.env[key];
}
for (const key of EXTRA_KEYS) delete process.env[key];
