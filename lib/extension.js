"use babel";

import { Compartment, EditorState, Prec, StateEffect } from "@codemirror/state";
import { createLinkCompactPlugin } from "./view-plugin.js";
import { createInteractionHandlers } from "./interactions.js";

let extensionSpec = null;

/*
 * 短縮表示に必要な状態と操作を持つエディターか判定する。
 */
function isEditorView(view) {
  return (
    view != null &&
    view.state != null &&
    typeof view.dispatch === "function" &&
    typeof view.plugin === "function"
  );
}

/*
 * 現在の短縮状態に応じて拡張を登録・再設定または解除し、更新後の状態を返す。
 */
export function ensureLinkCompactExtension(view, isShorten) {
  if (!isEditorView(view)) {
    return isShorten;
  }

  const { compartment, extension, append, reconfigure, clear } = getExtensionSpec();
  if (isShorten) {
    view.dispatch({
      effects: clear(),
    });
    return false;
  }

  if (compartment.get(view.state) != null) {
    view.dispatch({
      effects: reconfigure(extension(view)),
    });
  } else {
    view.dispatch({
      effects: append(extension(view)),
    });
  }
  view.dispatch({ selection: view.state.selection });
  return true;
}

/*
 * 渡されたエディターが短縮表示の適用対象か判定する。
 */
export function isLinkCompactEditor(view) {
  return isEditorView(view);
}

/*
 * 初回利用時に拡張と操作用エフェクトを生成し、以後は同じ定義を返す。
 */
function getExtensionSpec() {
  if (extensionSpec != null) {
    return extensionSpec;
  }

  const expandLink = StateEffect.define();
  const { provide, filterCompactSelection, syncVisualCursor } =
    createInteractionHandlers(expandLink);
  const plugin = createLinkCompactPlugin(expandLink, provide, syncVisualCursor);

  const compartment = new Compartment();
  // エディターに対応する表示プラグインと選択補正フィルターを組み合わせる。
  const extension = (view) => [
    plugin,
    Prec.highest(
      EditorState.transactionFilter.of((transaction) =>
        filterCompactSelection(view, transaction, plugin)
      )
    ),
  ];

  extensionSpec = {
    compartment,
    extension,
    // 短縮表示用の区画をエディターの設定に追加するエフェクトを生成する。
    append: (extension) => StateEffect.appendConfig.of(compartment.of(extension)),
    // 既存の区画を指定の拡張に置き換えるエフェクトを生成する。
    reconfigure: (extension) => compartment.reconfigure(extension),
    // 区画の拡張を空にして短縮表示を解除するエフェクトを生成する。
    clear: () => compartment.reconfigure([]),
  };

  return extensionSpec;
}
