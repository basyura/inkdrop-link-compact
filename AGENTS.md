# Repository Guidelines

## 計画

- 修正を始める前に計画をマークダウンファイルで .plans フォルダ配下に日本語で生成してください。
- 計画のファイル名は連番とし、1つ目を 001 始まりとして修正にあった適切なファイル名としてください。
- 具体的なファイル編集をする前に、修正案を提示すること。
- 指示があるまで新しい計画ファイルを作成せず、このセッションで使用する計画ファイルが明示されている場合のみその計画に反映すること。
- このセッションで使用する計画ファイルが未指定の場合は、既存の計画ファイルを勝手に選んで更新せず、どの計画ファイルを使うか確認すること。
- API に関しては https://github.com/inkdropapp/api-docs/ サイトを確認すること。特に、inkdrop v5 から v6 への plugin アップデートに関しては https://github.com/inkdropapp/api-docs/blob/main/src/app/appendix/plugin-migration-from-v5-to-v6/page.mdx を参照すること。

## Project Structure & Module Organization

This repository contains an Inkdrop plugin that compacts Markdown link URL display inside the editor.

Inkdrop v6 uses CodeMirror 6 in this project. `inkdrop.getActiveEditor()` now returns `CodeMirror#EditorView`, so do not assume an `editor.cm` property or CodeMirror 5 APIs such as `markText`.

- `lib/link-compact.js`: plugin entry point, lifecycle hooks, and config
- `lib/link-compact-controller.js`: command registration and editor lifecycle handling
- `lib/link-compact-extension.js`: CodeMirror 6 extension for compact link rendering
- `styles/`: plugin stylesheet
- `test/`: automated tests and test helpers; see `test/README.md` for coverage and limitations
- `.plans/`: working plans for repository changes
- `docs/specs/`: current behavior specifications for implementation and review

## 仕様書の維持

- 実装を変更する前に `docs/specs/README.md` から該当する現行仕様を確認する。
- 実装で動作を変更した場合は、同じ作業で `docs/specs/` の該当箇所を更新する。新しい動作を追加した場合も適切な仕様ファイルへ反映する。
- 仕様と実装・テストの食い違いを見つけた場合は、実際の動作を確認し、仕様書を合わせて修正する。

## Build, Test, and Development Commands

No build step is defined in `package.json`. Use these commands for local checks:

- `npm test`: run all automated tests
- `npm run test:coverage`: run all automated tests and report coverage for `lib/`
- `node --check lib/link-compact.js`: syntax-check the plugin entry point
- `node --check lib/link-compact-controller.js`: syntax-check the controller
- `node --check lib/link-compact-extension.js`: syntax-check the CodeMirror extension
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run`: verify package contents without publishing
- `git status --short`: inspect local changes before and after edits

## Coding Style & Naming Conventions

Use JavaScript matching the existing codebase:

- 2-space indentation in JSON, existing JS style preserved per file
- `use babel` pragma for plugin source files
- Keep module filenames kebab-case, for example `link-compact-extension.js`
- Prefer small, direct functions and minimal comments
- Keep formatting consistent with the existing file style, and use Prettier only when it is already available in the project or local environment

Do not introduce new tooling unless the repository adopts it first.

## Testing Guidelines

自動テストは Node.js 標準のテストランナーで実行する。

- 修正時は、変更内容を検証するテストを必ず追加する。不具合修正では再発を防ぐ回帰テストを追加する。
- 修正後は `npm test` で全てのテストを実行し、エラー・失敗がないことを確認する。変更箇所に関係するテストだけの実行で済ませない。
- テストが失敗した場合は原因を修正し、再度全てのテストを実行して成功を確認してから作業完了とする。

Additional checks:

- run the `node --check` commands on edited files
- run `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` after changing package metadata or shipped files
- verify behavior manually in Inkdrop v6, especially startup, note switching, and editor interactions

## Electron デバッグによる実機確認（macOS）

Inkdrop の実画面確認には、ユーザーが指定した Electron のデバッグ接続を使用できる。画面操作ツールが使えない場合も、この方法が利用可能か確認する。利用するツールの制約と権限に従うこと。

### 起動と接続

1. `~/Library/Application Support/inkdrop/packages/link-compact` の参照先を確認する。この環境では本リポジトリへのシンボリックリンクになっている。別環境でも同じとは限らないため、変更したソースが読み込まれることを確認する。
2. Inkdrop を終了してから次のコマンドで起動する。既に起動中のアプリに引数を渡すだけでは、デバッグ接続が有効にならない場合がある。終了時は編集中の内容を保護し、強制終了を避ける。

```sh
open -a Inkdrop --args --remote-debugging-port=19222 --remote-debugging-address=127.0.0.1
```

3. 次の接続先から、`type` が `page` で URL に `windowType=full` を含む対象を選ぶ。複数ある場合は対象ウィンドウを特定する。

```sh
curl --silent --show-error http://127.0.0.1:19222/json/list
```

4. 対象の `webSocketDebuggerUrl` に Chrome DevTools Protocol（CDP）で接続する。`Runtime.evaluate` で DOM と関連設定を確認し、`Page.captureScreenshot` で実際の描画を確認する。Node.js の組み込み `WebSocket` が利用可能な環境では、追加パッケージなしで接続できる。一時的な検証スクリプトは `/tmp` に置き、リポジトリの依存関係を増やさない。

### 確認する内容

- 起動直後の結果だけで判断せず、エディターとプラグインが読み込まれてから確認する。今回の確認でも、最初の取得では絵文字、その後の取得では SVG が表示された。
- `require.cache` の `link-compact` 関連パスで、今回変更したソースが読み込まれていることを確認できる。
- `inkdrop.config.get("link-compact.linkEmoji")`、`notelinkEmoji`、`imglinkEmoji` の値を確認する。保存済みの絵文字は新しいデフォルト値より優先されるため、コード変更だけで SVG 表示になるとは限らない。
- `.link-compact-mark` の子要素が、設定が空なら右上向きの SVG、指定済みならその文字であることを確認する。SVG は右上向きのパスを直接使用し、`desc` と回転用 `transform` は出力しない。外側の `span` には元の URL を持つ `data-url` が必要。
- DOM の確認に加え、スクリーンショットで方向・サイズ・色・余白・行高を確認する。括弧を隠すユーザーの stylesheet が適用された状態も確認する。
- ノート本文や保存済み設定を検証のために無断で上書きしない。必要な一時変更は元の状態を記録して復元する。ログにはノート本文や実際のリンク先を必要以上に出力しない。
- 通常リンク・ノートリンク・画像リンク、絵文字指定、短縮切り替え、ノート切り替え、カーソル操作のうち、実施した項目と未実施の項目を区別して記録する。DOM 代替オブジェクトによる検証を実機確認として扱わない。

### 終了処理

確認後はデバッグ起動した Inkdrop を終了し、`open -a Inkdrop` で通常起動へ戻す。プロセスの引数から `--remote-debugging-port` がなくなり、`http://127.0.0.1:19222/json/list` に接続できなくなったことを確認する。デバッグ接続はローカル限定で使用する。

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `fix url regex` and `add null check`. Follow that style and keep each commit focused.

Pull requests should include:

- a short summary of the user-visible change
- notes about Inkdrop v5/v6 compatibility when relevant
- manual verification steps
- screenshots only if UI behavior changed

## Agent-Specific Notes

Before making code edits, update the plan file already designated for this session in `.plans/`. Do not create additional plan files unless explicitly instructed. If no plan file has been designated for the session, do not choose an existing one yourself; ask which plan file to use first.
