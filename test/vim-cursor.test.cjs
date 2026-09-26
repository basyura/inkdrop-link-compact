const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");
const { createHarness, element, EditorSelection } = require("./helpers/harness.cjs");

let h;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.destroy());

const hiddenClass = "link-compact-hidden-cursor-text";
function cursor(primary = true) {
  const node = element();
  if (primary) node.classList.add("cm-cursor-primary");
  return node;
}

for (const [name, doc, anchor, hidden] of [
  ["ラベル", "[abc](url)", 2, false],
  ["アイコン", "[abc](url)", 4, true],
  ["URL 内部", "[abc](url)", 7, true],
  ["開始括弧", "[abc](url)", 0, true],
  ["画像の感嘆符", "![abc](url)", 0, true],
  ["画像の角括弧", "![abc](url)", 1, true],
  ["画像ラベル", "![abc](url)", 3, false],
  ["リンク外", "[a](url) text", 10, false],
]) {
  test(`Vim のカーソル文字: ${name}`, () => {
    const node = cursor();
    // Composition bypasses selection correction so hidden source positions can
    // be checked, just as a cursor DOM redraw can expose source text.
    const view = h.compact(doc, { cursors: [node] });
    view.composing = true;
    view.dispatch({ selection: { anchor } });
    assert.equal(node.classList.contains(hiddenClass), hidden);
    assert.equal(node.classList.contains("cm-cursor-primary"), true);
  });
}

test("ラベルへ戻る・記法展開・短縮解除でカーソル文字の非表示を解除する", () => {
  const node = cursor();
  const view = h.compact("[abc](url)", { anchor: 4, vim: true, cursors: [node] });
  assert.equal(node.classList.contains(hiddenClass), true);
  view.dispatch({ selection: { anchor: 3 } });
  assert.equal(node.classList.contains(hiddenClass), false);
  view.dispatch({ selection: { anchor: 4 } });
  assert.equal(node.classList.contains(hiddenClass), true);
  assert.equal(view.key("Delete"), true);
  assert.equal(node.classList.contains(hiddenClass), false);
  view.dispatch({ selection: { anchor: 1 } });
  view.dispatch({ selection: { anchor: 0 } });
  view.dispatch({ selection: { anchor: 4 } });
  assert.equal(node.classList.contains(hiddenClass), true);
  h.extension.ensureLinkCompactExtension(view, true);
  assert.equal(node.classList.contains(hiddenClass), false);
  assert.equal(h.observers[0].disconnected, true);
});

test("カーソル DOM の再生成を監視して文字を隠す", () => {
  const view = h.compact("[a](u)", { anchor: 2 });
  const observer = h.observers[0];
  assert.equal(observer.target, view.scrollDOM);
  assert.equal(observer.options.childList, true);
  assert.equal(observer.options.subtree, true);
  const node = cursor();
  view.cursors = [node];
  observer.fire();
  assert.equal(node.classList.contains(hiddenClass), true);
  const next = cursor();
  view.cursors = [next];
  observer.fire();
  assert.equal(next.classList.contains(hiddenClass), true);
  view.destroy();
  assert.equal(next.classList.contains(hiddenClass), false);
  assert.equal(observer.disconnected, true);
});

test("複数カーソルの主選択・副選択をそれぞれ判定する", () => {
  const secondary = cursor(false);
  const primary = cursor();
  const view = h.compact("[a](u) [b](v)", { cursors: [secondary, primary] });
  view.dispatch({
    selection: EditorSelection.create(
      [EditorSelection.cursor(1), EditorSelection.cursor(9)],
      1
    ),
  });
  assert.equal(secondary.classList.contains(hiddenClass), false);
  assert.equal(primary.classList.contains(hiddenClass), true);
  view.dispatch({
    selection: EditorSelection.create(
      [EditorSelection.cursor(2), EditorSelection.cursor(8)],
      1
    ),
  });
  assert.equal(secondary.classList.contains(hiddenClass), true);
  assert.equal(primary.classList.contains(hiddenClass), false);
});

test("主カーソルだけ描画された場合も副選択と取り違えない", () => {
  const primary = cursor();
  const view = h.compact("[a](u) [b](v)", { cursors: [primary] });
  view.dispatch({
    selection: EditorSelection.create(
      [EditorSelection.cursor(1), EditorSelection.cursor(9)],
      1
    ),
  });
  assert.equal(primary.classList.contains(hiddenClass), true);
});

for (const [name, doc, anchor, head, hidden] of [
  ["前方選択の末尾は直前の文字", "[abc](url) x", 1, 4, false],
  ["前方選択で URL を含む", "[abc](url) x", 1, 5, true],
  ["後方選択は head の文字", "[abc](url) x", 8, 4, true],
  ["文書末尾", "[abc](url)", 1, 10, true],
  ["改行位置は直前に戻さない", "[abc](url)\n", 1, 10, false],
]) {
  test(`Vim の範囲選択: ${name}`, () => {
    const node = cursor();
    const view = h.compact(doc, { cursors: [node] });
    view.dispatch({ selection: { anchor, head } });
    assert.equal(node.classList.contains(hiddenClass), hidden);
  });
}

test("カーソル用 CSS は文字色だけを透明にし、背景と輪郭を保持する", () => {
  const css = readFileSync(
    path.resolve(__dirname, "../styles/link-compact.css"),
    "utf8"
  );
  const rule = css.match(
    /\.cm-vimCursorLayer\s+\.link-compact-hidden-cursor-text\s*\{([^}]+)\}/
  );
  assert.ok(rule);
  assert.match(rule[1], /color:\s*transparent\s*!important/);
  assert.doesNotMatch(
    rule[1],
    /(?:background|border|outline|opacity|display|visibility)\s*:/
  );
});
