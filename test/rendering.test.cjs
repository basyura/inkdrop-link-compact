const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { createHarness, ranges, widgets, cm } = require("./helpers/harness.cjs");

let h;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.destroy());

const cases = [
  ["通常リンク", "x [label](https://example.test/a) z", ["https://example.test/a"]],
  ["ノートリンク", "[note](inkdrop://note:123)", ["inkdrop://note:123"]],
  ["画像リンク", "![alt](http://image.png)", ["http://image.png"]],
  ["相対 URL とアンカー", "[a](../a.md) [b](#section)", []],
  [
    "括弧を含む URL",
    "[a](https://example.test/a(b(c)))",
    ["https://example.test/a(b(c))"],
  ],
  ["空ラベル", "[](http://url)![](http://image)", ["http://url", "http://image"]],
  ["隣接リンク", "[a](http://one)[b](http://two)![c](http://three)", ["http://one", "http://two", "http://three"]],
  ["入れ子のラベル", "[outer [inner] text](http://url)", ["http://url"]],
  ["複数行のラベル", "[first\nsecond](http://url)", ["http://url"]],
  ["日本語・結合文字・絵文字", "[日本語é👩‍💻](https://日本語/😀)", ["https://日本語/😀"]],
  ["エスケープされたラベル内括弧", String.raw`[a \] b \[ c](http://url)`, ["http://url"]],
  ["偶数個のバックスラッシュ", String.raw`\\[a](http://url)`, ["http://url"]],
  ["エスケープされた開始括弧", String.raw`\[a](http://url)`, []],
  ["エスケープされた閉じ括弧", String.raw`[a\](http://url)`, []],
  ["開始括弧なし", "a](http://url)", []],
  ["空 URL", "[a]()", []],
  ["未完了 URL", "[a](http://url", []],
  ["閉じていない入れ子", "[a](http://url(inner)", []],
  ["URL 内の改行", "[a](http://one\ntwo)", []],
  ["URL 内の CR", "[a](http://one\rtwo)", []],
  ["URL 内の CRLF", "[a](http://one\r\ntwo)", []],
  ["改行後の正常リンク", "[bad](http://one\n[good](http://two)", ["http://two"]],
  ["不正な括弧の後の正常リンク", "] [good](http://url)", ["http://url"]],
  [
    "参照リンクと裸の URL",
    "[a][ref] <https://example.test> https://example.test",
    [],
  ],
  ["空文書", "", []],
  ["行内コード", "`[a](http://one)` [b](http://two)", ["http://two"]],
  ["複数バッククォートの行内コード", "``[a](http://one)`x`` [b](http://two)", ["http://two"]],
  ["複数行の行内コード", "`[a](http://one)\n[b](http://two)` [c](http://three)", ["http://three"]],
  ["フェンス付きコードブロック", "[a](http://one)\n```js\n[b](http://two)\n```\n[c](http://three)", ["http://one", "http://three"]],
  ["長いフェンス", "````\n[a](http://one)\n```\n[b](http://two)\n````\n[c](http://three)", ["http://three"]],
  ["字下げしたフェンス", "  ```\n[a](http://one)\n  ```\n[b](http://two)", ["http://two"]],
  ["閉じていないフェンス", "[a](http://one)\n```\n[b](http://two)", ["http://one"]],
  ["4 文字の字下げはフェンスではない", "    ```\n[a](http://one)", ["http://one"]],
  ["コード内の括弧は後続リンクに影響しない", "`[x` [a](http://one)", ["http://one"]],
  ["コード領域にまたがる記法は対象外", "[a]`x`(http://one) [b](http://two)", ["http://two"]],
  ["タイトル部分も URL として保持", '[a](http://url "title")', ['http://url "title"']],
];

for (const isImage of [false, true]) {
  for (const [url, valid] of [
    ["a", false],
    ["", false],
    ["../image.png", false],
    ["#section", false],
    ["mailto:a@example.test", false],
    ["ftp://a", false],
    ["http://", false],
    ["https://", false],
    ["http://a", true],
    ["https://a", true],
    ["https://😀", true],
    ["xhttps://a", false],
    [" https://a", false],
    ["HTTP://a", false],
    ["inkdrop://file:", !isImage],
    ["inkdrop://file:a", true],
    ["inkdrop://note:1", !isImage],
    ["inkdrop://image:1", !isImage],
  ]) {
    const doc = `${isImage ? "!" : ""}[link-compact](${url})`;
    cases.push([`URL 条件: ${doc}`, doc, valid ? [url] : []]);
  }
}

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
    if (urls.length === 0) {
      assert.deepEqual(ranges(view.instance.decorations), []);
      assert.deepEqual(ranges(view.instance.atomicRanges), []);
    }
  });
}

test("対象外の記法があっても後続の有効な通常・画像リンクを短縮する", () => {
  const view = h.compact(
    "[bad](a) ![bad](inkdrop://note:1) [good](https://a) ![good](inkdrop://file:a)"
  );
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.url),
    ["https://a", "inkdrop://file:a"]
  );
});

for (const [opening, prefix] of [
  ["[a](", "http://"],
  ["[a](", "https://"],
  ["![a](", "http://"],
  ["![a](", "https://"],
  ["![a](", "inkdrop://file:"],
]) {
  test(`後続文字の追加・削除で短縮を再判定する: ${opening}${prefix}`, () => {
    const doc = opening + prefix + ")";
    const view = h.compact(doc);
    const from = doc.length - 1;
    assert.equal(widgets(view).length, 0);
    view.dispatch({ changes: { from, insert: "a" }, selection: { anchor: 0 } });
    assert.equal(widgets(view)[0].value.spec.widget.url, prefix + "a");
    view.dispatch({ changes: { from, to: from + 1 }, selection: { anchor: 0 } });
    assert.equal(widgets(view).length, 0);
    assert.deepEqual(ranges(view.instance.atomicRanges), []);
    assert.equal(view.state.doc.toString(), doc);
  });
}

test("コードフェンスを編集するとリンクの短縮を再判定する", () => {
  const doc = "```\n[a](http://one)\n```\n[b](http://two)";
  const view = h.compact(doc);
  assert.deepEqual(widgets(view).map(({ value }) => value.spec.widget.url), ["http://two"]);
  const closing = doc.indexOf("```", 3);
  view.dispatch({
    changes: [
      { from: 0, to: 3, insert: "---" },
      { from: closing, to: closing + 3, insert: "---" },
    ],
  });
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.url),
    ["http://one", "http://two"]
  );
});

for (const [doc, opening, label, closing] of [
  ["x [label](http://url) z", "[", "label", "](http://url)"],
  ["x ![alt](http://image) z", "![", "alt", "](http://image)"],
  ["[outer [inner]](http://url)", "[", "outer [inner]", "](http://url)"],
  ["[](http://url)", "[", "", "](http://url)"],
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
    "[a](https://example.test) [b](inkdrop://note:1) ![c](inkdrop://file:1)"
  );
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.toDOM().innerText),
    ["🌐", "📝", "画像"]
  );
});

test("空設定の SVG は右上向きで元 URL とアクセシビリティ属性を保持する", () => {
  const view = h.compact("[a](http://url) [b](inkdrop://note:1) ![c](http://image)");
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
      viewBox: "0 0 24 21",
      width: "0.8em",
      height: "0.7em",
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

test("SVG の描画領域は丸い線端まで収め、下余白と縦横比の歪みをなくす", () => {
  const svg = widgets(h.compact("[a](http://url)"))[0].value.spec.widget.toDOM().children[0];
  const [x, y, width, height] = svg.attributes.viewBox.split(" ").map(Number);
  const path = svg.children[0];
  const points = path.attributes.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const [startX, startY, endX, endY, headX, headY, vertical, horizontal] = points;
  const radius = Number(path.attributes["stroke-width"]) / 2;
  const xs = [startX, endX, headX, headX + horizontal];
  const ys = [startY, endY, headY, headY + vertical];
  assert.ok(Math.min(...xs) - radius >= x);
  assert.ok(Math.max(...xs) + radius <= x + width);
  assert.ok(Math.min(...ys) - radius >= y);
  assert.equal(Math.max(...ys) + radius, y + height);
  assert.ok(Math.abs(parseFloat(svg.attributes.width) / parseFloat(svg.attributes.height) - width / height) < 1e-12);
});

test("文字と SVG はともに 80% に縮小し、SVG の親はタイトルの文字サイズを継承する", () => {
  const css = readFileSync(path.resolve(__dirname, "../styles/link-compact.css"), "utf8");
  const textRule = css.match(/\.link-compact-mark\s*\{([^}]+)\}/);
  const svgRule = css.match(/\.link-compact-mark:has\(> svg\)\s*\{([^}]+)\}/);
  assert.ok(textRule);
  assert.ok(svgRule);
  assert.match(textRule[1], /font-size:\s*80%\s*;/);
  assert.match(svgRule[1], /font-size:\s*inherit\s*;/);
  const dimensions = css.match(/\.link-compact-mark\s*>\s*svg\s*\{([^}]+)\}/);
  assert.ok(dimensions);
  assert.match(dimensions[1], /width:\s*0\.8em\s*;/);
  assert.match(dimensions[1], /height:\s*0\.7em\s*;/);
});

test("SVG の下端は下降部を含む文字領域ではなくベースラインに揃える", () => {
  const css = readFileSync(path.resolve(__dirname, "../styles/link-compact.css"), "utf8");
  const rule = css.match(/\.link-compact-mark\s*>\s*svg\s*\{([^}]+)\}/);
  assert.ok(rule);
  assert.match(rule[1], /vertical-align:\s*baseline\s*;/);
  assert.doesNotMatch(rule[1], /(?:transform|translate|top|bottom|margin-top|margin-bottom|position)\s*:/);
});

test("文字設定は HTML として解釈せず、空白も明示した文字として保持する", () => {
  for (const text of [" ", "<img src=x>", "🔗"]) {
    h.config.linkEmoji = text;
    const widget = widgets(h.compact("[a](http://url)"))[0].value.spec.widget;
    const node = widget.toDOM();
    assert.equal(node.innerText, text);
    assert.equal(node.dataset.url, "http://url");
    assert.equal(node.children.length, 0);
  }
});

test("ウィジェット再利用は文字と URL の両方が同じ場合のみ", () => {
  const view = h.compact("[a](http://one)[b](http://one)[c](http://two)");
  const [a, b, c] = widgets(view).map(({ value }) => value.spec.widget);
  assert.equal(a.eq(b), true);
  assert.equal(a.eq(c), false);
  h.config.linkEmoji = "X";
  const d = widgets(h.compact("[a](http://one)"))[0].value.spec.widget;
  assert.equal(a.eq(d), false);
});

test("再短縮で最新設定を読み込み、元の文書は変えない", () => {
  const view = h.compact("[a](http://url)");
  h.config.linkEmoji = "new";
  assert.equal(h.extension.ensureLinkCompactExtension(view, true), false);
  assert.equal(view.instance, undefined);
  assert.equal(view.state.facet(cm.EditorView.atomicRanges).length, 0);
  assert.equal(view.state.facet(cm.keymap).length, 0);
  assert.equal(h.extension.ensureLinkCompactExtension(view, false), true);
  assert.equal(widgets(view)[0].value.spec.widget.emoji, "new");
  assert.equal(view.state.doc.toString(), "[a](http://url)");
});
