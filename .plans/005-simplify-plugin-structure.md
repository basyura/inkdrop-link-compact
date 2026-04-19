# プラグイン構成簡素化計画

## 背景

- 現在の実装は `ShortLinkMessageDialog` を React コンポーネントとして登録し、`inkdrop.components.registerClass()` と `inkdrop.layouts.addComponentToLayout()` でレイアウトへ追加している。
- ただし、このコンポーネントは実質的に UI を描画しておらず、`render()` も空である。
- Inkdrop 公式の `word-count` ガイドはモーダル UI を表示する例であり、現在の `short-link` の責務とは一致しない。

## 目的

- 不要なコンポーネント登録を廃止し、プラグインの初期化責務をトップレベルモジュールに集約する。
- CodeMirror 6 拡張の適用処理を、UI レイアウトに依存しないシンプルな構成へ整理する。

## 修正方針

1. `lib/short-link-message-dialog.js` にあるコマンド登録、editor attach、`MutationObserver` 管理を見直す。
2. UI を描画しない React コンポーネントとしての責務を廃止し、必要な状態管理を通常のクラスまたはモジュール関数へ移す。
3. `lib/short-link.js` の `activate()` / `deactivate()` で購読開始と解放を直接管理する。
4. `inkdrop.components.registerClass()` / `deleteClass()` を削除する。
5. `inkdrop.layouts.addComponentToLayout()` / `removeComponentFromLayout()` を削除する。
6. 既存のトグル動作、ノート切替追従、エディタロード時の初期化が維持されることを確認する。

## 確認項目

- プラグイン有効化時に例外が発生しないこと
- `short-link:toggle` が従来どおり動作すること
- ノート切替時に短縮表示が再適用されること
- deactivate 時に command subscription と observer が解放されること
- `node --check` で編集ファイルの構文エラーが出ないこと

## 実施済み

- `lib/short-link-message-dialog.js` から React 依存と空の `render()` を除去した
- `ShortLinkMessageDialog` を `ShortLinkController` に置き換え、通常クラスとして `activate()` / `deactivate()` を持たせた
- コマンド登録、editor attach、`MutationObserver` 解放処理を `ShortLinkController` に集約した
- `lib/short-link.js` で controller インスタンスを直接管理し、`registerClass` / `addComponentToLayout` 系呼び出しを削除した
- `node --check lib/short-link.js` と `node --check lib/short-link-message-dialog.js` を実行し、構文エラーがないことを確認した

## 参照

- Inkdrop ガイド: `Plugin: Word count`
- 現行実装: `lib/short-link.js`, `lib/short-link-message-dialog.js`
