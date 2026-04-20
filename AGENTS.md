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
- `.plans/`: working plans for repository changes

There is no dedicated `test/` directory yet.

## Build, Test, and Development Commands

No build step is defined in `package.json`. Use these commands for local checks:

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

Automated tests are not currently configured. Until a test suite exists:

- run the `node --check` commands on edited files
- run `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` after changing package metadata or shipped files
- verify behavior manually in Inkdrop v6, especially startup, note switching, and editor interactions

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `fix url regex` and `add null check`. Follow that style and keep each commit focused.

Pull requests should include:

- a short summary of the user-visible change
- notes about Inkdrop v5/v6 compatibility when relevant
- manual verification steps
- screenshots only if UI behavior changed

## Agent-Specific Notes

Before making code edits, update the plan file already designated for this session in `.plans/`. Do not create additional plan files unless explicitly instructed. If no plan file has been designated for the session, do not choose an existing one yourself; ask which plan file to use first.
