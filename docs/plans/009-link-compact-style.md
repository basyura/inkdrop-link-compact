# URL 短縮時のリンク記号スタイル適用計画

## 背景

- URL の短縮表示中は、Markdown リンク記号を表す `.md-link-mark` にユーザーが指定したスタイルを適用できるようにしたい。
- URL の短縮表示を解除した際は、ユーザー指定スタイルも同時に適用されなくなる必要がある。
- 現在の短縮表示は CodeMirror 6 の `Compartment` で切り替えているため、スタイルの有効状態も同じライフサイクルで管理する。

## 修正案

1. `lib/link-compact-extension.js` で短縮表示中の editor に専用クラスを付与する CodeMirror extension を作成する。
2. 短縮用 `Compartment` に URL 置換用 plugin と専用クラス付与 extension をまとめて登録する。
3. `README.md` に、ユーザーの `Styles.css` で専用クラス配下の `.md-link-mark` に次のスタイルを指定し、短縮中の Markdown リンク記法を目立たなくする例を追加する。
   - `color: rgba(119, 204, 189, 0.3)`
   - `color: black !important`
   - `font-size: 5pt`
   - `margin-left: -2px`
4. URL 短縮解除時は専用クラスが除去され、`Styles.css` のスタイルが適用されなくなることを `README.md` に明記する。

## 確認項目

- URL 短縮中のみ `.md-link-mark` に指定スタイルが適用されること
- URL 短縮解除時に指定スタイルが解除されること
- URL 短縮を再度有効化した際に指定スタイルが再適用されること
- `README.md` に `Styles.css` の設定方法と CSS 例が記載されていること
- CSS 例が Markdown リンク記法を目立たなくするサンプルであることが明記されていること
- `node --check lib/link-compact-extension.js` が成功すること
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` が成功すること

## 実施状況

- [x] 修正方針の確認
- [x] 短縮状態と連動する editor クラスの追加
- [x] `Styles.css` の設定方法を README に追加
- [x] CSS 設定対応の取り消し
- [x] 構文確認と package 内容確認

## 確認結果

- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。
- `README.md` に短縮表示中のみ有効な selector と `Styles.css` の設定例を追加した。
- CSS 例が短縮中の Markdown リンク記法を目立たなくするサンプルであることを明記した。
- Inkdrop 実機で、短縮表示の ON/OFF に応じて指定スタイルが適用・解除されることを確認する。

## 方針変更

- `link-compact.linkMarkCss` の設定追加と plugin stylesheet での指定スタイル管理は取り消す。
- 指定スタイルはユーザーの `Styles.css` で管理し、plugin は短縮状態を示す class の付与と解除のみを行う。
