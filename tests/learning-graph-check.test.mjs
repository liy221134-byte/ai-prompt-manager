import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GRAPH_IMAGE_MAX_BYTES,
  buildReferencePoints,
  countGraphFindings,
  describeBytes,
  describeScope,
  isCleanGraphCheck,
  mentionsPoint,
  mentionsPointAndModule,
  parseImageDataUrl,
} from "../src/lib/learning/graph.ts";
import {
  buildGraphCheckMessages,
  looksLikeImageNotRead,
  normalizeGraphCheck,
  validateGraphCheckRequest,
} from "../src/lib/learning/graph-prompt.ts";

// ── 这一组守的是 M6 的两条底线 ──────────────────────────
//
// 1. 「遗漏」必须相对**他选的模块**说。分母错了，结论就从「你漏了挣值分析」
//    变成「你漏了 24 个」——正确、但没有任何用。
// 2. 「错位」必须点名谁错了。不点名的「有些概念挂错了地方」对着任何一张图都成立，
//    等于没说，还占着屏幕。
//
// 另外守一个防呆：模型读不出图时（照片拍糊），不能把整张清单都判成遗漏，
// 那会让人去补一堆其实已经画了的知识点。

const MODULES = [
  { id: "m-s1", name: "S1 项目管理框架" },
  { id: "m-s2", name: "S2 五大过程组" },
  { id: "m-s3", name: "S3 信息技术基础" },
];

const POINTS = [
  { name: "项目管理十大知识领域", moduleId: "m-s1", moduleName: "S1 项目管理框架" },
  { name: "五大过程组", moduleId: "m-s2", moduleName: "S2 五大过程组" },
  { name: "挣值分析", moduleId: "m-s2", moduleName: "S2 五大过程组" },
  { name: "云计算服务模式", moduleId: "m-s3", moduleName: "S3 信息技术基础" },
];

/** 1×1 白点 PNG，够用来测格式判定 */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AH1mHqOAAAAAElFTkSuQmCC";

function request(overrides = {}) {
  return {
    modules: MODULES,
    points: POINTS,
    imageDataUrl: TINY_PNG,
    note: "",
    ...overrides,
  };
}

// ── 图片 ────────────────────────────────────────────────

test("parseImageDataUrl 认得出 jpeg/png/webp 并算出解码后字节数", () => {
  const png = parseImageDataUrl(TINY_PNG);
  assert.ok(png);
  assert.equal(png.mime, "image/png");
  // 与标准解码器对拍：自己算 padding 容易差一两个字节，而字节数决定大小的判定
  assert.equal(png.bytes, Buffer.from(png.base64, "base64").length);
  assert.ok(png.bytes > 0);
});

test("parseImageDataUrl 拒绝非 data URL、非图片、与 HEIC", () => {
  assert.equal(parseImageDataUrl("https://example.test/a.jpg"), null);
  assert.equal(parseImageDataUrl("data:text/plain;base64,aGVsbG8="), null);
  // iPhone 直出是 HEIC。浏览器多半已经转过，转不了的必须挡在这里并给出重选的话术
  assert.equal(parseImageDataUrl("data:image/heic;base64,aGVsbG8="), null);
  assert.equal(parseImageDataUrl(""), null);
  assert.equal(parseImageDataUrl(null), null);
  // 带换行的 base64 不接受：请求体里的 data URL 不该有它，有说明来源可疑
  assert.equal(parseImageDataUrl("data:image/png;base64,aGVs\nbG8="), null);
});

test("describeBytes 按量级换单位", () => {
  assert.equal(describeBytes(512), "512B");
  assert.equal(describeBytes(2048), "2KB");
  assert.equal(describeBytes(5 * 1024 * 1024), "5.0MB");
});

// ── 参照清单 ─────────────────────────────────────────────

test("buildReferencePoints 只取选中模块下的知识点", () => {
  const knowledgePoints = [
    { name: "项目管理十大知识领域", module_id: "m-s1" },
    { name: "挣值分析", module_id: "m-s2" },
    { name: "云计算服务模式", module_id: "m-s3" },
  ];

  // 只勾 S2：分母就只有 1 个。这是「遗漏」这个词能不能成立的前提
  const onlyS2 = buildReferencePoints(knowledgePoints, MODULES, ["m-s2"]);
  assert.deepEqual(onlyS2, [
    { name: "挣值分析", moduleId: "m-s2", moduleName: "S2 五大过程组" },
  ]);

  const all = buildReferencePoints(knowledgePoints, MODULES, MODULES.map((m) => m.id));
  assert.equal(all.length, 3);
});

test("buildReferencePoints 丢掉没有模块归属的知识点，并给未知模块兜底名", () => {
  const points = [
    { name: "孤儿知识点", module_id: null },
    { name: "挂在别处的知识点", module_id: "m-unknown" },
  ];
  const scoped = buildReferencePoints(points, MODULES, ["m-s1", "m-unknown"]);
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].moduleName, "未归属模块");
});

test("describeScope 说清这次看哪几块，不写「全主题」", () => {
  assert.equal(describeScope([]), "还没选模块");
  assert.equal(describeScope([MODULES[0]]), "S1 项目管理框架");
  assert.match(describeScope([MODULES[0], MODULES[1]]), /^2 个模块：/);
});

// ── 点名判定 ─────────────────────────────────────────────

test("mentionsPoint 认全称、简称与写错空格的写法", () => {
  assert.ok(mentionsPoint("图上没找到挣值分析", POINTS));
  // 名字中间被空格拆开也算命中：手写体识别出来常带空格
  assert.ok(mentionsPoint("没看到「挣 值 分 析」", POINTS));
  // 清单外的概念不算
  assert.equal(mentionsPoint("缺少沟通管理计划", POINTS), false);
});

test("mentionsPointAndModule 必须同时点到知识点与模块", () => {
  assert.ok(
    mentionsPointAndModule(
      "「挣值分析」画在了 S1 项目管理框架 那边，按清单应属于 S2 五大过程组",
      POINTS,
      MODULES,
    ),
  );
  // 只说了「有些东西挂错了」，没有谁、错到哪 —— 这种话必须被丢掉
  assert.equal(mentionsPointAndModule("有些概念挂错了地方", POINTS, MODULES), false);
  assert.equal(mentionsPointAndModule("挣值分析画错位置了", POINTS, MODULES), false);
});

// ── 请求校验 ─────────────────────────────────────────────

test("validateGraphCheckRequest 逐条给出可执行的错误话术", () => {
  const noModules = validateGraphCheckRequest(request({ modules: [] }));
  assert.equal(noModules.ok, false);
  assert.match(noModules.error, /先选/);

  const noPoints = validateGraphCheckRequest(request({ points: [] }));
  assert.equal(noPoints.ok, false);
  assert.match(noPoints.error, /参照物/);

  const badImage = validateGraphCheckRequest(request({ imageDataUrl: "data:image/heic;base64,aGVsbG8=" }));
  assert.equal(badImage.ok, false);
  assert.match(badImage.error, /JPG 或 PNG/);

  const noImage = validateGraphCheckRequest(request({ imageDataUrl: undefined }));
  assert.equal(noImage.ok, false);
});

test("validateGraphCheckRequest 挡掉超过上限的图，并说清该做什么", () => {
  // 造一张声明长度超限的假图：内容不必真是一张图，长度先过线
  const huge = `data:image/jpeg;base64,${"A".repeat(Math.ceil((GRAPH_IMAGE_MAX_BYTES * 4) / 3) + 8)}`;
  const result = validateGraphCheckRequest(request({ imageDataUrl: huge }));
  assert.equal(result.ok, false);
  assert.match(result.error, /重新拍/);
});

test("validateGraphCheckRequest 丢掉范围外的知识点，不让分母被放大", () => {
  const result = validateGraphCheckRequest(
    request({ modules: [MODULES[0]], points: POINTS }),
  );
  assert.equal(result.ok, true);
  // 只勾了 S1，传进来 4 个知识点，最终只该剩 S1 的 1 个
  assert.equal(result.value.points.length, 1);
  assert.equal(result.value.points[0].name, "项目管理十大知识领域");
});

test("validateGraphCheckRequest 拒绝缺 moduleId 的知识点", () => {
  const result = validateGraphCheckRequest(
    request({ points: [{ name: "挣值分析", moduleName: "S2 五大过程组" }] }),
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /参照物/);
});

// ── 提示词 ───────────────────────────────────────────────

test("buildGraphCheckMessages 把图放在 user 消息的数组里", () => {
  const messages = buildGraphCheckMessages({
    modules: MODULES,
    points: POINTS,
    imageDataUrl: TINY_PNG,
    note: "右下角是上周画的",
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  // 第 1 条硬规则是「不许替他画」，它是这个功能不越界的唯一凭证
  assert.match(messages[0].content, /不许替他画/);

  const userContent = messages[1].content;
  assert.ok(Array.isArray(userContent));
  assert.equal(userContent[0].type, "text");
  assert.equal(userContent[1].type, "image_url");
  assert.equal(userContent[1].image_url.url, TINY_PNG);

  const text = userContent[0].text;
  // 参照清单按模块分组，模型才知道每个知识点「本来该在哪」
  assert.match(text, /### S1 项目管理框架（1 个）/);
  assert.match(text, /挣值分析/);
  // 他的补充说明要带进去
  assert.match(text, /右下角是上周画的/);
});

test("buildGraphCheckMessages 在没填说明时给出明确占位，不留空行", () => {
  const messages = buildGraphCheckMessages({
    modules: MODULES,
    points: POINTS,
    imageDataUrl: TINY_PNG,
    note: "",
  });
  const text = messages[1].content[0].text;
  assert.match(text, /他没有补充说明/);
});

// ── 返回校验 ─────────────────────────────────────────────

const INPUT = { modules: MODULES, points: POINTS, imageDataUrl: TINY_PNG, note: "" };

test("normalizeGraphCheck 丢掉清单外的 missing", () => {
  const check = normalizeGraphCheck(
    JSON.stringify({
      missing: ["挣值分析", "沟通管理计划"],
      misplaced: [],
      wrongLinks: [],
      unclear: [],
    }),
    INPUT,
  );
  assert.deepEqual(check.missing, ["挣值分析"]);
});

test("normalizeGraphCheck 丢掉没点名的 misplaced，留下点名的那条", () => {
  const check = normalizeGraphCheck(
    JSON.stringify({
      missing: [],
      misplaced: [
        "有些概念挂错了地方",
        "「挣值分析」画在了 S1 项目管理框架 那边，按清单应属于 S2 五大过程组",
      ],
      wrongLinks: [],
      unclear: [],
    }),
    INPUT,
  );
  assert.equal(check.misplaced.length, 1);
  assert.match(check.misplaced[0], /挣值分析/);
});

test("normalizeGraphCheck 对同一处只说一遍，并截断过长的条目", () => {
  const long = "挣值分析".repeat(40);
  const check = normalizeGraphCheck(
    JSON.stringify({
      missing: ["挣值分析", "挣值分析 ", long],
      misplaced: [],
      wrongLinks: ["五大过程组 与 云计算服务模式 之间不该连线"],
      unclear: ["右上角那块字太糊"],
    }),
    INPUT,
  );
  // 归一化后前两条是同一个，只留第一条
  assert.equal(check.missing.length, 2);
  assert.equal(check.missing[1].endsWith("…"), true);
  assert.ok(check.missing[1].length <= 60);
  assert.equal(check.wrongLinks.length, 1);
  assert.equal(check.unclear.length, 1);
});

test("normalizeGraphCheck 挡住 markdown 围栏和前后废话", () => {
  const check = normalizeGraphCheck(
    ["好的，我看了这张图：", "```json", '{"missing":["挣值分析"],"misplaced":[],"wrongLinks":[],"unclear":[]}', "```"].join(
      "\n",
    ),
    INPUT,
  );
  assert.deepEqual(check.missing, ["挣值分析"]);
});

test("normalizeGraphCheck 遇到空返回或非 JSON 直接报错，不返回一个空结论", () => {
  assert.throws(() => normalizeGraphCheck("", INPUT), /为空/);
  assert.throws(() => normalizeGraphCheck("我看不出问题", INPUT), /找不到 JSON/);
});

// ── 结论解读 ─────────────────────────────────────────────

test("isCleanGraphCheck 只在四类都空时为真", () => {
  assert.equal(
    isCleanGraphCheck({ missing: [], misplaced: [], wrongLinks: [], unclear: [] }),
    true,
  );
  // 只有 unclear 也算「没挑出毛病」，但它带着信息，界面仍要展示
  assert.equal(
    isCleanGraphCheck({ missing: [], misplaced: [], wrongLinks: [], unclear: ["看不清"] }),
    false,
  );
});

test("countGraphFindings 把四类加起来", () => {
  assert.equal(
    countGraphFindings({ missing: ["a"], misplaced: ["b", "c"], wrongLinks: [], unclear: ["d"] }),
    4,
  );
});

test("looksLikeImageNotRead 在整张清单几乎全被判成遗漏时报警", () => {
  // 10 个参照、命中 8 个 → 像是图没拍进去，不是真漏了 8 个
  const check = {
    missing: Array.from({ length: 8 }, (_, index) => `知识点${index}`),
    misplaced: [],
    wrongLinks: [],
    unclear: [],
  };
  assert.equal(looksLikeImageNotRead(check, 10), true);

  // 同样 8 条但分母有 30：这是「这周只画了一半」，不是没拍到
  assert.equal(looksLikeImageNotRead(check, 30), false);

  // 参照太少时不判：3 个里有 3 个没找到，可能真的很正常
  assert.equal(
    looksLikeImageNotRead({ missing: ["a", "b", "c"], misplaced: [], wrongLinks: [], unclear: [] }, 3),
    false,
  );

  // 条数下限：4/5 = 80% 但只有 4 条，不值得报警去打扰他
  assert.equal(
    looksLikeImageNotRead(
      { missing: ["a", "b", "c", "d"], misplaced: [], wrongLinks: [], unclear: [] },
      5,
    ),
    false,
  );
});
