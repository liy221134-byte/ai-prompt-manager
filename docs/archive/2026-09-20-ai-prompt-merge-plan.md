> **已归档（2026-09-20）**：本计划对应的实现已完成并进入评审修复阶段，保留仅供回溯。
> 新的开发流程不再单独产出实施计划，改为《设计 + 任务清单》一份文档，规则见项目根目录
> `AGENTS.md` 的「设计门」。本文件中 "REQUIRED SUB-SKILL" 指向的旧技能链路同样不再使用。

# AI Prompt Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `v0.8.0` 中实现 2 至 5 条提示词的 AI 合并、目标覆盖、来源软删除、30 天垃圾箱和合并前恢复。

**Architecture:** 活跃提示词继续保存在现有 `prompts` 数据结构中，通过生命周期字段实现软删除；合并前目标内容保存到 `prompt_versions` 恢复快照。本地使用 SQLite 事务，云端使用 Supabase RPC 函数，两者向 UI 暴露相同的数据源接口。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS、Node.js SQLite、Supabase PostgreSQL/Auth、DeepSeek OpenAI-compatible API、Node.js test runner。

**Spec:** `docs/superpowers/specs/2026-09-20-ai-prompt-merge-design.md`

## Global Constraints

- 目标版本固定为 `v0.8.0`。
- 用户只能选择 2 至 5 条提示词。
- 第一条选中项默认是目标，用户可以调整。
- AI 合并不允许静默写入，必须先预览并由用户确认。
- 目标提示词原内容必须保存为恢复快照。
- 来源提示词必须进入垃圾箱，不得立即物理删除。
- 垃圾箱和恢复快照默认保留 30 天。
- 云端每天清理过期数据；本地在应用启动时清理。
- 本地和云端必须保持相同业务行为。
- 所有新表必须启用 RLS，所有函数使用 `SECURITY INVOKER`。
- 不向浏览器暴露 Service Role Key。
- 每条正文最多 20000 个字符，全部正文合计最多 40000 个字符。
- 用户可见文案全部使用中文。
- 未经确认不删除现有用户数据。
- 每个任务结束后运行对应测试并创建独立提交。

---

### Task 1: 生命周期类型与纯函数

**Files:**
- Modify: `src/data/prompts.ts`
- Modify: `src/components/prompt-library.tsx`
- Create: `src/lib/prompt-lifecycle.ts`
- Test: `tests/prompt-lifecycle.test.mjs`

**Interfaces:**
- Consumes: 无。
- Produces: `PromptDeletedReason`、`PromptLifecycleFields`、`PromptCardData` 生命周期字段；`getTrashExpiresAt(deletedAt: string): string`；`getRemainingTrashDays(deletedAt: string, now?: Date): number`；`isTrashExpired(deletedAt: string, now?: Date): boolean`。

- [ ] **Step 1: 写失败测试**

Create `tests/prompt-lifecycle.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  getRemainingTrashDays,
  getTrashExpiresAt,
  isTrashExpired,
} from "../src/lib/prompt-lifecycle.ts";

test("垃圾箱过期时间固定为删除时间后 30 天", () => {
  assert.equal(
    getTrashExpiresAt("2026-09-01T00:00:00.000Z"),
    "2026-10-01T00:00:00.000Z",
  );
});

test("剩余保留天数向上取整", () => {
  assert.equal(
    getRemainingTrashDays(
      "2026-09-01T00:00:00.000Z",
      new Date("2026-09-30T12:00:00.000Z"),
    ),
    1,
  );
});

test("达到过期时间后判定为过期", () => {
  assert.equal(
    isTrashExpired(
      "2026-09-01T00:00:00.000Z",
      new Date("2026-10-01T00:00:00.000Z"),
    ),
    true,
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-lifecycle.test.mjs
```

Expected: FAIL，提示模块 `prompt-lifecycle.ts` 不存在。

- [ ] **Step 3: 增加生命周期类型**

In `src/data/prompts.ts`, add:

```typescript
export type PromptDeletedReason = "manual" | "merge";

export type PromptLifecycleFields = {
  deletedAt: string | null;
  deletedReason: PromptDeletedReason | null;
  mergedIntoPromptId: string | null;
  mergeVersionId: string | null;
};

export type PromptContentData = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  useCase: string;
  createdAt: string;
  updatedAt: string;
};

export type PromptCardData = PromptContentData & PromptLifecycleFields;

export type PromptDraft = Omit<
  PromptContentData,
  | "id"
  | "createdAt"
  | "updatedAt"
>;

export type PromptVersionData = {
  versionId: string;
  promptId: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  useCase: string;
  createdAt: string;
  versionReason: "merge_before";
  sourcePromptIds: string[];
  restoredAt: string | null;
  expiresAt: string;
};
```

为 3 条示例数据增加：

```typescript
deletedAt: null,
deletedReason: null,
mergedIntoPromptId: null,
mergeVersionId: null,
```

In `PromptLibrary.handleSave()`, when creating a new prompt, add:

```typescript
deletedAt: null,
deletedReason: null,
mergedIntoPromptId: null,
mergeVersionId: null,
```

- [ ] **Step 4: 实现纯函数**

Create `src/lib/prompt-lifecycle.ts`:

```typescript
export const PROMPT_TRASH_RETENTION_DAYS = 30;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function parseDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("日期格式无效。");
  }

  return date;
}

export function getTrashExpiresAt(deletedAt: string) {
  const expiresAt = new Date(
    parseDate(deletedAt).getTime() +
      PROMPT_TRASH_RETENTION_DAYS * DAY_IN_MILLISECONDS,
  );

  return expiresAt.toISOString();
}

export function getRemainingTrashDays(deletedAt: string, now = new Date()) {
  const remainingMilliseconds =
    parseDate(getTrashExpiresAt(deletedAt)).getTime() - now.getTime();

  return Math.max(0, Math.ceil(remainingMilliseconds / DAY_IN_MILLISECONDS));
}

export function isTrashExpired(deletedAt: string, now = new Date()) {
  return parseDate(getTrashExpiresAt(deletedAt)).getTime() <= now.getTime();
}
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-lifecycle.test.mjs
```

Expected: PASS，3 项测试通过。

- [ ] **Step 6: 运行类型检查**

Run:

```powershell
npm run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交**

```powershell
git add src/data/prompts.ts src/lib/prompt-lifecycle.ts tests/prompt-lifecycle.test.mjs
git commit -m "feat: add prompt lifecycle types"
```

### Task 2: 本地数据库软删除与恢复快照

**Files:**
- Modify: `src/lib/server/prompt-database.ts`
- Modify: `tests/prompt-database.test.mjs`
- Create: `tests/prompt-database-trash.test.mjs`

**Interfaces:**
- Consumes: Task 1 的生命周期类型和纯函数。
- Produces: `PromptVersionData`；`PromptDatabase.listPrompts()` 只返回活跃数据；`listTrash()`；`restorePrompt(id)`；`permanentlyDeletePrompt(id)`；`emptyTrash()`；`commitPromptMerge(input)`；`listMergeRecoveryRecords()`；`restoreMergeRecord(versionId)`；`purgeExpiredTrash(now?)`。

- [ ] **Step 1: 写失败测试**

Create `tests/prompt-database-trash.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

function createContext() {
  const directory = mkdtempSync(join(tmpdir(), "prompt-trash-"));
  return {
    database: new PromptDatabase(join(directory, "prompts.sqlite")),
    cleanup() {
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

function prompt(overrides = {}) {
  return {
    id: "prompt-a",
    title: "提示词 A",
    category: "AI效能",
    tags: ["测试"],
    content: "请处理 {{内容}}",
    useCase: "测试垃圾箱。",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    deletedAt: null,
    deletedReason: null,
    mergedIntoPromptId: null,
    ...overrides,
  };
}

test("删除提示词后进入垃圾箱并可恢复", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    assert.equal(context.database.deletePrompt("prompt-a"), true);
    assert.equal(context.database.listPrompts().length, 3);
    assert.equal(context.database.listTrash().length, 1);
    assert.equal(context.database.restorePrompt("prompt-a"), true);
    assert.equal(context.database.listTrash().length, 0);
    assert.equal(context.database.listPrompts().length, 4);
  } finally {
    context.database.close();
    context.cleanup();
  }
});

test("AI 合并会更新目标、归档来源并保存恢复快照", () => {
  const context = createContext();

  try {
    context.database.createPrompt(prompt());
    context.database.createPrompt(prompt({ id: "prompt-b", title: "提示词 B" }));
    const version = {
      versionId: "version-1",
      promptId: "prompt-a",
      title: "提示词 A",
      category: "AI效能",
      tags: ["测试"],
      content: "请处理 {{内容}}",
      useCase: "测试垃圾箱。",
      createdAt: "2026-09-20T01:00:00.000Z",
      versionReason: "merge_before",
      sourcePromptIds: ["prompt-a", "prompt-b"],
      restoredAt: null,
      expiresAt: "2026-10-20T01:00:00.000Z",
    };

    context.database.commitPromptMerge({
      prompt: prompt({
        title: "合并后的提示词",
        updatedAt: "2026-09-20T01:00:00.000Z",
      }),
      sourcePromptIds: ["prompt-b"],
      version,
    });

    assert.equal(context.database.listPrompts().length, 3);
    assert.equal(context.database.listTrash().length, 1);
    assert.equal(context.database.listMergeRecoveryRecords().length, 1);
  } finally {
    context.database.close();
    context.cleanup();
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-database-trash.test.mjs
```

Expected: FAIL，提示 `listTrash` 或 `commitPromptMerge` 不存在。

- [ ] **Step 3: 扩展 SQLite 初始化迁移**

In `PromptDatabase.initialize()`, keep `CREATE TABLE IF NOT EXISTS prompts` and add a
`this.ensurePromptLifecycleColumns()` call.

Add methods:

```typescript
private hasColumn(tableName: string, columnName: string) {
  const rows = this.database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return rows.some((row) => row.name === columnName);
}

private ensurePromptLifecycleColumns() {
  if (!this.hasColumn("prompts", "deleted_at")) {
    this.database.exec("ALTER TABLE prompts ADD COLUMN deleted_at TEXT");
  }

  if (!this.hasColumn("prompts", "deleted_reason")) {
    this.database.exec("ALTER TABLE prompts ADD COLUMN deleted_reason TEXT");
  }

  if (!this.hasColumn("prompts", "merged_into_prompt_id")) {
    this.database.exec(
      "ALTER TABLE prompts ADD COLUMN merged_into_prompt_id TEXT",
    );
  }
}
```

Add `prompt_versions` and indexes:

```sql
CREATE TABLE IF NOT EXISTS prompt_versions (
  version_id TEXT PRIMARY KEY,
  prompt_id TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  content TEXT NOT NULL,
  use_case TEXT NOT NULL,
  created_at TEXT NOT NULL,
  version_reason TEXT NOT NULL,
  source_prompt_ids_json TEXT NOT NULL,
  restored_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS prompt_versions_prompt_idx
ON prompt_versions (prompt_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_versions_expires_idx
ON prompt_versions (expires_at);

CREATE INDEX IF NOT EXISTS prompts_deleted_idx
ON prompts (deleted_at);
```

- [ ] **Step 4: 更新行映射和查询**

Extend `PromptRow`:

```typescript
deleted_at: string | null;
deleted_reason: "manual" | "merge" | null;
merged_into_prompt_id: string | null;
```

Update `rowToPrompt()` to map the fields.

Update `listPrompts()`:

```sql
WHERE deleted_at IS NULL
```

Add `listTrash()` with:

```sql
WHERE deleted_at IS NOT NULL
ORDER BY deleted_at DESC, id ASC
```

- [ ] **Step 5: 实现软删除和恢复**

Replace `deletePrompt()` physical delete with:

```typescript
deletePrompt(promptId: string) {
  const deletedAt = new Date().toISOString();
  const result = this.transaction(() => {
    const updateResult = this.database
      .prepare(
        `
          UPDATE prompts
          SET deleted_at = ?, deleted_reason = ?, merged_into_prompt_id = NULL
          WHERE id = ? AND deleted_at IS NULL
        `,
      )
      .run(deletedAt, "manual", promptId);

    if (updateResult.changes > 0) {
      this.bumpVersion();
    }

    return updateResult;
  });

  return result.changes > 0;
}
```

Add:

```typescript
restorePrompt(promptId: string) {
  const result = this.transaction(() => {
    const updateResult = this.database
      .prepare(
        `
          UPDATE prompts
          SET deleted_at = NULL, deleted_reason = NULL, merged_into_prompt_id = NULL
          WHERE id = ? AND deleted_at IS NOT NULL
        `,
      )
      .run(promptId);

    if (updateResult.changes > 0) {
      this.bumpVersion();
    }

    return updateResult;
  });

  return result.changes > 0;
}
```

- [ ] **Step 6: 实现永久删除、清空和过期清理**

Add:

```typescript
permanentlyDeletePrompt(promptId: string) {
  const result = this.transaction(() => {
    const deleteResult = this.database
      .prepare("DELETE FROM prompts WHERE id = ? AND deleted_at IS NOT NULL")
      .run(promptId);

    if (deleteResult.changes > 0) {
      this.bumpVersion();
    }

    return deleteResult;
  });

  return result.changes > 0;
}

emptyTrash() {
  return this.transaction(() => {
    const deleteResult = this.database
      .prepare("DELETE FROM prompts WHERE deleted_at IS NOT NULL")
      .run();
    const versionResult = this.database
      .prepare("DELETE FROM prompt_versions")
      .run();

    if (deleteResult.changes + versionResult.changes > 0) {
      this.bumpVersion();
    }

    return deleteResult.changes;
  });
}
```

Add a purge function that deletes expired tombstones and snapshots.

Replace the current `mergePrompts()` implementation so it never executes
`DELETE FROM prompts` and never resurrects a trashed prompt:

```typescript
mergePrompts(importedPrompts: PromptCardData[]): PromptMergeResult {
  const trashedPromptIds = new Set(
    this.listTrash().map((prompt) => prompt.id),
  );
  const importablePrompts = importedPrompts.filter(
    (prompt) => !trashedPromptIds.has(prompt.id),
  );
  const plan = createPromptImportPlan(this.listPrompts(), {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    prompts: importablePrompts,
  });

  if (plan.addCount + plan.updateCount > 0) {
    this.transaction(() => {
      for (const prompt of plan.mergedPrompts) {
        const existing = this.database
          .prepare("SELECT id FROM prompts WHERE id = ?")
          .get(prompt.id);

        if (existing) {
          this.updatePromptRow(prompt);
        } else {
          this.insertPrompt(prompt);
        }
      }

      this.bumpVersion();
    });
  }

  return {
    ...this.getLibrarySnapshot(),
    addCount: plan.addCount,
    updateCount: plan.updateCount,
    skipCount: plan.skipCount + importedPrompts.length - importablePrompts.length,
  };
}
```

- [ ] **Step 7: 实现原子合并提交**

Add a `commitPromptMerge()` method using one `this.transaction()`:

```typescript
commitPromptMerge(input: {
  prompt: PromptCardData;
  sourcePromptIds: string[];
  versionId: string;
}) {
  return this.transaction(() => {
    const target = /* 在事务中读取当前活跃目标行 */;
    const version = {
      versionId: input.versionId,
      ...target,
      sourcePromptIds: [...input.sourcePromptIds],
    };
    this.insertPromptVersion(version);
    this.updatePromptRow(input.prompt);

    for (const promptId of input.sourcePromptIds) {
      this.database
        .prepare(
          `
            UPDATE prompts
            SET deleted_at = ?, deleted_reason = ?, merged_into_prompt_id = ?
            WHERE id = ? AND deleted_at IS NULL
          `,
        )
        .run(
          input.prompt.updatedAt,
          "merge",
          input.prompt.id,
          promptId,
        );
    }

    this.bumpVersion();
    return this.getLibrarySnapshot();
  });
}
```

Add `listMergeRecoveryRecords()` and `restoreMergeRecord()`.

- [ ] **Step 8: 更新旧测试**

`tests/prompt-database.test.mjs` 中的删除断言改为：

- 活跃列表不再包含提示词。
- 垃圾箱包含提示词。
- 第二次删除活跃提示词返回 `false`。

- [ ] **Step 9: 运行数据库测试**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-database.test.mjs tests/prompt-database-trash.test.mjs
```

Expected: PASS。

- [ ] **Step 10: 提交**

```powershell
git add src/lib/server/prompt-database.ts tests/prompt-database.test.mjs tests/prompt-database-trash.test.mjs
git commit -m "feat: add local prompt trash and recovery"
```

### Task 3: Supabase 迁移与 RPC

**Files:**
- Create: `supabase/migrations/<timestamp>_add_prompt_merge_trash.sql`
- Modify: `docs/database-schema.md`
- Test: manual SQL verification checklist in the migration task

**Interfaces:**
- Consumes: Task 1 的数据字段。
- Produces: `prompt_versions` 表；`commit_prompt_merge(...)`；`restore_prompt_merge(...)`；`empty_prompt_trash()`；`purge_expired_prompt_versions(...)`。

- [ ] **Step 1: 创建迁移文件**

Run:

```powershell
supabase migration new add_prompt_merge_trash
```

Use the generated file. If CLI is unavailable, create a file with the same
descriptive name under `supabase/migrations/`.

- [ ] **Step 2: 写扩展字段和表**

Add:

```sql
alter table public.prompts
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_reason text,
  add column if not exists merged_into_prompt_id text,
  add column if not exists merge_version_id text;

create table if not exists public.prompt_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id text not null,
  prompt_id text not null,
  title text not null,
  category text not null,
  tags text[] not null default '{}',
  content text not null,
  use_case text not null,
  created_at timestamptz not null,
  version_reason text not null,
  source_prompt_ids text[] not null default '{}',
  restored_at timestamptz,
  expires_at timestamptz not null,
  primary key (user_id, version_id)
);
```

- [ ] **Step 3: 写索引和 RLS**

Add indexes:

```sql
create index if not exists prompts_user_deleted_idx
on public.prompts (user_id, deleted_at);

create index if not exists prompt_versions_user_prompt_idx
on public.prompt_versions (user_id, prompt_id, created_at desc);

create index if not exists prompt_versions_user_expires_idx
on public.prompt_versions (user_id, expires_at);
```

Enable RLS and create SELECT/INSERT/UPDATE/DELETE policies using
`auth.uid() = user_id`.

- [ ] **Step 4: 写原子提交函数**

Create:

```sql
create or replace function public.commit_prompt_merge(
  p_prompt_id text,
  p_title text,
  p_category text,
  p_tags text[],
  p_content text,
  p_use_case text,
  p_updated_at timestamptz,
  p_source_prompt_ids text[],
  p_version_id text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_target public.prompts%rowtype;
  v_source_count integer;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  if p_source_prompt_ids is null then
    raise exception '合并来源数量无效。';
  end if;

  if cardinality(p_source_prompt_ids) < 2
    or cardinality(p_source_prompt_ids) > 5
    or not p_prompt_id = any(p_source_prompt_ids)
  then
    raise exception '合并来源数量无效。';
  end if;

  select *
  into v_target
  from public.prompts
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null
  for update;

  if not found then
    raise exception '目标提示词不存在。';
  end if;

  select count(*)
  into v_source_count
  from public.prompts
  where user_id = v_user_id
    and id = any(p_source_prompt_ids)
    and deleted_at is null;

  if v_source_count <> cardinality(p_source_prompt_ids) then
    raise exception '部分来源提示词不存在。';
  end if;

  insert into public.prompt_versions (
    user_id,
    version_id,
    prompt_id,
    title,
    category,
    tags,
    content,
    use_case,
    created_at,
    version_reason,
    source_prompt_ids,
    restored_at,
    expires_at
  ) values (
    v_user_id,
    p_version_id,
    v_target.id,
    v_target.title,
    v_target.category,
    v_target.tags,
    v_target.content,
    v_target.use_case,
    p_updated_at,
    'merge_before',
    p_source_prompt_ids,
    null,
    p_updated_at + interval '30 days'
  );

  update public.prompts
  set
    title = p_title,
    category = p_category,
    tags = p_tags,
    content = p_content,
    use_case = p_use_case,
    updated_at = p_updated_at
  where user_id = v_user_id
    and id = p_prompt_id
    and deleted_at is null;

  update public.prompts
  set
    deleted_at = p_updated_at,
    deleted_reason = 'merge',
    merged_into_prompt_id = p_prompt_id
  where user_id = v_user_id
    and id = any(p_source_prompt_ids)
    and id <> p_prompt_id
    and deleted_at is null;
end;
$$;
```

- [ ] **Step 5: 写恢复函数**

Create:

```sql
create or replace function public.restore_prompt_merge(
  p_version_id text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_version public.prompt_versions%rowtype;
begin
  if v_user_id is null then
    raise exception '未登录。';
  end if;

  select *
  into v_version
  from public.prompt_versions
  where user_id = v_user_id
    and version_id = p_version_id
  for update;

  if not found then
    raise exception '恢复记录不存在。';
  end if;

  update public.prompts
  set
    title = v_version.title,
    category = v_version.category,
    tags = v_version.tags,
    content = v_version.content,
    use_case = v_version.use_case,
    updated_at = now()
  where user_id = v_user_id
    and id = v_version.prompt_id;

  update public.prompts
  set
    deleted_at = null,
    deleted_reason = null,
    merged_into_prompt_id = null
  where user_id = v_user_id
    and id = any(v_version.source_prompt_ids)
    and id <> v_version.prompt_id;

  update public.prompt_versions
  set restored_at = now()
  where user_id = v_user_id
    and version_id = p_version_id;
end;
$$;
```

- [ ] **Step 6: 写过期清理函数**

Create a function used only by service-role cleanup:

```sql
create or replace function public.purge_expired_prompt_versions()
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.prompt_versions
  where expires_at <= now();

  delete from public.prompts
  where deleted_at is not null
    and deleted_at <= now() - interval '30 days';
$$;
```

- [ ] **Step 7: 更新数据库文档**

Update `docs/database-schema.md` with:

- lifecycle fields
- indexes
- `prompt_versions`
- RPC names
- retention rule

- [ ] **Step 8: 在 Supabase 执行并验证**

User or Supabase MCP executes the migration.

Verify:

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'prompts'
  and column_name in (
    'deleted_at',
    'deleted_reason',
    'merged_into_prompt_id'
  );

select tablename
from pg_tables
where schemaname = 'public'
  and tablename = 'prompt_versions';
```

Expected: 3 个字段和 1 张表都存在。

- [ ] **Step 9: 运行 Supabase advisors**

Run `supabase db advisors` or MCP `get_advisors`.

Expected: 没有新增安全错误。

- [ ] **Step 10: 提交**

```powershell
git add supabase/migrations docs/database-schema.md
git commit -m "feat: add supabase merge recovery schema"
```

### Task 4: 数据源与本地 API

**Files:**
- Modify: `src/lib/prompt-api.ts`
- Modify: `src/lib/prompt-source.ts`
- Create: `src/app/api/prompts/trash/route.ts`
- Create: `src/app/api/prompts/trash/[id]/route.ts`
- Create: `src/app/api/prompts/recovery/route.ts`
- Create: `src/app/api/prompts/recovery/[id]/route.ts`
- Create: `src/app/api/prompts/ai-merge/route.ts`
- Test: `tests/prompt-source-contract.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `PromptDatabase` 方法；Task 3 的 Supabase RPC。
- Produces: 扩展后的 `PromptDataSource`。

- [ ] **Step 1: 写数据源契约测试**

Create a test that checks every data source implements:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { localPromptDataSource } from "../src/lib/prompt-source.ts";

const REQUIRED_METHODS = [
  "fetchLibrary",
  "createPrompt",
  "updatePrompt",
  "deletePrompt",
  "mergePrompts",
  "fetchTrash",
  "restorePrompt",
  "permanentlyDeletePrompt",
  "emptyTrash",
  "commitAiMerge",
  "fetchMergeRecoveryRecords",
  "restoreMergeRecord",
];

test("本地数据源实现完整契约", () => {
  for (const methodName of REQUIRED_METHODS) {
    assert.equal(
      typeof localPromptDataSource[methodName],
      "function",
      `缺少数据源方法：${methodName}`,
    );
  }
});
```

Assert all methods exist on `localPromptDataSource`.

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-source-contract.test.mjs
```

Expected: FAIL，缺少新方法。

- [ ] **Step 3: 扩展接口类型**

Add to `PromptDataSource`:

```typescript
fetchTrash: () => Promise<PromptLibraryResponse>;
restorePrompt: (promptId: string) => Promise<PromptLibraryResponse>;
permanentlyDeletePrompt: (promptId: string) => Promise<PromptLibraryResponse>;
emptyTrash: () => Promise<PromptLibraryResponse>;
commitAiMerge: (input: CommitAiMergeInput) => Promise<PromptLibraryResponse>;
fetchMergeRecoveryRecords: () => Promise<PromptRecoveryResponse>;
restoreMergeRecord: (versionId: string) => Promise<PromptLibraryResponse>;
```

Define:

```typescript
export type CommitAiMergeInput = {
  prompt: PromptCardData;
  sourcePromptIds: string[];
  versionId: string;
};

export type PromptRecoveryResponse = {
  records: PromptVersionData[];
};
```

- [ ] **Step 4: 增加本地 API 客户端方法**

Add functions in `prompt-api.ts` for each endpoint and return
`PromptLibraryResponse` or `PromptRecoveryResponse`.

- [ ] **Step 5: 实现本地 API 路由**

Each route:

- calls `rejectLocalApiInCloudMode()`
- validates JSON
- calls the matching `PromptDatabase` method
- returns Chinese error messages
- does not contain `TODO`

Examples:

```typescript
export async function GET() {
  const cloudModeError = rejectLocalApiInCloudMode();
  if (cloudModeError) return cloudModeError;
  return Response.json(getPromptDatabase().getTrashSnapshot());
}
```

- [ ] **Step 6: 实现 Supabase 数据源**

Add:

- active library query with `is("deleted_at", null)`
- trash query with `not("deleted_at", "is", null)`
- restore via update
- permanent delete
- empty trash via `empty_prompt_trash()` RPC
- `commit_prompt_merge` RPC
- recovery list
- restore RPC

Update `mergePrompts()` so it passes trashed prompt IDs into the shared
`createPromptImportPlan()` before upserting. The backup preview uses the same
function, so trashed IDs are consistently shown and handled as skipped. This
prevents a backup import from resurrecting a prompt that is still in the
30-day trash period.

- [ ] **Step 7: 运行数据源测试和类型检查**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-source-contract.test.mjs
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交**

```powershell
git add src/lib/prompt-api.ts src/lib/prompt-source.ts src/app/api/prompts tests/prompt-source-contract.test.mjs
git commit -m "feat: add prompt trash data sources"
```

### Task 5: AI 合并提示词和规范化

**Files:**
- Modify: `src/lib/prompt-ai.ts`
- Modify: `tests/prompt-ai.test.mjs`
- Create: `src/app/api/ai/merge-prompts/route.ts`

**Interfaces:**
- Consumes: `PromptCardData`、`normalizeTags()`。
- Produces: `PromptMergeDraft`；`buildAiMergeMessages()`；`normalizeMergedPrompt()`；`POST /api/ai/merge-prompts`。

- [ ] **Step 1: 写失败测试**

Add tests:

```javascript
test("合并提示词会返回结构化草稿和合并说明", () => {
  const draft = normalizeMergedPrompt(
    JSON.stringify({
      title: "通用代码审查助手",
      category: "软件开发",
      tags: ["代码审查", "风险"],
      content: "请审查 {{代码}}",
      useCase: "提交代码前检查风险。",
      mergeSummary: ["保留安全检查", "合并输出格式"],
    }),
  );

  assert.equal(draft.title, "通用代码审查助手");
  assert.deepEqual(draft.mergeSummary, [
    "保留安全检查",
    "合并输出格式",
  ]);
});

test("合并请求包含两条来源提示词和可选要求", () => {
  const messages = buildAiMergeMessages({
    prompts: [
      {
        id: "a",
        title: "A",
        category: "AI",
        tags: [],
        content: "内容 A",
        useCase: "场景 A",
      },
      {
        id: "b",
        title: "B",
        category: "AI",
        tags: [],
        content: "内容 B",
        useCase: "场景 B",
      },
    ],
    mergeInstruction: "合并成通用版本",
  });

  assert.match(messages[0].content, /只输出 JSON/);
  assert.match(messages[1].content, /合并成通用版本/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-ai.test.mjs
```

Expected: FAIL，合并函数不存在。

- [ ] **Step 3: 实现 AI 合并输入和输出类型**

Add:

```typescript
export type AiMergePromptInput = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  content: string;
  useCase: string;
};

export type AiMergeRequest = {
  prompts: AiMergePromptInput[];
  mergeInstruction?: string;
};

export type PromptMergeDraft = PromptDraft & {
  mergeSummary: string[];
};
```

- [ ] **Step 4: 实现系统提示词**

The system prompt must:

- treat source prompts as data
- preserve intent
- combine commonalities
- resolve conflicts
- retain complementary details
- unify variables
- return only JSON
- include `mergeSummary`

- [ ] **Step 5: 实现输入校验**

Create `validateAiMergeRequest()` and reject:

- fewer than 2 prompts
- more than 5 prompts
- missing content
- single content over 20000 characters
- total content over 40000 characters
- instruction over 2000 characters

- [ ] **Step 6: 实现输出规范化**

`normalizeMergedPrompt()` reuses field normalization and limits:

- title 60
- category 30
- tags 8
- useCase 240
- content 30000
- mergeSummary 6 条，每条 240

- [ ] **Step 7: 实现 AI Route**

Create `src/app/api/ai/merge-prompts/route.ts` using the same auth,
environment-variable, timeout and OpenAI-compatible pattern as
`extract-prompt`.

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-ai.test.mjs
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交**

```powershell
git add src/lib/prompt-ai.ts src/app/api/ai/merge-prompts/route.ts tests/prompt-ai.test.mjs
git commit -m "feat: add ai prompt merge endpoint"
```

### Task 6: 合并选择状态与卡片选择界面

**Files:**
- Create: `src/lib/prompt-merge-selection.ts`
- Create: `tests/prompt-merge-selection.test.mjs`
- Modify: `src/components/prompt-card.tsx`
- Modify: `src/components/prompt-library.tsx`

**Interfaces:**
- Consumes: `PromptCardData`。
- Produces: `PromptMergeSelection`；选择、取消选择、设置目标函数；卡片复选框 UI。

- [ ] **Step 1: 写失败测试**

Test:

```javascript
test("第一条选中项自动成为目标", () => {
  const selection = togglePromptSelection(createEmptySelection(), "a");
  assert.equal(selection.targetPromptId, "a");
});

test("取消目标后选择下一条作为目标", () => {
  let selection = togglePromptSelection(createEmptySelection(), "a");
  selection = togglePromptSelection(selection, "b");
  selection = togglePromptSelection(selection, "a");
  assert.equal(selection.targetPromptId, "b");
});

test("最多只能选择五条", () => {
  let selection = createEmptySelection();
  for (const id of ["a", "b", "c", "d", "e", "f"]) {
    selection = togglePromptSelection(selection, id);
  }
  assert.equal(selection.selectedPromptIds.length, 5);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-merge-selection.test.mjs
```

Expected: FAIL，选择函数不存在。

- [ ] **Step 3: 实现选择纯函数**

Define:

```typescript
export const MAX_MERGE_PROMPTS = 5;
export const MIN_MERGE_PROMPTS = 2;

export type PromptMergeSelection = {
  selectedPromptIds: string[];
  targetPromptId: string | null;
};

export function createEmptySelection(): PromptMergeSelection;
export function togglePromptSelection(
  selection: PromptMergeSelection,
  promptId: string,
): PromptMergeSelection;
export function setMergeTarget(
  selection: PromptMergeSelection,
  promptId: string,
): PromptMergeSelection;
export function canStartMerge(selection: PromptMergeSelection): boolean;
```

- [ ] **Step 4: 修改卡片组件**

Add optional props:

```typescript
selectionMode?: boolean;
selected?: boolean;
isMergeTarget?: boolean;
canSelect?: boolean;
onToggleSelection?: (prompt: PromptCardData) => void;
onSetMergeTarget?: (prompt: PromptCardData) => void;
```

Selection mode shows checkbox and target badge.

- [ ] **Step 5: 修改工具栏**

Add:

- “AI 合并” button
- selected count
- target title
- “开始合并” button
- “退出选择” button

Buttons are disabled when count is outside 2 至 5。

- [ ] **Step 6: 运行聚焦测试和 lint**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-merge-selection.test.mjs
npm run lint
```

Expected: PASS。

- [ ] **Step 7: 提交**

```powershell
git add src/lib/prompt-merge-selection.ts tests/prompt-merge-selection.test.mjs src/components/prompt-card.tsx src/components/prompt-library.tsx
git commit -m "feat: add prompt merge selection"
```

### Task 7: AI 合并面板与保存

**Files:**
- Create: `src/components/ai-merge-drawer.tsx`
- Create: `src/lib/prompt-merge-draft.ts`
- Modify: `src/components/prompt-library.tsx`
- Test: `tests/prompt-merge-draft.test.mjs`

**Interfaces:**
- Consumes: Task 4 的 `commitAiMerge`；Task 5 的 AI API；Task 6 的选择状态。
- Produces: `AiMergeDrawer` 组件和完整保存流程。

- [ ] **Step 1: 写草稿操作测试**

Create a pure helper in `src/lib/prompt-merge-draft.ts`:

```typescript
createMergeVersionId(): string
```

Create `tests/prompt-merge-draft.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import { createMergeVersionId } from "../src/lib/prompt-merge-draft.ts";

test("合并提交使用客户端生成的稳定版本标识", () => {
  assert.match(createMergeVersionId(), /^version-/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-merge-draft.test.mjs
```

Expected: FAIL，草稿辅助函数不存在。

- [ ] **Step 3: 实现合并面板组件的状态**

`AiMergeDrawer` props:

```typescript
type AiMergeDrawerProps = {
  prompts: PromptCardData[];
  targetPromptId: string;
  onClose: () => void;
  onSaved: (library: PromptLibraryResponse) => void;
  onNotify: (message: string) => void;
  dataSource: PromptDataSource;
};
```

State:

- `mergeInstruction`
- `draft`
- `mergeSummary`
- `isGenerating`
- `isSaving`
- `errorMessage`

- [ ] **Step 4: 实现生成草稿**

Call:

```typescript
fetch("/api/ai/merge-prompts", {
  method: "POST",
  body: JSON.stringify({
    prompts: selectedPrompts,
    mergeInstruction,
  }),
});
```

AI failure only changes local error state.

- [ ] **Step 5: 实现可编辑结果**

Reuse the field structure and validation patterns from
`PromptEditorDrawer`. Do not create a second generic prompt editor.
Extract shared field controls only if it removes real duplication.

- [ ] **Step 6: 实现保存**

Build:

```typescript
await dataSource.commitAiMerge({
  prompt: {
    ...target,
    ...editedDraft,
    updatedAt: now,
  },
  sourcePromptIds: selectedPrompts.map((prompt) => prompt.id),
  versionId: createMergeVersionId(),
});
```

Save button label includes target title and source count.

- [ ] **Step 7: 接入 PromptLibrary**

After save:

- replace library state
- clear selection
- close drawer
- open target detail or return to list
- notify "已合并，来源可在垃圾箱恢复"

- [ ] **Step 8: 运行测试**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-merge-draft.test.mjs
npm run lint
npm run typecheck
```

Expected: PASS。

- [ ] **Step 9: 提交**

```powershell
git add src/components/ai-merge-drawer.tsx src/lib/prompt-merge-draft.ts src/components/prompt-library.tsx tests/prompt-merge-draft.test.mjs
git commit -m "feat: add ai merge workflow"
```

### Task 8: 垃圾箱与恢复记录界面

**Files:**
- Create: `src/components/prompt-trash-dialog.tsx`
- Create: `src/lib/prompt-trash-presentation.ts`
- Modify: `src/components/prompt-library.tsx`
- Modify: `src/components/delete-confirm-dialog.tsx`
- Test: `tests/prompt-trash-presentation.test.mjs`

**Interfaces:**
- Consumes: Task 4 的垃圾箱和恢复数据源。
- Produces: 垃圾箱抽屉、恢复操作、永久删除和清空。

- [ ] **Step 1: 写展示辅助测试**

Create pure helpers:

```typescript
getDeletedReasonLabel(reason: "manual" | "merge"): string
getTrashSummary(input: {
  prompts: PromptCardData[];
  records: PromptVersionData[];
}): string
```

Create `tests/prompt-trash-presentation.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";

import {
  getDeletedReasonLabel,
  getTrashSummary,
} from "../src/lib/prompt-trash-presentation.ts";

test("垃圾箱来源显示中文说明", () => {
  assert.equal(getDeletedReasonLabel("manual"), "手动删除");
  assert.equal(getDeletedReasonLabel("merge"), "AI 合并");
});

test("垃圾箱摘要显示提示词和恢复记录数量", () => {
  assert.equal(
    getTrashSummary({
      prompts: [{}, {}],
      records: [{}],
    }),
    "2 条提示词，1 条合并恢复记录",
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-trash-presentation.test.mjs
```

Expected: FAIL，垃圾箱展示函数不存在。

- [ ] **Step 3: 实现垃圾箱对话框**

Show:

- deleted prompts
- deletion reason
- remaining days
- restore
- permanent delete
- empty trash
- merge recovery records
- restore merge record

Use existing dialog and drawer visual language.

- [ ] **Step 4: 修改手动删除文案**

Change confirmation copy from “删除” to “移入垃圾箱”，并说明 30 天可恢复。

- [ ] **Step 5: 接入 PromptLibrary**

Add “垃圾箱” toolbar entry and state:

- `isTrashOpen`
- `trashPrompts`
- `recoveryRecords`
- loading and error state

Refresh active prompts and trash after every restore or permanent delete.

- [ ] **Step 6: 运行测试和构建检查**

Run:

```powershell
npm run lint
npm run typecheck
```

- [ ] **Step 7: 提交**

```powershell
git add src/components/prompt-trash-dialog.tsx src/components/prompt-library.tsx src/components/delete-confirm-dialog.tsx tests/prompt-trash-presentation.test.mjs
git commit -m "feat: add prompt trash interface"
```

### Task 9: 30 天清理与备份兼容

**Files:**
- Modify: `src/app/api/health/db/route.ts`
- Modify: `src/lib/server/prompt-database.ts`
- Modify: `src/lib/prompt-backup.ts`
- Modify: `src/lib/prompt-storage.ts`
- Modify: `tests/prompt-backup.test.mjs`
- Create: `tests/prompt-cleanup.test.mjs`

**Interfaces:**
- Consumes: Task 2 和 Task 3 的清理方法。
- Produces: 云端每日清理、本地启动清理、备份不恢复已删除提示词。

- [ ] **Step 1: 写失败测试**

Create `tests/prompt-cleanup.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PromptDatabase } from "../src/lib/server/prompt-database.ts";

test("过期垃圾箱和恢复快照会被清理", () => {
  const directory = mkdtempSync(join(tmpdir(), "prompt-cleanup-"));
  const database = new PromptDatabase(join(directory, "prompts.sqlite"));

  try {
    database.createPrompt({
      id: "prompt-expired",
      title: "过期提示词",
      category: "AI效能",
      tags: [],
      content: "内容",
      useCase: "测试清理。",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      deletedAt: null,
      deletedReason: null,
      mergedIntoPromptId: null,
    });
    database.deletePrompt("prompt-expired");
    database.purgeExpiredTrash(new Date("2026-10-01T00:00:00.000Z"));

    assert.equal(database.listTrash().length, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
```

Extend `tests/prompt-backup.test.mjs` with:

```javascript
test("备份导入不会恢复已经进入垃圾箱的提示词", () => {
  const activePrompts = [];
  const trashedPromptIds = new Set(["prompt-deleted"]);
  const plan = createPromptImportPlan(activePrompts, {
    type: PROMPT_BACKUP_TYPE,
    version: PROMPT_BACKUP_VERSION,
    exportedAt: "2026-09-20T00:00:00.000Z",
    prompts: [
      {
        id: "prompt-deleted",
        title: "已删除",
        category: "AI效能",
        tags: [],
        content: "内容",
        useCase: "测试。",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  });

  assert.equal(
    plan.mergedPrompts.filter(
      (prompt) => !trashedPromptIds.has(prompt.id),
    ).length,
    0,
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --disable-warning=ExperimentalWarning --test tests/prompt-backup.test.mjs tests/prompt-cleanup.test.mjs
```

Expected: FAIL，清理和备份兼容行为尚未实现。

- [ ] **Step 3: 云端每日清理**

In `/api/health/db`, after heartbeat:

```typescript
const { error: purgeError } = await supabase.rpc(
  "purge_expired_prompt_versions",
);

if (purgeError) {
  console.error("清理过期提示词恢复数据失败", purgeError);
}
```

Do not fail the heartbeat solely because cleanup fails.

- [ ] **Step 4: 本地启动清理**

Call `purgeExpiredTrash()` during database initialization after schema
migration and before seed count is checked.

- [ ] **Step 5: 备份兼容**

Keep the backup schema at `version: 1` because exported prompt JSON shape
only contains active prompt content fields. Import must strip lifecycle
fields and skip IDs already present in trash.

Add `promptToContentData()` in `prompt-backup.ts`:

```typescript
export function promptToContentData(
  prompt: PromptCardData,
): PromptContentData {
  return {
    id: prompt.id,
    title: prompt.title,
    category: prompt.category,
    tags: [...prompt.tags],
    content: prompt.content,
    useCase: prompt.useCase,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  };
}
```

Change `createPromptBackup()` to serialize:

```typescript
type PromptBackupFile = Omit<PromptBackup, "prompts"> & {
  prompts: PromptContentData[];
};

const backupFile = {
  type: PROMPT_BACKUP_TYPE,
  version: PROMPT_BACKUP_VERSION,
  exportedAt,
  prompts: prompts.map(promptToContentData),
} satisfies PromptBackupFile;

return JSON.stringify(backupFile, null, 2);
```

Change `parsePromptBackup()` to normalize every parsed item:

```typescript
const normalizedPrompts = backup.prompts.map((prompt) => ({
  ...prompt,
  deletedAt: null,
  deletedReason: null,
  mergedIntoPromptId: null,
}));
```

Keep `PromptBackup.prompts` as `PromptCardData[]`, and return
`normalizedPrompts` from `parsePromptBackup()`.

- [ ] **Step 6: 运行完整测试**

Run:

```powershell
npm test
```

Expected: PASS。

- [ ] **Step 7: 提交**

```powershell
git add src/app/api/health/db/route.ts src/lib/server/prompt-database.ts src/lib/prompt-backup.ts tests/prompt-backup.test.mjs tests/prompt-cleanup.test.mjs
git commit -m "feat: add prompt retention cleanup"
```

### Task 10: 文档、验收与发布准备

**Files:**
- Create: `docs/acceptance/week-08.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/product-brief.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: Task 1 至 Task 9。
- Produces: `v0.8.0` 验收记录和发布准备。

- [ ] **Step 1: 写第 8 周验收清单**

Cover:

- 2 至 5 条选择
- 目标调整
- 可选合并要求
- AI 草稿和合并说明
- 原子保存
- 来源进入垃圾箱
- 恢复快照
- 垃圾箱恢复和永久删除
- 30 天清理
- 本地/云端一致
- 账号隔离
- `npm run check`

- [ ] **Step 2: 更新产品文档**

Update roadmap and product brief to describe AI merge, trash and the
deferred version-history boundary.

- [ ] **Step 3: 更新 README 和 CHANGELOG**

Add v0.8.0 features and local/cloud behavior.

- [ ] **Step 4: 更新版本号**

Set package version and lockfile root version to `0.8.0`.

- [ ] **Step 5: 运行最终检查**

Run:

```powershell
npm run check
```

Expected: lint、typecheck、tests 和 build 全部通过。

- [ ] **Step 6: 提交**

```powershell
git add docs README.md CHANGELOG.md package.json package-lock.json
git commit -m "release: prepare v0.8.0"
```

## Self-Review

### Spec Coverage

- 选择、目标调整和可选要求：Task 6、Task 7。
- AI 合并接口与合并说明：Task 5。
- 目标覆盖、来源归档和原子提交：Task 2、Task 3、Task 4、Task 7。
- 垃圾箱、恢复和永久删除：Task 2、Task 3、Task 4、Task 8。
- 30 天清理：Task 2、Task 3、Task 9。
- 备份兼容：Task 9。
- 本地和云端一致性：Task 2、Task 3、Task 4。
- 安全和账号隔离：Task 3、Task 4、Task 5。
- 验收和发布：Task 10。

### Placeholder Scan

- 没有 `TODO`。
- 没有“待补充”。
- 没有“类似 Task N”。
- 所有实现步骤均给出目标文件、接口、测试或实际 SQL。

### Type Consistency

- 生命周期字段统一使用 `deletedAt`、`deletedReason`、
  `mergedIntoPromptId`。
- 恢复快照统一使用 `PromptVersionData` 和 `versionId`。
- 数据源方法统一使用 `commitAiMerge`、`fetchMergeRecoveryRecords`、
  `restoreMergeRecord`。
- AI 接口统一使用 `AiMergeRequest`、`PromptMergeDraft` 和
  `mergeSummary`。
