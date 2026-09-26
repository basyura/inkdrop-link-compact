const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const { createHarness, widgets } = require("./helpers/harness.cjs");

let h;
beforeEach(async () => {
  h = await createHarness();
});
afterEach(() => h.destroy());

test("設定はリンク三種の文字列で初期値は空", () => {
  assert.deepEqual(Object.keys(h.entry.config), [
    "linkEmoji",
    "notelinkEmoji",
    "imglinkEmoji",
  ]);
  for (const option of Object.values(h.entry.config)) {
    assert.equal(option.type, "string");
    assert.equal(option.default, "");
  }
});

for (const invalid of [
  null,
  undefined,
  {},
  { cm: {} },
  { state: {} },
  { state: {}, dispatch() {} },
]) {
  test(`無効なエディターは無視する: ${JSON.stringify(invalid)}`, () => {
    assert.equal(h.extension.isLinkCompactEditor(invalid), false);
    for (const shorten of [true, false]) {
      assert.equal(
        h.extension.ensureLinkCompactExtension(invalid, shorten),
        shorten
      );
    }
    assert.doesNotThrow(() => new h.Controller().attachEvents(invalid));
    assert.equal(h.observers.length, 0);
  });
}

test("起動済みエディターを直ちに短縮し、コマンドで切り替える", () => {
  const view = (h.env.activeEditor = h.createView("[a](url)"));
  h.entry.activate();
  assert.equal(h.extension.isLinkCompactEditor(view), true);
  assert.equal(widgets(view).length, 1);
  assert.equal(h.editorLoads.size, 0);
  assert.equal(h.commands.size, 1);
  h.commands.get("link-compact:toggle")();
  assert.equal(view.instance, undefined);
  h.commands.get("link-compact:toggle")();
  assert.equal(widgets(view).length, 1);
  assert.equal(view.state.doc.toString(), "[a](url)");
});

test("エディター未ロード時は通知を待ち、終了時に購読を解除する", () => {
  h.entry.activate();
  assert.equal(h.editorLoads.size, 1);
  h.commands.get("link-compact:toggle")();
  const view = (h.env.activeEditor = h.createView("[a](url)"));
  for (const callback of h.editorLoads) callback(view);
  assert.equal(widgets(view).length, 1);
  h.entry.deactivate();
  assert.equal(h.editorLoads.size, 0);
  assert.equal(h.commands.size, 0);
  assert.equal(
    h.observers.find((observer) => observer.target === h.env.layout).disconnected,
    true
  );
});

test("レイアウトがなくても短縮処理は動く", () => {
  h.env.layout = null;
  const view = (h.env.activeEditor = h.createView("[a](url)"));
  h.entry.activate();
  assert.equal(widgets(view).length, 1);
  assert.equal(h.observers.length, 1); // Only the cursor observer.
});

test("ノート変更で短縮を再適用し、同一ノートや未選択では状態を維持する", () => {
  const view = (h.env.activeEditor = h.createView("[a](url)"));
  const controller = new h.Controller();
  controller.activate();
  const firstObserver = controller.observer;
  assert.equal(firstObserver.target, h.env.layout);
  assert.equal(firstObserver.options.childList, true);
  assert.equal(firstObserver.options.subtree, true);
  assert.equal(firstObserver.options.attributes, true);
  h.env.editingNote = { _id: "note:1" };
  firstObserver.fire();
  assert.equal(controller.noteId, "note:1");
  assert.equal(firstObserver.disconnected, true);
  controller.toggle();
  assert.equal(view.instance, undefined);
  const dispatchCount = view.dispatches.length;
  controller.observer.fire();
  h.env.editingNote = null;
  controller.observer.fire();
  assert.equal(view.dispatches.length, dispatchCount);
  h.env.editingNote = { _id: "note:2" };
  controller.observer.fire();
  assert.equal(controller.isShorten_, true);
  assert.equal(widgets(view).length, 1);
  const observer = controller.observer;
  controller.deactivate();
  assert.equal(observer.disconnected, true);
  assert.equal(controller.observer, null);
});

test("ノート変更時は新しいアクティブエディターを使う", () => {
  h.env.activeEditor = h.createView("[a](one)");
  const controller = new h.Controller();
  controller.activate();
  const next = (h.env.activeEditor = h.createView("[b](two)"));
  h.env.editingNote = { _id: "note:next" };
  controller.observer.fire();
  assert.equal(widgets(next)[0].value.spec.widget.url, "two");
  controller.deactivate();
});

test("未起動・二重終了を許容し、再起動でコマンドが重複しない", () => {
  h.entry.deactivate();
  h.entry.activate();
  h.entry.deactivate();
  h.entry.deactivate();
  h.entry.activate();
  assert.equal(h.commands.size, 1);
  assert.equal(h.editorLoads.size, 1);
});

test("同一エディターへの再適用は装飾・キーマップを重複させない", () => {
  const view = h.compact("[a](url)");
  h.extension.ensureLinkCompactExtension(view, false);
  h.extension.ensureLinkCompactExtension(view, false);
  assert.equal(widgets(view).length, 1);
  assert.equal(h.observers.length, 1);
  assert.equal(view.key("Enter"), true);
  assert.deepEqual(h.openedUris, ["url"]);
});

test("複数エディターの短縮・編集状態を独立して保持する", () => {
  const first = h.compact("[a](one)", { anchor: 1 });
  const second = h.compact("[b](two)", { anchor: 1 });
  first.key("Backspace");
  assert.equal(widgets(first).length, 0);
  assert.equal(widgets(second).length, 1);
  h.extension.ensureLinkCompactExtension(first, true);
  assert.equal(first.instance, undefined);
  assert.equal(second.key("Enter"), true);
  assert.deepEqual(h.openedUris, ["two"]);
});
