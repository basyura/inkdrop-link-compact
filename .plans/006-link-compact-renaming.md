# `link-compact` への改名と再公開準備計画

## 概要

- プラグインの公開名を `inkdrop-link-compact`、`package.json.name` を `link-compact` に変更する
- 既存の `short-link` 由来の内部識別子も `link-compact` 系へ全面変更し、公開名と内部名を一致させる
- 元フォークであることと MIT 継承は README に明記し、再公開向けのメタデータを整理する

## 実施内容

- `package.json`
  - `name` を `link-compact` に変更
  - `description`、`repository`、`keywords` を再公開向けに更新
  - 公開パッケージに含めるファイルを明示して、作業用ファイルが配布物に入らないようにする
- プラグイン内部識別子
  - コマンド名 `short-link:*` を `link-compact:*` へ変更
  - 設定キー `short-link.*` を `link-compact.*` へ変更
  - CSS クラスや関連文字列も `short-link` から `link-compact` 系へ統一
- ファイル/実装構成
  - エントリポイントや関連モジュール名に `short-link` を含む場合は、必要範囲でリネームする
  - `README` のタイトル、導入説明、設定例を新名称へ更新する
- 公開メタデータ
  - README に MIT ライセンスの元フォークをベースに保守・再公開している旨を明記する
  - `package.json.repository` は現行リポジトリの URL に変更する

## 確認項目

- `node --check` を編集後の JS ファイルに対して実行する
- `npm_config_cache=/tmp/short-link-npm-cache npm pack --dry-run` を実行する
- `rg -n "short-link"` で旧識別子の残存を確認する
- Inkdrop v6 で起動、ノート切替、トグル操作、設定反映を手動確認する
