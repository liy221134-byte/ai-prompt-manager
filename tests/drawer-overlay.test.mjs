import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

// 抽屉和弹层必须挂在整个窗口上：外层 fixed 覆盖 + 内层贴边。
// 2026-09-24 线上自测发现 5 个抽屉只写了内层的 absolute，浮层相对页面原点定位，
// 页面一滚动就跑到可视区外、按钮点不到。这条测试挡住同类问题再犯。
const componentsDir = path.join(process.cwd(), "src", "components");

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

test("每个抽屉和弹层都有铺满窗口的固定覆盖层", () => {
  for (const name of overlayFileNames()) {
    assert.match(
      readComponent(name),
      /"fixed inset-0/,
      `${name} 缺少 fixed inset-0 覆盖层，浮层会随页面滚动跑到可视区外`,
    );
  }
});

test("固定覆盖层写在遮罩和贴边面板之前", () => {
  for (const name of overlayFileNames()) {
    const source = readComponent(name);
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
