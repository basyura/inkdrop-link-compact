# 不完全な Markdown リンクを省略しない修正計画

## 背景

- このプラグインは Markdown リンクの URL 部分を省略表示する。
- ただし入力途中では `* [ ] [性能検証](https://hoge.fuga.org` のように閉じ `)` がまだ存在しない不完全なリンクになることがある。
- この不完全な状態では、省略表示せず通常のテキストのまま見せたい。

## 修正方針

1. `lib/short-link-message-dialog.js` の短縮範囲判定を見直す。
2. 完全な `[...]()` として閉じているリンクだけを省略対象にする。
3. 閉じ `)` が未入力のリンクは `ranges` に含めず、通常表示のままにする。

## 追加方針: 再計算頻度の抑制

1. `updateRanges()` は本文テキスト変更時にのみ再実行する。
2. `selectionSet` と `viewportChanged` では短縮範囲が変わらないため、再計算対象から外す。
3. 初期表示は既存どおり constructor 内の `updateRanges(view)` で担保する。

## 確認項目

- `* [ ] [性能検証](https://hoge.fuga.org` では省略表示されないこと
- `* [ ] [性能検証](https://hoge.fuga.org)` では従来どおり省略表示されること
- `node --check lib/short-link-message-dialog.js` が成功すること
- カーソル移動や選択変更だけでは短縮範囲の再計算が走らないこと
