const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const {
  createHarness,
  widgets,
  EditorSelection,
  EditorState,
  StateEffect,
  cm,
} = require("./helpers/harness.cjs");

let h;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.destroy());

const doc = "x [abc](url) z";
// [ at 2, label at 3..6, ](url) at 6..12.
const moves = [
  ["右から開始括弧へ", 1, 2, 3],
  ["ラベルから左へ", 3, 2, 1],
  ["ラベル内部", 3, 4, 4],
  ["アイコン位置", 5, 6, 6],
  ["URL 内部を右へ", 6, 7, 12],
  ["URL 内部を左へ", 12, 11, 6],
  ["リンクの後へ", 12, 13, 13],
];
for (const vim of [false, true]) {
  for (const [name, from, to, expected] of moves) {
    test(`カーソル補正 (${vim ? "Vim" : "通常"}): ${name}`, () => {
      const view = h.compact(doc, { anchor: from, vim });
      view.dispatch({ selection: { anchor: to } });
      assert.equal(view.state.selection.main.head, expected);
      assert.equal(widgets(view).length, 1);
      assert.equal(view.state.doc.toString(), doc);
    });
  }
}

for (const [name, text, from, to, expected, vim] of [
  ["画像の ![ を右へ", "x ![a](u) z", 1, 2, 4, false],
  ["画像の ![ を左へ", "x ![a](u) z", 4, 3, 1, false],
  ["文書先頭", "[a](u)", 1, 0, 1, false],
  ["隣接リンクを右へ", "[a](u)[b](v)", 2, 3, 7, false],
  ["隣接リンクを左へ", "[a](u)[b](v)", 7, 6, 2, false],
  ["隣接画像を右へ", "![a](u)![b](v)", 3, 4, 9, false],
  ["空ラベル", "[](u)", 1, 2, 5, false],
  ["通常の行末", "[a](u)", 2, 3, 6, false],
  ["Vim の行末", "[a](u)", 2, 3, 2, true],
  ["Vim の中間行末", "[a](u)\nnext", 2, 3, 2, true],
  ["絵文字の直後を左へ", "😀[a](u)", 3, 2, 0, false],
  ["結合文字の直後を左へ", "é[a](u)", 3, 2, 0, false],
  ["改行直後を左へ", "x\n[a](u)", 3, 2, 1, false],
]) {
  test(`カーソル境界: ${name}`, () => {
    const view = h.compact(text, { anchor: from, vim });
    view.dispatch({ selection: { anchor: to } });
    assert.equal(view.state.selection.main.head, expected);
  });
}

test("複数カーソルを補正し主選択を保持する", () => {
  const view = h.compact("[a](u) [b](v)");
  view.dispatch({
    selection: EditorSelection.create(
      [EditorSelection.cursor(3), EditorSelection.cursor(10)],
      1
    ),
  });
  assert.deepEqual(
    view.state.selection.ranges.map((range) => range.head),
    [6, 13]
  );
  assert.equal(view.state.selection.mainIndex, 1);
});

test("前後方向の範囲選択は補正も展開もしない", () => {
  const view = h.compact(doc);
  for (const [anchor, head] of [
    [2, 10],
    [10, 2],
  ]) {
    view.dispatch({ selection: { anchor, head } });
    assert.equal(view.state.selection.main.anchor, anchor);
    assert.equal(view.state.selection.main.head, head);
    assert.equal(widgets(view).length, 1);
  }
});

test("IME composition と effect 付きの選択更新には干渉しない", () => {
  const view = h.compact(doc);
  view.composing = true;
  view.dispatch({ selection: { anchor: 8 } });
  assert.equal(view.state.selection.main.head, 8);
  view.composing = false;
  view.dispatch({
    selection: { anchor: 9 },
    effects: StateEffect.define().of(true),
  });
  assert.equal(view.state.selection.main.head, 9);
});

for (const [name, link] of [
  ["通常", "[abc](https://example.test)"],
  ["ノート", "[abc](inkdrop://note:1)"],
]) {
  for (const offset of [1, 2, 4]) {
    test(`Enter で ${name}リンクを開く: ラベル位置 ${offset}`, () => {
      const view = h.compact(link, { anchor: offset });
      assert.equal(view.key("Enter"), true);
      assert.deepEqual(h.openedUris, [link.slice(link.indexOf("](") + 2, -1)]);
      assert.equal(view.state.doc.toString(), link);
      assert.equal(widgets(view).length, 1);
      const enter = view.state
        .facet(cm.keymap)
        .flat()
        .find(({ key }) => key === "Enter");
      assert.equal(enter.stopPropagation, true);
    });
  }
}

test("画像の Enter は URL を開かず、記法を展開して ! の後ろへ移動する", () => {
  const text = "x ![alt](image) z";
  const view = h.compact(text, { anchor: 5 });
  assert.equal(view.key("Enter"), true);
  assert.equal(view.state.selection.main.head, 3);
  assert.equal(widgets(view).length, 0);
  assert.deepEqual(h.openedUris, []);
  assert.equal(view.state.doc.toString(), text);
  assert.equal(view.dispatches.at(-1).scrollIntoView, true);
  assert.equal(view.key("Enter"), false);
  view.dispatch({ selection: { anchor: text.length } });
  assert.equal(widgets(view).length, 1);
});

for (const [key, position] of [
  ["Backspace", 3],
  ["Backspace", 12],
  ["Delete", 6],
]) {
  test(`${key} は位置 ${position} の隠れた記法を削除する前に展開する`, () => {
    const view = h.compact(doc, { anchor: position });
    assert.equal(view.key(key), true);
    assert.equal(widgets(view).length, 0);
    assert.equal(view.state.selection.main.head, position);
    assert.equal(view.state.doc.toString(), doc);
    assert.equal(view.key(key), false);
  });
}

test("文書末尾の Backspace と画像ラベル先頭の Backspace でも展開する", () => {
  for (const [text, anchor] of [
    ["[a](u)", 6],
    ["![a](u)", 2],
  ]) {
    const view = h.compact(text, { anchor });
    assert.equal(view.key("Backspace"), true);
    assert.equal(widgets(view).length, 0);
    assert.equal(view.state.doc.toString(), text);
  }
});

for (const key of ["Enter", "Backspace", "Delete"]) {
  for (const mode of [
    "composition",
    "selection",
    "multiple",
    "outside",
    "missing plugin",
  ]) {
    test(`${key} は ${mode} の場合にキーを消費しない`, () => {
      const view = h.compact(doc, { anchor: key === "Delete" ? 6 : 3 });
      if (mode === "composition") view.composing = true;
      if (mode === "selection") view.dispatch({ selection: { anchor: 3, head: 5 } });
      if (mode === "multiple")
        view.dispatch({
          selection: EditorSelection.create([
            EditorSelection.cursor(3),
            EditorSelection.cursor(6),
          ]),
        });
      if (mode === "outside") view.dispatch({ selection: { anchor: 0 } });
      if (mode === "missing plugin") view.plugin = () => null;
      assert.equal(view.key(key), false);
      assert.deepEqual(h.openedUris, []);
      assert.equal(view.state.doc.toString(), doc);
    });
  }
}

for (const position of [3, 4, 6, 8]) {
  test(`リンク位置 ${position} への文字入力で記法を展開する`, () => {
    const view = h.compact(doc);
    view.dispatch({
      changes: { from: position, insert: "X" },
      selection: { anchor: position + 1 },
    });
    assert.equal(
      view.state.doc.toString(),
      doc.slice(0, position) + "X" + doc.slice(position)
    );
    assert.equal(widgets(view).length, 0);
    view.dispatch({ selection: { anchor: 4 } });
    assert.equal(widgets(view).length, 0);
    view.dispatch({ selection: { anchor: 0 } });
    assert.equal(widgets(view).length, 1);
  });
}

test("リンク以外の編集・端点への挿入は短縮を維持する", () => {
  for (const from of [0, 2, 12, doc.length]) {
    const view = h.compact(doc);
    view.dispatch({
      changes: { from, insert: "X" },
      selection: { anchor: from + 1 },
    });
    assert.equal(widgets(view).length, 1);
  }
});

test("選択外で変更したリンクは展開しない", () => {
  const view = h.compact(doc);
  view.dispatch({ changes: { from: 4, insert: "X" }, selection: { anchor: 0 } });
  assert.equal(widgets(view).length, 1);
});

test("展開済みリンクは別の場所の編集で位置がずれても編集中なら展開を保つ", () => {
  const view = h.compact(doc, { anchor: 3 });
  view.key("Backspace");
  view.dispatch({ changes: { from: 0, insert: "prefix " } });
  assert.equal(widgets(view).length, 0);
  assert.equal(view.state.selection.main.head, 10);
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  assert.equal(widgets(view).length, 1);
});

test("未完了リンクの完成・URL 更新・記法の破壊に追従する", () => {
  const view = h.compact("[a](url");
  assert.equal(widgets(view).length, 0);
  view.dispatch({ changes: { from: 7, insert: ")" }, selection: { anchor: 0 } });
  assert.equal(widgets(view)[0].value.spec.widget.url, "url");
  view.dispatch({
    changes: { from: 4, to: 7, insert: "new" },
    selection: { anchor: 0 },
  });
  assert.equal(widgets(view)[0].value.spec.widget.url, "new");
  view.dispatch({ changes: { from: 7, to: 8 }, selection: { anchor: 0 } });
  assert.equal(widgets(view).length, 0);
});

test("複数リンクのうち編集したリンクだけ展開する", () => {
  const view = h.compact("[abc](one) [def](two)");
  view.dispatch({ changes: { from: 2, insert: "X" }, selection: { anchor: 3 } });
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.url),
    ["two"]
  );
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.url),
    ["one", "two"]
  );
});

test("範囲置換と複数箇所の編集も選択中のリンクだけ展開する", () => {
  const view = h.compact("[abc](one) [def](two)");
  view.dispatch({
    changes: [
      { from: 1, to: 4, insert: "ABC" },
      { from: 12, to: 15, insert: "DEF" },
    ],
    selection: EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(13),
    ]),
  });
  assert.equal(widgets(view).length, 0);
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  assert.equal(widgets(view).length, 2);
});

test("展開中のリンクに重なる範囲選択は維持し、外側に触れるだけなら再短縮する", () => {
  const view = h.compact(doc, { anchor: 3 });
  view.key("Backspace");
  view.dispatch({ selection: { anchor: 1, head: 4 } });
  assert.equal(widgets(view).length, 0);
  view.dispatch({ selection: { anchor: 0, head: 2 } });
  assert.equal(widgets(view).length, 1);
});

test("h / l は入力用に残し、通常文字入力として文書へ反映できる", () => {
  const view = h.compact(doc, { vim: true });
  for (const key of ["h", "l"]) {
    assert.equal(view.key(key), false);
    view.dispatch({ changes: { from: 0, insert: key } });
  }
  assert.equal(view.state.doc.toString(), "lh" + doc);
  assert.equal(widgets(view).length, 1);
});

test("選択なし・古い状態・プラグイン不在のトランザクションは補正しない", () => {
  const view = h.compact(doc);
  const filter = view.state.facet(EditorState.transactionFilter)[0];
  const withoutSelection = view.state.update({});
  assert.equal(filter(withoutSelection), withoutSelection);
  const stale = view.state.update({ selection: { anchor: 8 }, filter: false });
  view.dispatch({ selection: { anchor: 1 } });
  assert.equal(filter(stale), stale);
  view.plugin = () => null;
  view.dispatch({ selection: { anchor: 8 } });
  assert.equal(view.state.selection.main.head, 8);
});

test("短縮解除中は記法内部の選択とキーを制御しない", () => {
  const view = h.compact(doc);
  h.extension.ensureLinkCompactExtension(view, true);
  view.dispatch({ selection: { anchor: 8 } });
  assert.equal(view.state.selection.main.head, 8);
  for (const key of ["Enter", "Backspace", "Delete"])
    assert.equal(view.key(key), false);
  assert.equal(view.state.doc.toString(), doc);
});
