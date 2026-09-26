const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const { createHarness, ranges, widgets, cm } = require("./helpers/harness.cjs");

let h;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.destroy());

const cases = [
  ["通常リンク", "x [label](https://example.test/a) z", ["https://example.test/a"]],
  ["ノートリンク", "[note](inkdrop://note:123)", ["inkdrop://note:123"]],
  ["画像リンク", "![alt](image.png)", ["image.png"]],
  ["相対 URL とアンカー", "[a](../a.md) [b](#section)", ["../a.md", "#section"]],
  [
    "括弧を含む URL",
    "[a](https://example.test/a(b(c)))",
    ["https://example.test/a(b(c))"],
  ],
  ["空ラベル", "[](url)![](image)", ["url", "image"]],
  ["隣接リンク", "[a](one)[b](two)![c](three)", ["one", "two", "three"]],
  ["入れ子のラベル", "[outer [inner] text](url)", ["url"]],
  ["複数行のラベル", "[first\nsecond](url)", ["url"]],
  ["日本語・結合文字・絵文字", "[日本語é👩‍💻](日本語/😀)", ["日本語/😀"]],
  ["エスケープされたラベル内括弧", String.raw`[a \] b \[ c](url)`, ["url"]],
  ["偶数個のバックスラッシュ", String.raw`\\[a](url)`, ["url"]],
  ["エスケープされた開始括弧", String.raw`\[a](url)`, []],
  ["エスケープされた閉じ括弧", String.raw`[a\](url)`, []],
  ["開始括弧なし", "a](url)", []],
  ["空 URL", "[a]()", []],
  ["未完了 URL", "[a](url", []],
  ["閉じていない入れ子", "[a](url(inner)", []],
  ["URL 内の改行", "[a](one\ntwo)", []],
  ["URL 内の CR", "[a](one\rtwo)", []],
  ["URL 内の CRLF", "[a](one\r\ntwo)", []],
  ["改行後の正常リンク", "[bad](one\n[good](two)", ["two"]],
  ["不正な括弧の後の正常リンク", "] [good](url)", ["url"]],
  [
    "参照リンクと裸の URL",
    "[a][ref] <https://example.test> https://example.test",
    [],
  ],
  ["空文書", "", []],
  // The current scanner is textual, not a CommonMark syntax-tree parser.
  ["コード内のリンクも対象", "`[a](one)`\n```\n[b](two)\n```", ["one", "two"]],
  ["タイトル部分も URL として保持", '[a](url "title")', ['url "title"']],
];

for (const [name, doc, urls] of cases) {
  test(`リンク解析: ${name}`, () => {
    const view = h.createView(doc);
    const original = view.state.doc.toString();
    h.extension.ensureLinkCompactExtension(view, false);
    assert.deepEqual(
      widgets(view).map(({ value }) => value.spec.widget.url),
      urls
    );
    assert.equal(view.state.doc.toString(), original);
    assert.equal(view.instance.editingRanges.size, 0);
  });
}

for (const [doc, opening, label, closing] of [
  ["x [label](url) z", "[", "label", "](url)"],
  ["x ![alt](image) z", "![", "alt", "](image)"],
  ["[outer [inner]](url)", "[", "outer [inner]", "](url)"],
  ["[](url)", "[", "", "](url)"],
]) {
  test(`装飾と atomic range が記法だけを隠す: ${doc}`, () => {
    const view = h.compact(doc);
    const decorations = ranges(view.instance.decorations);
    const atoms = ranges(view.instance.atomicRanges);
    assert.equal(decorations.length, 3);
    assert.deepEqual(
      atoms.map(({ from, to }) => doc.slice(from, to)),
      [opening, closing]
    );
    assert.equal(doc.slice(atoms[0].to, atoms[1].from), label);
    const mark = decorations.find(
      ({ value }) => value.spec.class === "link-compact-enabled"
    );
    assert.equal(doc.slice(mark.from, mark.to), opening + label + closing);
    assert.equal(decorations.filter(({ value }) => value.spec.widget).length, 1);
    const provided = view.state.facet(cm.EditorView.atomicRanges);
    assert.equal(provided.length, 1);
    assert.equal(provided[0](view), view.instance.atomicRanges);
    assert.equal(provided[0]({ plugin: () => null }), cm.Decoration.none);
    assert.equal(
      view.state.facet(cm.EditorView.decorations)[0](view),
      view.instance.decorations
    );
  });
}

test("リンク種別ごとに文字設定を使い分け、画像設定を優先する", () => {
  Object.assign(h.config, {
    linkEmoji: "🌐",
    notelinkEmoji: "📝",
    imglinkEmoji: "画像",
  });
  const view = h.compact(
    "[a](https://example.test) [b](inkdrop://note:1) ![c](inkdrop://image:1)"
  );
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.toDOM().innerText),
    ["🌐", "📝", "画像"]
  );
});

test("空設定の SVG は右上向きで元 URL とアクセシビリティ属性を保持する", () => {
  const view = h.compact("[a](url) [b](inkdrop://note:1) ![c](image)");
  for (const { value } of widgets(view)) {
    const widget = value.spec.widget;
    const node = widget.toDOM();
    assert.equal(node.className, "link-compact-mark");
    assert.equal(node.dataset.url, widget.url);
    assert.equal(node.children.length, 1);
    const svg = node.children[0];
    assert.equal(svg.tagName, "svg");
    assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
    assert.deepEqual(svg.attributes, {
      viewBox: "0 0 24 24",
      width: "1em",
      height: "1em",
      "aria-hidden": "true",
      focusable: "false",
    });
    assert.equal(svg.children.length, 1);
    const path = svg.children[0];
    assert.equal(path.tagName, "path");
    assert.equal(path.namespaceURI, svg.namespaceURI);
    assert.deepEqual(path.attributes, {
      fill: "none",
      stroke: "currentColor",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-width": "1.5",
      d: "M3.84 20.25 19.75 4.34M19.75 19.34v-15h-15",
    });
  }
});

test("文字設定は HTML として解釈せず、空白も明示した文字として保持する", () => {
  for (const text of [" ", "<img src=x>", "🔗"]) {
    h.config.linkEmoji = text;
    const widget = widgets(h.compact("[a](url)"))[0].value.spec.widget;
    const node = widget.toDOM();
    assert.equal(node.innerText, text);
    assert.equal(node.dataset.url, "url");
    assert.equal(node.children.length, 0);
  }
});

test("ウィジェット再利用は文字と URL の両方が同じ場合のみ", () => {
  const view = h.compact("[a](one)[b](one)[c](two)");
  const [a, b, c] = widgets(view).map(({ value }) => value.spec.widget);
  assert.equal(a.eq(b), true);
  assert.equal(a.eq(c), false);
  h.config.linkEmoji = "X";
  const d = widgets(h.compact("[a](one)"))[0].value.spec.widget;
  assert.equal(a.eq(d), false);
});

test("再短縮で最新設定を読み込み、元の文書は変えない", () => {
  const view = h.compact("[a](url)");
  h.config.linkEmoji = "new";
  assert.equal(h.extension.ensureLinkCompactExtension(view, true), false);
  assert.equal(view.instance, undefined);
  assert.equal(view.state.facet(cm.EditorView.atomicRanges).length, 0);
  assert.equal(view.state.facet(cm.keymap).length, 0);
  assert.equal(h.extension.ensureLinkCompactExtension(view, false), true);
  assert.equal(widgets(view)[0].value.spec.widget.emoji, "new");
  assert.equal(view.state.doc.toString(), "[a](url)");
});
