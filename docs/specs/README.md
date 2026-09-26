# 現在の仕様

このディレクトリは、Inkdrop v6 用プラグイン `link-compact` の現行動作を記録する。実装と自動テストで確認できる動作を対象とし、将来の変更案は含めない。

- [リンクの検出と表示](link-detection-and-rendering.md): 対象となる Markdown 記法、短縮範囲、アイコンと CSS。
- [編集とカーソル操作](editing-and-interactions.md): キー操作、編集時の展開、選択補正、Vim カーソル。
- [起動、切り替え、設定](lifecycle-and-configuration.md): Inkdrop との連携、ノート切り替え、設定値。

仕様の根拠は `lib/`、`styles/`、`test/` の現行実装にある。テストの範囲と実機確認が必要な項目は [テスト資料](../../test/README.md) を参照する。
