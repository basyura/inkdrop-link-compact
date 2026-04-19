# 短縮表示切り替え時の解除処理追加計画

## 背景

- `ensureShortLinkExtension` で短縮表示 extension を追加した後、次回呼び出し時に短縮表示を解除する状態管理が不足している。
- 現状の `this.isShorten_` は関数呼び出し側から束縛されておらず、意図したフラグとして扱いづらい。
- `Compartment` を再利用して短縮表示を ON/OFF する必要がある。

## 修正案

1. `lib/short-link-message-dialog.js` で `ensureShortLinkExtension` 呼び出し時にコンポーネントインスタンスを `this` として渡す。
2. `this.isShorten_` をトグル状態として保持し、`true` の場合は `clear()` で省略表示を解除する。
3. 省略表示を有効化する際は、初回のみ `append(plugin)` を使い、2回目以降は `reconfigure(plugin)` で `Compartment` を再利用する。
4. ノート切り替え時は `this.isShorten_ = false` に戻してから `attachEvents()` を呼び、次のノートでは自動的に短縮表示を有効化する。

## 確認項目

- ページ切り替え時に自動で短縮表示が有効になること
- `toggle()` 実行時に短縮表示の ON/OFF が切り替わること
- 短縮を再度有効化しても `Duplicate use of compartment in extensions` が発生しないこと
- `node --check lib/short-link-message-dialog.js` が成功すること

## 確認結果

- `node --check lib/short-link-message-dialog.js` は成功した。
- Inkdrop 実機で短縮表示の ON/OFF とノート切り替え後の自動短縮が問題なく動作した。
