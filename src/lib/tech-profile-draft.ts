// 从 package.json 推断技术栈草稿：纯映射，不联网、不读文件系统。
// 结果是草稿，必须由用户在技术档案里确认后才保存。

type PackageJson = {
  engines?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

// 认识的依赖 → 技术栈名称。没列到的依赖不猜，避免把草稿写成垃圾。
const knownDependencies: Array<{ test: RegExp; name: string }> = [
  { test: /^next$/, name: "Next.js" },
  { test: /^react$/, name: "React" },
  { test: /^vue$/, name: "Vue" },
  { test: /^typescript$/, name: "TypeScript" },
  { test: /^tailwindcss$/, name: "Tailwind CSS" },
  { test: /^@supabase\/supabase-js$/, name: "Supabase" },
  { test: /^@supabase\/ssr$/, name: "Supabase SSR" },
  { test: /^@electric-sql\/pglite$/, name: "PGlite" },
  { test: /^prisma$/, name: "Prisma" },
  { test: /^express$/, name: "Express" },
];

// "^16.3.5"、"~1.2.0"、">=20" 这些都还原成能读的版本号
function normalizeVersion(value: string) {
  return value.replace(/^[\^~>=<\s]+/, "").trim();
}

export function draftStackFromPackageJson(content: string) {
  let parsed: PackageJson;

  try {
    parsed = JSON.parse(content) as PackageJson;
  } catch {
    throw new Error("这个文件不是有效的 package.json。");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("这个文件不是有效的 package.json。");
  }

  const dependencies: Record<string, string> = {
    ...(parsed.dependencies ?? {}),
    ...(parsed.devDependencies ?? {}),
  };
  const stack: Array<{ name: string; version: string }> = [];
  const nodeVersion = parsed.engines?.node;

  if (typeof nodeVersion === "string" && nodeVersion.trim()) {
    stack.push({ name: "Node.js", version: normalizeVersion(nodeVersion) });
  }

  for (const known of knownDependencies) {
    const dependencyName = Object.keys(dependencies).find((name) =>
      known.test.test(name),
    );

    if (!dependencyName) {
      continue;
    }

    const version = dependencies[dependencyName];

    stack.push({
      name: known.name,
      version: typeof version === "string" ? normalizeVersion(version) : "",
    });
  }

  return stack;
}
