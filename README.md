# inkdrop-link-compact

`inkdrop-link-compact` は、Inkdrop エディタ上で Markdown リンクの URL 部分をコンパクト表示するプラグインです。カーソルがリンク上に移動している間だけ元の URL をそのまま扱えます。

## Features

- Markdown リンクの URL 部分を絵文字 1 文字に置き換えて表示
- `Ctrl+Alt+T` でコンパクト表示の切り替え
- Inkdrop の設定画面から置換文字を変更可能

## Installation

Inkdrop の plugin manager から `link-compact` をインストールしてください。

## Configuration

- `link-compact.linkEmoji`
  - URL の代わりに表示する文字
  - 既定値: `🔗`

## Attribution

このプロジェクトは、MIT ライセンスで公開されていた `shagon94/short-link` をベースに、Inkdrop v6 向けの保守と再公開のために調整したフォークです。
