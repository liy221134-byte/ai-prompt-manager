// SQL 建表语句解析：把 CREATE TABLE 读成表和字段，再变成图谱节点草稿。
// 解析是确定性的，不调用 AI，也不猜字段含义；拿不准的地方宁可不解析，
// 让用户在预览里自己补。

import {
  createGraphImportAssetId,
  type GraphNodeImportDraft,
  type GraphNodeImportRelation,
} from "./graph-import.ts";

export type SchemaColumn = {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
};

export type SchemaForeignKey = {
  column: string;
  refSchema: string;
  refTable: string;
  refColumn: string;
};

export type SchemaTable = {
  schema: string;
  name: string;
  columns: SchemaColumn[];
  primaryKey: string[];
  foreignKeys: SchemaForeignKey[];
};

// 字符串字面量里的关键字（例如 default 'not null'）不能当成约束，
// 所以关键字一律在半角引号被抹成空格的副本上找。
function maskQuoted(text: string) {
  let masked = "";
  let index = 0;
  let quote: string | null = null;

  while (index < text.length) {
    const char = text[index];

    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) {
          masked += "  ";
          index += 2;
          continue;
        }

        quote = null;
      }

      masked += " ";
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    }

    masked += char;
    index += 1;
  }

  return masked;
}

function stripSqlComments(sql: string) {
  let result = "";
  let index = 0;
  let quote: string | null = null;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (quote) {
      result += char;

      if (char === quote) {
        if (next === quote) {
          result += next;
          index += 2;
          continue;
        }

        quote = null;
      }

      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      result += char;
      index += 1;
      continue;
    }

    if (char === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") {
        index += 1;
      }

      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;

      while (
        index < sql.length &&
        !(sql[index] === "*" && sql[index + 1] === "/")
      ) {
        index += 1;
      }

      index += 2;
      continue;
    }

    result += char;
    index += 1;
  }

  return result;
}

// 按分隔符切成若干段，括号内和引号内的分隔符不算
function splitTopLevel(text: string, separator: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      current += char;

      if (char === quote) {
        if (text[index + 1] === quote) {
          current += text[index + 1];
          index += 1;
          continue;
        }

        quote = null;
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current);

  return parts;
}

// 取括号里的内容；括号没闭合时按到末尾处理，宁可少解析也不报错中断
function readParenthesized(text: string, openIndex: number) {
  let depth = 0;
  let quote: string | null = null;

  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];

    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) {
          index += 1;
          continue;
        }

        quote = null;
      }

      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(openIndex + 1, index);
      }
    }
  }

  return text.slice(openIndex + 1);
}

function unquoteIdentifier(value: string) {
  const trimmed = value.trim();

  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];

    if (
      (first === '"' && last === '"') ||
      (first === "`" && last === "`") ||
      (first === "[" && last === "]")
    ) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
}

function splitQualifiedName(value: string) {
  return splitTopLevel(value, ".")
    .map((part) => unquoteIdentifier(part))
    .filter(Boolean);
}

function readLeadingIdentifier(value: string) {
  const trimmed = value.trimStart();

  if (!trimmed) {
    return null;
  }

  const first = trimmed[0];

  if (first === '"' || first === "`" || first === "[") {
    const closing = first === "[" ? "]" : first;
    const end = trimmed.indexOf(closing, 1);

    if (end > 0) {
      return { name: trimmed.slice(1, end), rest: trimmed.slice(end + 1) };
    }
  }

  const match = /^([^\s(,]+)([\s\S]*)$/.exec(trimmed);

  return match ? { name: match[1], rest: match[2] } : null;
}

// 类型后面跟着的是约束关键字；这些词一出现就说明类型读完了
const columnTypeStopWords: Record<string, true> = {
  not: true,
  null: true,
  default: true,
  primary: true,
  unique: true,
  references: true,
  check: true,
  constraint: true,
  generated: true,
  collate: true,
  deferrable: true,
};

// 多词类型：character varying(255)、timestamp with time zone、double precision
const typeContinuationWords: Record<string, true> = {
  varying: true,
  precision: true,
  with: true,
  without: true,
  time: true,
  zone: true,
};

function readColumnType(value: string) {
  const trimmed = value.trimStart();
  const match =
    /^([A-Za-z_][\w$]*(?:\s*\([^)]*\))?(?:\s*\[\s*\])*)/.exec(trimmed);

  if (!match) {
    return { type: "", rest: trimmed };
  }

  let type = match[1].trim();
  let rest = trimmed.slice(match[0].length).trimStart();

  while (true) {
    const word = /^([A-Za-z_][\w$]*)\s*/.exec(rest);

    if (!word || !typeContinuationWords[word[1].toLowerCase()]) {
      break;
    }

    type += ` ${word[1]}`;
    rest = rest.slice(word[0].length).trimStart();

    if (rest.startsWith("(")) {
      const close = rest.indexOf(")");

      if (close > 0) {
        type += rest.slice(0, close + 1);
        rest = rest.slice(close + 1).trimStart();
      }
    }
  }

  return { type, rest };
}

function readDefaultValue(text: string) {
  const masked = maskQuoted(text);
  const match = /\bdefault\b/i.exec(masked);

  if (!match) {
    return null;
  }

  const start = match.index + match[0].length;
  const tail = masked.slice(start);
  const stop = /\b(?:not|null|primary|unique|references|check|constraint|generated|collate|deferrable)\b/i.exec(
    tail,
  );
  const value = text
    .slice(start, stop ? start + stop.index : text.length)
    .trim();

  // default null 等于没有默认值
  return value || null;
}

function readIdentifierList(text: string) {
  const open = text.indexOf("(");

  if (open < 0) {
    return [];
  }

  return splitTopLevel(readParenthesized(text, open), ",")
    .map((item) => unquoteIdentifier(item))
    .filter(Boolean);
}

function parseColumn(part: string): SchemaColumn | null {
  const leading = readLeadingIdentifier(part);

  if (!leading || columnTypeStopWords[leading.name.toLowerCase()]) {
    return null;
  }

  const { type, rest } = readColumnType(leading.rest);
  const masked = maskQuoted(rest);

  return {
    name: leading.name,
    type: type || "未标注",
    notNull: /\bnot\s+null\b/i.test(masked),
    defaultValue: readDefaultValue(rest),
    isPrimaryKey: /\bprimary\s+key\b/i.test(masked),
  };
}

// references 子句在两种写法里都长这样：行内引用和表级外键共用一套解析
function parseReferenceClause(text: string) {
  const reference = /\breferences\s+([^\s(]+)\s*\(([^)]*)\)/i.exec(text);

  if (!reference) {
    return null;
  }

  const tableParts = splitQualifiedName(reference[1]);
  const refTable = tableParts[tableParts.length - 1] ?? "";
  const refSchema = tableParts.length > 1 ? tableParts[tableParts.length - 2] : "";
  const refColumns = splitTopLevel(reference[2], ",")
    .map((item) => unquoteIdentifier(item))
    .filter(Boolean);

  if (!refTable) {
    return null;
  }

  return { refSchema, refTable, refColumns };
}

function readForeignKeys(text: string) {
  const columns = readIdentifierList(text);
  const reference = parseReferenceClause(text);

  if (!reference || columns.length === 0) {
    return [];
  }

  return columns.map((column, index) => ({
    column,
    refSchema: reference.refSchema,
    refTable: reference.refTable,
    // 复合外键的列数对不上时，后面的列都指向第一个引用列
    refColumn: reference.refColumns[index] ?? reference.refColumns[0] ?? "",
  }));
}

// 列级引用：`user_id uuid not null references auth.users(id)`
function readInlineForeignKeys(columnName: string, text: string) {
  const reference = parseReferenceClause(text);

  if (!reference) {
    return [];
  }

  return [
    {
      column: columnName,
      refSchema: reference.refSchema,
      refTable: reference.refTable,
      refColumn: reference.refColumns[0] ?? "",
    },
  ];
}

type TablePart =
  | { kind: "column"; column: SchemaColumn }
  | { kind: "primaryKey"; columns: string[] }
  | { kind: "foreignKey"; foreignKeys: SchemaForeignKey[] }
  | { kind: "ignore" };

function parseTablePart(part: string): TablePart {
  let body = part.trim();
  const constraint = /^constraint\s+/i.exec(body);

  if (constraint) {
    const leading = readLeadingIdentifier(body.slice(constraint[0].length));

    if (leading) {
      body = leading.rest.trim();
    }
  }

  const masked = maskQuoted(body);

  if (/^primary\s+key\b/i.test(masked)) {
    return { kind: "primaryKey", columns: readIdentifierList(body) };
  }

  if (/^foreign\s+key\b/i.test(masked)) {
    return { kind: "foreignKey", foreignKeys: readForeignKeys(body) };
  }

  if (/^(?:unique|check|exclude|like|inherits)\b/i.test(masked)) {
    return { kind: "ignore" };
  }

  const column = parseColumn(body);

  return column ? { kind: "column", column } : { kind: "ignore" };
}

function parseCreateTable(statement: string): SchemaTable | null {
  const match =
    /^\s*create\s+(?:or\s+replace\s+)?(?:global\s+|local\s+|temporary\s+|temp\s+|unlogged\s+)*table\s+(?:if\s+not\s+exists\s+)?/i.exec(
      statement,
    );

  if (!match) {
    return null;
  }

  const rest = statement.slice(match[0].length);
  const openIndex = rest.indexOf("(");

  if (openIndex < 0) {
    return null;
  }

  const nameParts = splitQualifiedName(rest.slice(0, openIndex));

  if (nameParts.length === 0) {
    return null;
  }

  const name = nameParts[nameParts.length - 1];
  const schema = nameParts.length > 1 ? nameParts[nameParts.length - 2] : "public";
  const columns: SchemaColumn[] = [];
  const foreignKeys: SchemaForeignKey[] = [];
  let primaryKey: string[] = [];

  for (const part of splitTopLevel(readParenthesized(rest, openIndex), ",")) {
    if (!part.trim()) {
      continue;
    }

    const parsed = parseTablePart(part);

    if (parsed.kind === "column") {
      columns.push(parsed.column);
      foreignKeys.push(
        ...readInlineForeignKeys(parsed.column.name, part),
      );
    } else if (parsed.kind === "primaryKey") {
      primaryKey = parsed.columns;
    } else if (parsed.kind === "foreignKey") {
      foreignKeys.push(...parsed.foreignKeys);
    }
  }

  if (primaryKey.length === 0) {
    primaryKey = columns
      .filter((column) => column.isPrimaryKey)
      .map((column) => column.name);
  }

  return { schema, name, columns, primaryKey, foreignKeys };
}

export function parseSqlSchema(sql: string): SchemaTable[] {
  const tables: SchemaTable[] = [];

  for (const statement of splitTopLevel(stripSqlComments(sql), ";")) {
    const table = parseCreateTable(statement);

    if (table) {
      tables.push(table);
    }
  }

  return tables;
}

function escapeTableCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim() || "—";
}

function buildTableContent(table: SchemaTable, sourceLabel: string) {
  const lines = [
    `来自 \`${sourceLabel}\` 的建表语句。`,
    "",
    "| 字段 | 类型 | 约束 |",
    "| --- | --- | --- |",
  ];

  for (const column of table.columns) {
    const marks: string[] = [];

    if (column.isPrimaryKey) {
      marks.push("主键");
    }

    if (column.notNull) {
      marks.push("非空");
    }

    if (column.defaultValue) {
      marks.push(`默认 ${column.defaultValue}`);
    }

    lines.push(
      `| ${escapeTableCell(column.name)} | ${escapeTableCell(
        column.type,
      )} | ${marks.join(" · ") || "—"} |`,
    );
  }

  if (table.primaryKey.length > 0) {
    lines.push("", `主键：${table.primaryKey.join("、")}`);
  }

  if (table.foreignKeys.length > 0) {
    lines.push("", "外键：");

    for (const foreignKey of table.foreignKeys) {
      lines.push(
        `- ${foreignKey.column} → ${foreignKey.refTable}(${foreignKey.refColumn})`,
      );
    }
  }

  return lines.join("\n");
}

// 同一份 SQL 里同名表跨 schema 时，后面的那个编号带上 schema，
// 否则同一批导入会出现两个一样的编号。
function buildCodeResolver(tables: SchemaTable[]) {
  const codeByQualifiedName = new Map<string, string>();
  const codeByBareName = new Map<string, string>();
  const codes: string[] = [];
  const used = new Set<string>();

  for (const table of tables) {
    let code = `TBL-${table.name}`;

    if (used.has(code.toLocaleUpperCase())) {
      code = `TBL-${table.schema}.${table.name}`;
    }

    used.add(code.toLocaleUpperCase());
    codes.push(code);
    codeByQualifiedName.set(`${table.schema}.${table.name}`.toLowerCase(), code);

    const bareKey = table.name.toLowerCase();
    // 同名的第二个表开始，光看表名已经不唯一了
    codeByBareName.set(bareKey, codeByBareName.has(bareKey) ? "" : code);
  }

  return {
    codes,
    resolve(foreignKey: SchemaForeignKey) {
      const qualified = codeByQualifiedName.get(
        `${foreignKey.refSchema}.${foreignKey.refTable}`.toLowerCase(),
      );

      if (qualified) {
        return qualified;
      }

      const bare = codeByBareName.get(foreignKey.refTable.toLowerCase());

      // 批内没有这张表时按 TBL-表名 记一个编号：
      // 库里已经有同编号的节点就连上（增量导入下一份迁移时用得上），
      // 没有的话物化阶段会丢掉这条关系。
      // bare 是空串表示批内有两张同名表，这时不能猜，直接不建关系。
      return bare ?? `TBL-${foreignKey.refTable}`;
    },
  };
}

export function buildSchemaImportDrafts(
  tables: SchemaTable[],
  options: { sourceLabel?: string } = {},
): GraphNodeImportDraft[] {
  const sourceLabel = options.sourceLabel?.trim() || "粘贴的 SQL";
  const resolver = buildCodeResolver(tables);

  return tables.map((table, index) => {
    const code = resolver.codes[index];
    const relations: GraphNodeImportRelation[] = [];
    const relationByTarget = new Map<string, GraphNodeImportRelation>();

    for (const foreignKey of table.foreignKeys) {
      const targetCode = resolver.resolve(foreignKey);

      if (
        !targetCode ||
        targetCode === code
      ) {
        continue;
      }

      const note = `${foreignKey.column} → ${foreignKey.refTable}(${foreignKey.refColumn})`;
      const existing = relationByTarget.get(targetCode);

      // 复合外键指向同一张表，合并成一条关系，说明里把两侧列都写上
      if (existing) {
        if (!existing.note.includes(note)) {
          existing.note = `${existing.note}、${note}`;
        }

        continue;
      }

      const relation = { targetCode, relationType: "depends_on" as const, note };
      relationByTarget.set(targetCode, relation);
      relations.push(relation);
    }

    const duplicatedName = code !== `TBL-${table.name}`;

    return {
      id: createGraphImportAssetId(),
      nodeType: "data",
      code,
      title: duplicatedName ? `${table.schema}.${table.name}` : table.name,
      summary:
        `${table.columns.length} 个字段` +
        (table.foreignKeys.length > 0
          ? `，${table.foreignKeys.length} 处外键引用`
          : ""),
      content: buildTableContent(table, sourceLabel),
      note: `从 ${sourceLabel} 导入的建表语句`,
      sourceLabel,
      parentCode: null,
      relations,
    };
  });
}
