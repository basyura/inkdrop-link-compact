# 現在の仕様

このディレクトリは、Inkdrop v6 用プラグイン `link-compact` の現行動作を記録する。実装と自動テストで確認できる動作を対象とし、将来の変更案は含めない。

- [リンクの検出と表示](link-detection-and-rendering.md): 対象となる Markdown 記法、短縮範囲、アイコンと CSS。
- [編集とカーソル操作](editing-and-interactions.md): キー操作、編集時の展開、選択補正、Vim カーソル。
- [起動、切り替え、設定](lifecycle-and-configuration.md): Inkdrop との連携、ノート切り替え、設定値。

仕様の根拠は `lib/`、`styles/`、`test/` の現行実装にある。テストの範囲と実機確認が必要な項目は [テスト資料](../../test/README.md) を参照する。

## 実装の分担

- `lib/extension.js`: 公開 API、拡張の遅延初期化と登録・解除。
- `lib/parser.js`: コード領域の除外とリンク範囲の解析。
- `lib/editing.js`: 編集・変更範囲の判定と位置の追従。
- `lib/decorations.js`: アイコンと装飾・移動用範囲の生成。
- `lib/interactions.js`: キー操作、選択・改行の補正。
- `lib/view-plugin.js`: エディターごとの編集状態、装飾更新、Vim カーソルの監視。

CodeMirror の読み込みと拡張の生成は、有効なエディターに初めて適用するときに行う。
