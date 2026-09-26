# 短縮 URL の data-url 属性追加計画

## 目的

短縮表示された Markdown リンク URL の DOM に、元の URL を `data-url` 属性として保持する。

## 修正方針

- `buildLinkCompactRanges` で検出した URL 範囲に URL 文字列を含める
- `LinkCompactWidget` が URL を受け取り、生成する `span.link-compact-mark` に `data-url` を設定する
- Widget の等価判定で emoji と URL の両方を比較し、URL 変更時に表示が更新されるようにする
- README に短縮時に生成される HTML の仕様を記載する

## 対象ファイル

- `lib/link-compact-extension.js`
- `README.md`

## 確認方法

- `node --check lib/link-compact-extension.js`
- README の記載内容が実装と一致していることを確認する
- 必要に応じて Inkdrop v6 上で短縮後 DOM に `data-url` が付与されることを確認する
