# 完成したリンクに連動するスタイルクラス適用計画

## 背景

- 完成済みリンクの有無に応じて editor 全体へ `.link-compact-enabled` を付与すると、同じノート内に完成済みリンクが 1 件でもある場合、未完成の `[google]` にも `.link-compact-enabled .md-link-mark` のスタイルが適用される。
- Inkdrop の Developer Tools で、`[google]` 自体は短縮対象ではない一方、同じノート内の別の完成済みリンクによって editor 全体へ class が付与されていることを確認した。
- `[google](https://google.com)` のように、空ではない URL と閉じ `)` が揃ったリンク単位で専用クラスを付与したい。

## 修正案

1. `lib/link-compact-extension.js` の `EditorView.editorAttributes` による editor 全体へのクラス付与を取り除く。
2. `buildLinkCompactRanges()` が返す各完成済みリンクに、リンク記法全体の範囲を追加する。
3. 完成済みリンクの範囲へ `Decoration.mark` で `.link-compact-enabled` を付与し、その内側の `.md-link-mark` だけをスタイル対象にする。
4. URL 置換用 decoration と atomic range を分け、class 用 decoration がカーソル移動の対象にならないようにする。
5. 既存の URL 置換表示、絵文字選択、カーソル移動処理は維持する。

## 確認項目

- `[google]` では `.link-compact-enabled .md-link-mark` が一致しないこと
- 同じノート内に別の完成済みリンクがあっても、未完成の `[google]` にはスタイルが適用されないこと
- `[google](`、`[google]()`、`[google](https://google.com` では専用クラスが付与されないこと
- `[google](https://google.com)` まで入力すると、そのリンク内だけに専用クラスが付与されること
- 完成済みリンクから URL または閉じ `)` を削除すると、そのリンクの専用クラスが除去されること
- URL 短縮機能を解除すると、すべての専用クラスが除去されること
- class 用 decoration が atomic range に含まれず、リンク名部分のカーソル移動を妨げないこと
- `node --check lib/link-compact-extension.js` が成功すること
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` が成功すること
- `git diff --check` が成功すること

## 注意事項

- `styles/link-compact.css` にある既存の未コミット変更は保持し、この修正では変更しない。

## 実施状況

- [x] 修正方針の確認
- [x] 完成済みリンク単位の class decoration 追加
- [x] atomic range の分離
- [x] 構文確認と package 内容確認
- [x] Inkdrop の Developer Tools による実機確認

## 確認結果

- 修正前の実機確認では、未完成の `[google]` 自体に短縮表示はないが、editor 全体の `.link-compact-enabled` によりスタイルが適用されていた。
- 修正後は editor 全体から `.link-compact-enabled` が除去され、完成済みリンク 2 件の範囲だけに class が付与された。
- 同じノート内の `[google]` は `.link-compact-enabled .md-link-mark` に一致せず、通常の `font-size: 14px` と `margin-left: 0px` で表示された。
- 完成済みリンク内の Markdown 記号は selector に一致し、ユーザー指定の `font-size: 0px` と `margin-left: 2px` が適用された。
- 短縮表示を OFF にすると class と短縮 Widget がすべて除去され、再度 ON にすると完成済みリンク 2 件だけに復元された。
- atomic range は完成済みリンク 2 件の URL 部分だけで、リンク名を含む class decoration は対象外だった。
- 未完成または空の URL を含む 4 パターンでは範囲が生成されず、完成済みリンクと未完成リンクが混在するパターンでも完成済みリンクだけが検出された。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。
