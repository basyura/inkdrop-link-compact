# Inkdrop v6 起動時エラー修正計画

## 背景

- `short-link` プラグインを Inkdrop v6 で読み込む際、起動時エラー要因を段階的に解消する。
- 現在は手動修正として `MessageDialog` 依存の除去と `package.json` の `engines.inkdrop` 更新が入っている。

## 現状確認

- `inkdrop.components.registerClass()` と `inkdrop.layouts.addComponentToLayout()` は v6 でも有効。
- `MessageDialog` は API ドキュメント上 deprecated であり、依存除去の方向性は妥当。
- Inkdrop v6 では `inkdrop.getActiveEditor()` が CodeMirror 6 の `EditorView` を返す前提で扱う。
- 現コードは `editor.cm` を前提にしており、この前提自体が崩れている。
- 現コードは CodeMirror 5 前提の API に依存している。
  - `editor.cm`
  - `cm.doc.getValue()`
  - `cm.doc.getCursor()`
  - `cm.doc.findMarks()`
  - `cm.markText()`
  - `cm.on("keydown", ...)`
- 起動時エラー原因として、`cm.doc` の有無だけでなく、`editor.cm` 前提を含む CodeMirror 5 API 全体が v6 で非互換になっている可能性を最有力候補として扱う。
- 起動時エラー候補として、以下が残っている。
  - `.editor-layout` が未存在のまま `MutationObserver.observe()` を呼ぶ可能性
  - `this.observe` / `this.observer` の typo により observer を解放できていない
  - `inkdrop.getActiveEditor()` が `null` のタイミングを十分に考慮していない
  - `inkdrop.onEditorLoad()` で登録した購読の解放が不足している可能性
  - `cm.doc` が存在しない実装に変わっている場合、`getValue()`, `getCursor()`, `findMarks()` 呼び出しで落ちる可能性

## 修正案

1. `lib/short-link-message-dialog.js` の初期化処理を見直し、DOM 要素と editor の存在確認を追加する。
2. `inkdrop.getActiveEditor()` を `EditorView` として扱うように実装前提を修正する。
3. リンク短縮表示の実現方法を、CodeMirror 6 の `EditorView` / `state.doc` / decoration / transaction / selection 系 API で組み直す。
4. observer と editor event の購読解除を正しく実装する。
5. `toggle()` と editor attach 処理を null-safe にする。
6. 必要であれば、モーダル登録コンポーネントとして最低限の責務だけを残す形に整理する。

## 優先調査ポイント

1. `inkdrop.getActiveEditor()` を `EditorView` として扱い、`editor.cm` 依存を除去する。
2. `EditorView.state.doc` と selection API で必要な処理を置き換えられるか確認する。
3. CodeMirror 6 での置換戦略を決めた上で、段階的に実装する。

## 実施済み

- `cm.doc` 問題を起点に調査を開始したが、前提を CodeMirror 5 から 6 に見直す必要があると判明
- `inkdrop.getActiveEditor()` は `EditorView` を返す前提に更新
- `inkdrop.onEditorLoad()` の Disposable を購読管理へ追加
- `this.observe` / `this.observer` の不整合修正
- CodeMirror 5 API が無い環境では既存のリンク置換処理を走らせない暫定ガードを追加
- デバッグ用の `console.log` を除去
- `EditorView` 前提で `lib/short-link-message-dialog.js` を CodeMirror 6 の decoration ベースへ組み直した
- `@codemirror/state` と `@codemirror/view` を依存に追加した

## 確認項目

- Inkdrop v6 起動時にプラグイン読み込みで例外が出ないこと
- ノート切替時にリンク短縮処理が走ること
- Enter キー入力時の mark clear が従来どおり動くこと
- deactivate 時に event listener / observer が残らないこと

## メモ

- 新しい計画ファイルは作らず、このファイルを更新していく。
- リポジトリ運用補助として `AGENTS.md` を追加する場合は、この計画に追記して扱う。
- `AGENTS.md` には現状の実態を反映する。
  - ソースは `lib/`
  - 画像などの資料は `docs/images/`
  - 自動テストや lint script は未整備
  - 検証は `node --check` と `npm_config_cache=/tmp/short-link-npm-cache npm pack --dry-run` をベースにする
