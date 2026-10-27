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

const doc = "x [abc](http://url) z";
// [ at 2, label at 3..6, ](http://url) at 6..19.
const moves = [
  ["右から開始括弧へ", 1, 2, 3],
  ["ラベルから左へ", 3, 2, 1],
  ["ラベル内部", 3, 4, 4],
  ["アイコン位置", 5, 6, 6],
  ["URL 内部を右へ", 6, 7, 19],
  ["URL 内部を左へ", 19, 18, 6],
  ["リンクの後へ", 19, 20, 20],
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

for (const [name, from, to, expected] of [
  ["l で URL を越える", 6, 7, 19],
  ["h で URL を越える", 19, 18, 6],
  ["h で開始括弧を越える", 3, 2, 1],
]) {
  test(`他プラグインの移動補正後も短縮範囲を越える: ${name}`, () => {
    const view = h.createView(doc, { anchor: from, vim: true });
    let pendingMotion = false;
    // hide-markup computes a motion before Vim handles the key, then applies
    // that position in its transaction filter, even if another filter moved it.
    view.dispatch({
      effects: StateEffect.appendConfig.of(
        EditorState.transactionFilter.of((transaction) =>
          pendingMotion && transaction.selection && !transaction.docChanged
            ? [transaction, { selection: { anchor: to } }]
            : transaction
        )
      ),
    });
    h.extension.ensureLinkCompactExtension(view, false);
    pendingMotion = true;
    view.dispatch({ selection: { anchor: to } });
    assert.equal(view.state.selection.main.head, expected);
    assert.equal(widgets(view).length, 1);
    assert.equal(view.state.doc.toString(), doc);
  });
}

for (const [name, text, from, to, expected, vim] of [
  ["画像の ![ を右へ", "x ![a](http://u) z", 1, 2, 4, false],
  ["画像の ![ を左へ", "x ![a](http://u) z", 4, 3, 1, false],
  ["文書先頭", "[a](http://u)", 1, 0, 1, false],
  ["隣接リンクを右へ", "[a](http://u)[b](http://v)", 2, 3, 14, false],
  ["隣接リンクを左へ", "[a](http://u)[b](http://v)", 14, 13, 2, false],
  ["隣接画像を右へ", "![a](http://u)![b](http://v)", 3, 4, 16, false],
  ["空ラベル", "[](http://u)", 1, 2, 12, false],
  ["通常の行末", "[a](http://u)", 2, 3, 13, false],
  ["Vim の行末", "[a](http://u)", 2, 3, 2, true],
  ["Vim の中間行末", "[a](http://u)\nnext", 2, 3, 2, true],
  ["絵文字の直後を左へ", "😀[a](http://u)", 3, 2, 0, false],
  ["結合文字の直後を左へ", "é[a](http://u)", 3, 2, 0, false],
  ["改行直後を左へ", "x\n[a](http://u)", 3, 2, 1, false],
]) {
  test(`カーソル境界: ${name}`, () => {
    const view = h.compact(text, { anchor: from, vim });
    view.dispatch({ selection: { anchor: to } });
    assert.equal(view.state.selection.main.head, expected);
  });
}

test("複数カーソルを補正し主選択を保持する", () => {
  const view = h.compact("[a](http://u) [b](http://v)");
  view.dispatch({
    selection: EditorSelection.create(
      [EditorSelection.cursor(3), EditorSelection.cursor(17)],
      1
    ),
  });
  assert.deepEqual(
    view.state.selection.ranges.map((range) => range.head),
    [13, 27]
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
  const text = "x ![alt](http://image) z";
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
  ["Backspace", 19],
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
    ["[a](http://u)", 13],
    ["![a](http://u)", 2],
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

for (const position of [3, 4, 6, 15]) {
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
  for (const from of [0, 2, 19, doc.length]) {
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
  const view = h.compact("[a](http://url");
  assert.equal(widgets(view).length, 0);
  view.dispatch({ changes: { from: 14, insert: ")" }, selection: { anchor: 0 } });
  assert.equal(widgets(view)[0].value.spec.widget.url, "http://url");
  view.dispatch({
    changes: { from: 4, to: 14, insert: "http://new" },
    selection: { anchor: 0 },
  });
  assert.equal(widgets(view)[0].value.spec.widget.url, "http://new");
  view.dispatch({ changes: { from: 14, to: 15 }, selection: { anchor: 0 } });
  assert.equal(widgets(view).length, 0);
});

test("複数リンクのうち編集したリンクだけ展開する", () => {
  const view = h.compact("[abc](http://one) [def](http://two)");
  view.dispatch({ changes: { from: 2, insert: "X" }, selection: { anchor: 3 } });
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.url),
    ["http://two"]
  );
  view.dispatch({ selection: { anchor: view.state.doc.length } });
  assert.deepEqual(
    widgets(view).map(({ value }) => value.spec.widget.url),
    ["http://one", "http://two"]
  );
});

test("範囲置換と複数箇所の編集も選択中のリンクだけ展開する", () => {
  const view = h.compact("[abc](http://one) [def](http://two)");
  view.dispatch({
    changes: [
      { from: 1, to: 4, insert: "ABC" },
      { from: 19, to: 22, insert: "DEF" },
    ],
    selection: EditorSelection.create([
      EditorSelection.cursor(2),
      EditorSelection.cursor(20),
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

for (const [key, text, startLine, expected] of [
  ["o", "[a](http://url)", 1, "[a](http://url)\n"],
  ["O", "[a](http://url)\nnext", 1, "[a](http://url)\n\nnext"],
  ["o", "[a](inkdrop://note:1)", 1, "[a](inkdrop://note:1)\n"],
  ["o", "![a](http://image.png)", 1, "![a](http://image.png)\n"],
]) {
  test(`Vim ${key} は短縮リンクを分割せず行を追加する: ${text}`, () => {
    const view = h.compact(text, {
      anchor: key === "O" ? text.indexOf("next") : text.indexOf("a"),
      vim: true,
    });
    view.keydown(key);
    const line = view.state.doc.line(startLine);
    view.dispatch({ selection: { anchor: line.to } });
    assert.equal(view.state.selection.main.head, line.to);
    view.dispatch({
      changes: { from: line.to, insert: "\n" },
      selection: { anchor: line.to + 1 },
    });
    assert.equal(view.state.doc.toString(), expected);
    assert.equal(view.state.selection.main.head, line.to + 1);
    assert.equal(widgets(view).length, 1);
    const labelEnd = text.startsWith("!") ? 3 : 2;
    view.dispatch({ selection: { anchor: labelEnd } });
    view.dispatch({ selection: { anchor: line.to } });
    assert.equal(view.state.selection.main.head, labelEnd);
  });
}

test("Vim の通常移動と他モードでは行末の選択補正を維持する", () => {
  for (const mode of ["l", "insert", "visual", "replace", "modifier"]) {
    const view = h.compact("[a](http://url)", { anchor: 2, vim: true });
    if (mode === "insert") {
      view.dom.classList.remove("vim-mode-normal");
      view.dom.classList.add("vim-mode-insert");
      view.scrollDOM.classList.remove("cm-vimMode");
      view.keydown("o");
    } else if (mode === "visual" || mode === "replace") {
      view.dom.classList.remove("vim-mode-normal");
      view.dom.classList.add(`vim-mode-${mode}`);
      view.keydown("o");
    } else if (mode === "modifier") {
      view.keydown("o", { ctrlKey: true });
    } else {
      view.keydown("l");
    }
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    assert.equal(view.state.selection.main.head, mode === "insert" ? 15 : 2);
  }
});

for (const key of ["o", "O"]) {
  test(`ノート切り替え直後の初回 ${key} は行末の短縮リンクを分割しない`, () => {
    const first = (h.env.activeEditor = h.createView("before"));
    const controller = new h.Controller();
    controller.activate();
    const view = (h.env.activeEditor = h.createView("[a](http://url)\nnext", {
      anchor: key === "O" ? 16 : 1,
      vim: true,
    }));
    view.dom.classList.remove("vim-mode-normal");
    h.env.editingNote = { _id: "note:next" };
    controller.observer.fire();
    assert.equal(widgets(view).length, 1);
    view.keydown(key);
    view.dispatch({ selection: { anchor: 15 } });
    assert.equal(view.state.selection.main.head, 15);
    view.dispatch({
      changes: { from: 15, insert: "\n" },
      selection: { anchor: 16 },
    });
    assert.equal(view.state.doc.toString(), "[a](http://url)\n\nnext");
    assert.equal(widgets(view).length, 1);
    assert.equal(first.state.doc.toString(), "before");
    controller.deactivate();
  });
}

for (const [name, text, from, inserted, expected] of [
  ["通常リンク", "[a](http://url)", 2, "\n", "[a](http://url)\n"],
  ["URL の内部", "[a](http://url)", 5, "\n", "[a](http://url)\n"],
  ["ノートリンク", "[a](inkdrop://note:1)", 2, "\n", "[a](inkdrop://note:1)\n"],
  ["画像リンク", "![a](http://image.png)", 3, "\n", "![a](http://image.png)\n"],
  ["インデント", "[a](http://url)", 2, "\n  ", "[a](http://url)\n  "],
]) {
  test(`初回キーの判定が間に合わなくても ${name} の改行を行末へ移す`, () => {
    const view = h.compact(text, { anchor: 2, vim: true });
    view.dom.classList.remove("vim-mode-normal");
    view.dispatch({
      changes: { from, insert: inserted },
      selection: { anchor: from + inserted.length },
      userEvent: "input",
    });
    assert.equal(view.state.doc.toString(), expected);
    assert.equal(view.state.selection.main.head, text.length + inserted.length);
    assert.equal(widgets(view).length, 1);
  });
}

test("挿入モードと Vim 以外の改行はリンク編集中として扱う", () => {
  for (const vim of [true, false]) {
    const view = h.compact("[a](http://url)", { anchor: 2, vim });
    if (vim) view.scrollDOM.classList.remove("cm-vimMode");
    view.dispatch({
      changes: { from: 2, insert: "\n" },
      selection: { anchor: 3 },
      userEvent: "input",
    });
    assert.equal(view.state.doc.toString(), "[a\n](http://url)");
  }
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

for (const text of ["[label](http://url)", "[label](inkdrop://note:1)", "![label](http://image.png)", "prefix [label](http://url)"]) {
  test(`Vim i はラベル先頭からリンクの前へ挿入する: ${text}`, () => {
    const start = text.startsWith("!") ? 0 : text.indexOf("[");
    const view = h.compact(text, { anchor: text.indexOf("[") + 1, vim: true });
    view.dom.classList.remove("vim-mode-normal");
    view.keydown("i");
    assert.equal(view.state.selection.main.head, start);
    view.scrollDOM.classList.remove("cm-vimMode");
    view.dom.classList.add("vim-mode-insert");
    view.dispatch({ selection: { anchor: start } });
    assert.equal(view.state.selection.main.head, start);
    view.keydown("X");
    view.dispatch({ changes: { from: start, insert: "X" }, selection: { anchor: start + 1 } });
    assert.equal(view.state.doc.toString(), text.slice(0, start) + "X" + text.slice(start));
    assert.equal(widgets(view).length, 1);
  });
}

for (const mode of ["plain", "insert", "visual", "replace", "modifier", "composition", "middle", "selection", "multiple", "expanded", "other key"]) {
  test(`Vim i の補正は ${mode} には適用しない`, () => {
    const view = h.compact("[label](http://url)", { anchor: 1, vim: mode !== "plain" });
    if (["insert", "visual", "replace"].includes(mode)) view.dom.classList.add(`vim-mode-${mode}`);
    if (mode === "composition") view.composing = true;
    if (mode === "middle") view.dispatch({ selection: { anchor: 2 } });
    if (mode === "selection") view.dispatch({ selection: { anchor: 1, head: 3 } });
    if (mode === "multiple") view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(1), EditorSelection.cursor(3)]) });
    if (mode === "expanded") view.key("Backspace");
    const before = view.state.selection;
    view.keydown(mode === "other key" ? "a" : "i", mode === "modifier" ? { ctrlKey: true } : {});
    assert.equal(view.state.selection, before);
  });
}

test("Vim i の補正は次のキーで解除され、通常移動へ影響しない", () => {
  const view = h.compact("[label](http://url)", { anchor: 1, vim: true });
  view.keydown("i");
  assert.equal(view.state.selection.main.head, 0);
  view.keydown("Escape");
  view.dispatch({ selection: { anchor: 1 } });
  view.dispatch({ selection: { anchor: 0 } });
  assert.equal(view.state.selection.main.head, 1);
});

test("短縮解除中の Vim i はカーソル位置を変えない", () => {
  const view = h.compact("[label](http://url)", { anchor: 1, vim: true });
  h.extension.ensureLinkCompactExtension(view, true);
  view.keydown("i");
  assert.equal(view.state.selection.main.head, 1);
});

function visualView(text, anchor, head = anchor, mode = {}) {
  const view = h.compact(text, { anchor: head, vim: true });
  view.dom.classList.add('vim-mode-visual');
  const pos = (offset) => {
    const line = view.state.doc.lineAt(offset);
    return { line: line.number - 1, ch: offset - line.from };
  };
  view.cm = {
    state: { vim: { visualMode: true, ...mode, sel: { anchor: pos(anchor), head: pos(head) } } },
    curOp: { isVimOp: true },
  };
  const move = (target) => {
    view.cm.state.vim.sel.head = pos(target);
    view.dispatch({ selection: {
      anchor: anchor + (target < anchor ? 1 : 0),
      head: Math.min(text.length, target + (target >= anchor ? 1 : 0)),
    } });
    const actual = view.cm.state.vim.sel.head;
    return view.state.doc.line(actual.line + 1).from + actual.ch;
  };
  move(head);
  return { view, move };
}

for (const link of ['[abc](http://url)', '[abc](inkdrop://note)', '![abc](http://url)']) {
  for (const reverse of [false, true]) {
    test(`Visual の左右移動と内部位置同期: ${link}, reverse=${reverse}`, () => {
      const text = `x ${link} z`;
      const label = text.indexOf('[') + 1;
      const icon = text.indexOf(']');
      const end = text.indexOf(')') + 1;
      const anchor = reverse ? text.length - 1 : 0;
      const { view, move } = visualView(text, anchor, icon);
      assert.equal(move(icon + 1), end);
      assert.equal(move(end - 1), icon);
      assert.equal(move(label - 1), 1);
      assert.equal(move(2), label);
      assert.equal(view.state.selection.main.anchor, anchor + (reverse ? 1 : 0));
      assert.equal(view.state.doc.toString(), text);
      assert.equal(widgets(view).length, 1);
    });
  }
}

for (const [text, start, target, expected] of [
  ['[a](http://u)', 2, 3, 2],
  ['[a](http://u)\nnext', 2, 3, 2],
  ['[a](http://u)[b](http://v)', 2, 3, 14],
  ['[a](http://u)[b](http://v)', 14, 13, 2],
  ['😀[a](http://u) z', 3, 2, 0],
]) {
  test(`Visual の境界: ${JSON.stringify(text)}, ${start} -> ${target}`, () => {
    const { move } = visualView(text, 0, start);
    assert.equal(move(target), expected);
  });
}

for (const mode of [{ visualLine: true }, { visualBlock: true }]) {
  test(`Visual の行・矩形選択を変更しない: ${JSON.stringify(mode)}`, () => {
    const { view, move } = visualView(doc, 0, 6, mode);
    assert.equal(move(7), 7);
    assert.equal(view.state.selection.main.head, 8);
  });
}

test('Visual のマウス選択・IME・エフェクト付き更新には干渉しない', () => {
  const { view } = visualView(doc, 0, 6);
  for (const kind of ['mouse', 'composition', 'effect']) {
    view.cm.curOp.isVimOp = kind !== 'mouse';
    view.composing = kind === 'composition';
    view.dispatch({ selection: { anchor: 0, head: 8 },
      effects: kind === 'effect' ? StateEffect.define().of(true) : [] });
    assert.equal(view.state.selection.main.head, 8);
  }
});

test('Visual の選択開始位置を跨ぐ補正で選択方向を維持する', () => {
  const { view, move } = visualView(doc, 3);
  assert.equal(move(2), 1);
  assert.equal(view.state.selection.main.anchor, 4);
  assert.equal(view.state.selection.main.head, 1);
  assert.equal(move(2), 3);
  assert.equal(view.state.selection.main.anchor, 3);
  assert.equal(view.state.selection.main.head, 4);
});

test('Visual の編集中リンクと短縮解除には補正しない', () => {
  const { view, move } = visualView(doc, 0, 6);
  view.instance.editingRanges = new Set(view.instance.ranges);
  assert.equal(move(7), 7);
  h.extension.ensureLinkCompactExtension(view, true);
  assert.equal(move(8), 8);
});

test('Visual の補正はトランザクション確定前に Vim 内部状態を変更しない', () => {
  const { view } = visualView(doc, 0, 6);
  view.cm.state.vim.sel.head = { line: 0, ch: 7 };
  const transaction = view.state.update({ selection: { anchor: 0, head: 8 } });
  assert.equal(transaction.newSelection.main.head, 20);
  assert.equal(view.cm.state.vim.sel.head.ch, 7);
});

for (const link of ['[google](https://google.com)', '[google](inkdrop://note)', '![google](https://google.com)']) {
  for (const suffix of ['', ' ']) {
    for (const reverse of [false, true]) {
      test(`Visual の全文選択は元の Markdown を含む: ${link}, suffix=${JSON.stringify(suffix)}, reverse=${reverse}`, () => {
        const text = link + suffix;
        const label = text.indexOf('[') + 1;
        const icon = text.indexOf(']');
        const end = suffix ? text.length - 1 : icon;
        const anchor = reverse ? end : label;
        const { view, move } = visualView(text, anchor);
        move(reverse ? label : end);
        const selected = view.state.selection.main;
        assert.equal(view.state.sliceDoc(selected.from, selected.to), text);
        assert.equal(view.instance.visualHead, reverse ? label : end);
        // Vim normalizes its selection before reading it for an operator.
        view.dispatch({ selection: { anchor: label, head: end + 1 } });
        const yank = view.state.selection.main;
        assert.equal(view.state.sliceDoc(yank.from, yank.to), text);
        assert.equal(view.state.doc.toString(), text);
      });
    }
  }
}

for (const [start, end, expected] of [
  [1, 6, 'google'],
  [2, 4, 'oog'],
  [3, 7, 'ogle](https://google.com)'],
  [7, 7, '](https://google.com)'],
]) {
  test(`Visual の部分選択: ${start}..${end}`, () => {
    const text = '[google](https://google.com)';
    const { view, move } = visualView(text, start);
    move(end);
    const selection = view.state.selection.main;
    assert.equal(view.state.sliceDoc(selection.from, selection.to), expected);
  });
}

test('Visual の元記法を含めた選択後も左右移動を続けられる', () => {
  const text = '[google](https://google.com) z';
  const icon = text.indexOf(']');
  const end = text.indexOf(')') + 1;
  const { view, move } = visualView(text, 1, icon);
  assert.equal(view.state.selection.main.from, 0);
  assert.equal(view.state.selection.main.to, end);
  assert.equal(move(icon + 1), end);
  assert.equal(move(end - 1), icon);
  assert.equal(move(icon - 1), icon - 1);
  assert.equal(view.state.selection.main.from, 1);
  assert.equal(view.state.selection.main.to, icon);
});

test('Visual の隣接リンクは両方の元記法を選択する', () => {
  const text = '[a](http://u)![b](http://v)';
  const { view, move } = visualView(text, 1);
  move(text.lastIndexOf(']'));
  assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), text);
});

test('Visual の行単位演算で Vim が指定した改行までの範囲を保持する', () => {
  const text = 'prefix [google](https://google.com) suffix\nnext';
  const { view } = visualView(text, 9, 10);
  const lineEnd = text.indexOf('\n') + 1;
  view.dispatch({ selection: { anchor: 0, head: lineEnd } });
  assert.equal(view.state.selection.main.from, 0);
  assert.equal(view.state.selection.main.to, lineEnd);
});

function deleteVisualSelection(view, operator = 'change') {
  const selected = view.state.selection.main;
  const oldDoc = view.state.doc;
  const vim = view.cm.state.vim;
  const offset = (pos) => oldDoc.line(pos.line + 1).from + pos.ch;
  const logicalFrom = Math.min(offset(vim.sel.anchor), offset(vim.sel.head));
  const oldLine = oldDoc.lineAt(logicalFrom);
  vim.lastEditInputState = { operator };
  view.dispatch({ changes: { from: selected.from, to: selected.to },
    selection: { anchor: selected.from } });
  vim.insertMode = true;
  const newLine = view.state.doc.lineAt(selected.from);
  return newLine.from + Math.min(logicalFrom - oldLine.from, newLine.length);
}

for (const link of ['[abc](http://url)', '[abc](inkdrop://note)', '![abc](http://url)']) {
  for (const prefix of ['', 'prefix ', 'first\n']) {
    for (const reverse of [false, true]) {
      test(`Visual c の挿入先は元記法の先頭: ${link}, ${JSON.stringify(prefix)}, reverse=${reverse}`, () => {
        const text = prefix + link + ' z';
        const label = text.indexOf('[') + 1;
        const icon = text.indexOf(']');
        const { view, move } = visualView(text, reverse ? icon : label);
        move(reverse ? label : icon);
        const requested = deleteVisualSelection(view);
        assert.equal(view.state.doc.toString(), prefix + ' z');
        // enterInsertMode first exits Visual mode, then restores the old start.
        const visualHead = view.cm.state.vim.sel.head;
        const line = view.state.doc.line(visualHead.line + 1);
        view.dispatch({ selection: { anchor: line.from + Math.min(visualHead.ch, line.length) } });
        view.cm.state.vim.visualMode = false;
        view.dispatch({ selection: { anchor: requested } });
        assert.equal(view.state.selection.main.head, prefix.length);
        view.dispatch({ changes: { from: view.state.selection.main.head, insert: 'X' } });
        assert.equal(view.state.doc.toString(), prefix + 'X z');
      });
    }
  }
}

for (const suffix of ['', '\nnext']) {
  test(`Visual c で文書末尾・行末を変更できる: ${JSON.stringify(suffix)}`, () => {
    const text = '[abc](http://url)' + suffix;
    const { view, move } = visualView(text, 1);
    move(text.indexOf(']'));
    const requested = deleteVisualSelection(view);
    view.cm.state.vim.visualMode = false;
    view.dispatch({ selection: { anchor: requested } });
    view.dispatch({ changes: { from: view.state.selection.main.head, insert: 'X' } });
    assert.equal(view.state.doc.toString(), 'X' + suffix);
  });
}

test('Visual c のラベルだけの部分変更では選択位置を保持する', () => {
  const { view, move } = visualView('[abc](http://url) z', 2);
  move(3);
  const requested = deleteVisualSelection(view);
  assert.equal(view.instance.pendingVisualChange, null);
  view.cm.state.vim.visualMode = false;
  view.dispatch({ selection: { anchor: requested } });
  view.dispatch({ changes: { from: view.state.selection.main.head, insert: 'X' } });
  assert.equal(view.state.doc.toString(), '[aX](http://url) z');
});

for (const mode of ['other operation', 'normal input', 'composition', 'other deletion']) {
  test(`Visual c の挿入先補正を適用しない: ${mode}`, () => {
    const { view, move } = visualView('[abc](http://url) z', 1);
    move(4);
    const requested = deleteVisualSelection(view, mode === 'normal input' ? 'delete' : 'change');
    if (mode === 'other operation') view.cm.curOp = { isVimOp: true };
    if (mode === 'composition') view.composing = true;
    if (mode === 'other deletion') view.dispatch({ changes: { from: 1, to: 2 } });
    view.cm.state.vim.visualMode = false;
    view.dispatch({ selection: { anchor: requested } });
    assert.equal(view.state.selection.main.head, requested);
  });
}
