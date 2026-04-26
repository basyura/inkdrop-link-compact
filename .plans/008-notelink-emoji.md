# notelinkEmoji の適用

## 背景

- `lib/link-compact.js` に `notelinkEmoji` 設定が追加済み。
- 現状の短縮表示はすべて `linkEmoji` を使っている。
- `inkdrop://` で始まるリンクは Inkdrop のノートリンクとして扱い、通常リンクとは別の絵文字で表示したい。

## 修正案

1. `lib/link-compact-extension.js` の装飾生成処理で、リンク URL ごとに使用する絵文字を選択する。
2. URL が `inkdrop://` で始まる場合は `inkdrop.config.get("link-compact.notelinkEmoji")` を使う。
3. それ以外のリンクは従来通り `inkdrop.config.get("link-compact.linkEmoji")` を使う。
4. 既存の短縮範囲検出、カーソル移動、トグル処理は変更しない。
5. `README.md` の設定説明に `link-compact.notelinkEmoji` を追加する。
6. 画像表示記法 `![...](...)` の URL には `inkdrop.config.get("link-compact.imglinkEmoji")` を使う。
7. `README.md` の設定説明に `link-compact.imglinkEmoji` を追加する。

## 確認方法

- `node --check lib/link-compact.js`
- `node --check lib/link-compact-controller.js`
- `node --check lib/link-compact-extension.js`
