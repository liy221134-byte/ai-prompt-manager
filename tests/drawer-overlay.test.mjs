import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// 抽屉和弹层必须挂在整个窗口上：外层 fixed 覆盖 + 内层贴边。
// 2026-09-24 线上自测发现 5 个抽屉只写了内层的 absolute，浮层相对页面原点定位，
// 页面一滚动就跑到可视区外、按钮点不到。这条测试挡住同类问题再犯。
//
// 2026-10-29 改：抽屉外壳抽成了 DrawerShell（讲义、追问、素材表三份外壳逐字相同，
// M6 还要求第四份）。覆盖层现在只有**一个**来源，所以检查改成两条：
//   ① 基座自己有覆盖层——它坏了，所有用它的抽屉一起坏；
//   ② 每个抽屉要么自带覆盖层，要么明确走基座。
// 这不是放宽：以前是「15 个文件各查一遍同样的两行」，现在是「查那两行 1 次 + 查 15 处都接对了」。
const componentsDir = path.join(process.cwd(), "src", "components");
const SHELL = "drawer-shell.tsx";
const OVERLAY = /"fixed inset-0/;
const USES_SHELL = /from "@\/components\/drawer-shell"/;

function overlayFileNames() {
  return readdirSync(componentsDir)
    .filter((name) => /-(drawer|dialog)\.tsx$/.test(name))
    .sort();
}

function readComponent(name) {
  return readFileSync(path.join(componentsDir, name), "utf8");
}

test("抽屉和弹层清单不是空的", () => {
  assert.ok(overlayFileNames().length >= 15, "没扫到抽屉组件，测试本身失效了");
});

test("抽屉基座自带铺满窗口的固定覆盖层", () => {
  assert.match(
    readComponent(SHELL),
    OVERLAY,
    `${SHELL} 少了 fixed inset-0 覆盖层——用它做的抽屉会一起跑到可视区外`,
  );
});

test("每个抽屉和弹层要么自带覆盖层，要么走基座", () => {
  for (const name of overlayFileNames()) {
    const source = readComponent(name);
    assert.ok(
      OVERLAY.test(source) || USES_SHELL.test(source),
      `${name} 既没有 fixed inset-0 覆盖层，也没走 DrawerShell：浮层会随页面滚动跑到可视区外`,
    );
  }
});

test("固定覆盖层写在遮罩和贴边面板之前", () => {
  for (const name of overlayFileNames()) {
    const source = readComponent(name);
    // 覆盖层在基座里的，位置由基座保证，这里不用再查
    if (!OVERLAY.test(source)) continue;

    const fixedIndex = source.indexOf('"fixed inset-0');
    const backdropIndex = source.indexOf('"absolute inset-0');
    const panelIndex = source.indexOf('"absolute inset-y-0');

    assert.ok(fixedIndex >= 0, `${name} 缺少 fixed inset-0 覆盖层`);

    if (backdropIndex >= 0) {
      assert.ok(
        fixedIndex < backdropIndex,
        `${name} 的遮罩写在固定覆盖层之外`,
      );
    }

    if (panelIndex >= 0) {
      assert.ok(
        fixedIndex < panelIndex,
        `${name} 的贴边面板写在固定覆盖层之外`,
      );
    }
  }
});
