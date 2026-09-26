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

## 追加対応: 角括弧解析の正確性と性能

### 背景

- 対応する開始 `[` を候補ごとに逆向き検索しているため、開始括弧がない `](` が多数ある文書では解析時間が二乗で増加する。
- エスケープされた `\[` / `\]` も括弧の深さへ含めているため、正しいリンクを検出できない場合やリンク開始位置がずれる場合がある。

### 修正案

1. 文書を前方へ 1 回走査し、未対応の開始 `[` を stack で管理して各 `](` に対応する開始位置を記録する。
2. 直前に連続するバックスラッシュが奇数個の `[` / `]` はエスケープ済みとして括弧解析から除外する。
3. URL 範囲の解析では事前に構築した対応表を参照し、開始 `[` のない候補を除外する。
4. 既存のリンク表示、編集中 range、keymap の処理は維持する。

### 確認項目

- `[a \\] b](https://x.com)` が外側の `[` からリンクとして検出されること
- `[a \\[ b](https://x.com)` が外側の `[` からリンクとして検出されること
- `orphan](https://x.com)` が短縮対象にならないこと
- `[a [b] c](https://x.com)` のリンク範囲が外側の `[` から始まること
- 孤立した `](` が多数ある文書でも解析時間が文書量に対して概ね線形に増加すること
- `node --check lib/link-compact-extension.js`、package 内容確認、`git diff --check` が成功すること

### 実施状況

- [x] 修正方針の確認
- [x] 角括弧対応表の前方走査
- [x] エスケープされた角括弧の除外
- [x] 静的確認と性能確認

### 確認結果

- `[a \\] b](https://x.com)` と `[a \\[ b](https://x.com)` は、どちらも外側の `[` からリンクとして検出された。
- `orphan](https://x.com)` は短縮対象にならなかった。
- `[a [b] c](https://x.com)` は外側の `[` から検出され、画像リンクも従来どおり判定された。
- 孤立候補を 12,000 件含む 60 KB の文書は約 0.67 ms で解析され、修正前の約 707 ms から改善した。
- 10 回計測の中央値は 100 KB で約 0.70 ms、300 KB で約 1.85 ms、600 KB で約 3.78 ms、1.2 MB で約 7.51 ms となり、文書量に対して概ね線形に増加した。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。

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

## 追加対応: 開始 `[` のない候補

### 背景

- 再レビューで、`orphan](https://x.com)` のように開始 `[` がない文字列でも URL range が生成され、短縮されることを確認した。
- `lastIndexOf("[")` では、ネストした角括弧があるリンク名の対応位置を正しく判定できない。

### 修正案

1. 閉じ `]` から逆向きに角括弧の深さを追跡し、対応する開始 `[` を検出する。
2. 対応する開始 `[` が見つからない候補は range に追加しない。
3. `[a [b] c](https://x.com)` のようなネストしたリンク名では、外側の開始 `[` をリンク範囲として使用する。

### 確認項目

- `orphan](https://x.com)` が短縮対象にならないこと
- `[google](https://x.com)` が従来どおり短縮対象になること
- `[a [b] c](https://x.com)` のリンク範囲が外側の `[` から始まること
- `![image](https://x.com/image.png)` が画像リンクとして検出されること

### 実施状況

- [x] 修正方針の確認
- [x] 対応する開始 `[` の検出処理
- [x] 静的確認と Inkdrop 実機確認

### 確認結果

- `orphan](https://x.com)` では URL range、class、短縮 Widget が生成されなかった。
- `[google](https://x.com)` は従来どおりリンク全体へ class が付与され、URL が短縮された。
- `[a [b] c](https://x.com)` は外側の開始 `[` からリンク全体へ class が付与された。
- `![image](https://x.com/image.png)` は画像リンクとして検出され、画像用の短縮 Widget が使用された。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。

## 追加対応: リンク外の本文変更

### 背景

- 再レビューで、短縮リンク内にカーソルがある状態でリンク外の本文が更新されると、その短縮リンクが通常表示へ戻ることを確認した。
- 現在は `docChanged` と selection の重なりだけで編集中 range を決定しており、本文の変更位置がリンク内かを確認していない。

### 修正案

1. `ViewUpdate.changes.iterChangedRanges()` から変更後 document 上の変更範囲を取得する。
2. selection と重なるリンクのうち、変更範囲がリンク記法内へ接触したリンクだけを新しい編集中 range として採用する。
3. 既に編集中のリンクは、変更による位置移動後も同じリンクと判定できる場合に編集中状態を継続する。
4. リンク外の本文変更では、カーソルが短縮リンク内にあっても短縮表示を維持する。

### 確認項目

- 短縮リンク内にカーソルがある状態でリンク外を更新しても短縮表示を維持すること
- `[google]()` の URL 内へ文字を入力した場合は編集中状態を開始すること
- 既に編集中のリンクより前の本文が更新され、位置が移動しても編集中状態を維持すること
- リンク内の本文変更とリンク外へのカーソル移動後の短縮が従来どおり動作すること

### 実施状況

- [x] 修正方針の確認
- [x] 変更範囲とリンク範囲の接触判定
- [x] 既存編集中 range の位置追従
- [x] 静的確認と Inkdrop 実機確認

### 確認結果

- Inkdrop 内の一時 editor で、短縮リンク内にカーソルを置いたままリンク外へ文字を追加し、短縮 Widget が維持されることを確認した。
- `[a]()` の URL 内へ文字列を入力すると通常表示になり、編集中状態が開始された。
- 編集中リンクより前へ文字列を追加してリンク位置を移動させても、通常表示と編集中状態が維持された。
- カーソルをリンク外へ移動すると短縮 Widget が追加された。
- 編集中の `h` keydown は plugin に消費されず、別の短縮リンクへ移動すると両方が短縮表示になった。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。

## 追加対応: 別リンクへのカーソル移動

### 背景

- 再レビューで、編集中リンク A から短縮済みリンク B へ直接カーソルを移動すると、入力していない B が編集中 range として採用され、通常表示へ戻ることを確認した。
- selection 変更は現在の編集中リンクを継続するか終了するかの判定だけに使用し、新しい編集中リンクの開始は本文変更時に限定する必要がある。

### 修正案

1. selection が現在の編集中 range 内に留まる場合は、状態と decoration を変更しない。
2. selection が現在の編集中 range から外れた場合は、編集中 range を空にして短縮表示へ切り替える。
3. 移動先が別の完成済みリンク内でも、そのリンクを編集中 range として採用しない。

### 確認項目

- 編集中リンク A から別の短縮済みリンク B へ移動しても、B が通常表示へ戻らないこと
- 移動後は A と B の両方が短縮表示になること
- 短縮後に A または B へカーソルを戻しても短縮表示を維持すること
- 同じ編集中リンク内のカーソル移動では decoration を再生成しないこと
- 本文入力による編集中状態の開始は従来どおり動作すること

### 実施状況

- [x] 修正方針の確認
- [x] selection 遷移時の編集中状態終了処理
- [x] 静的確認と Inkdrop 実機確認

### 確認結果

- Inkdrop 内の一時 editor で、編集中リンク A から短縮済みリンク B へ直接カーソルを移動した。
- 移動後は A と B の両方に class と短縮 Widget が付与された。
- その後 A へカーソルを戻しても、A と B の短縮表示が維持された。
- A 内だけのカーソル移動では、B の短縮 Widget が同じ DOM のまま維持され、decoration が再生成されなかった。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。

## 追加対応: 編集中 URL での `h` / `l` 入力

### 背景

- plugin は短縮 URL を Vim 操作で飛び越えるため、`h` / `l` keymap を追加している。
- `[yahoo](https://)` の URL 内は通常表示になっていても、`moveAcrossCompactLink()` が検出済み range 全体を参照するため、`h` が文字入力ではなく URL 左端への移動として処理される。

### 修正案

1. `moveAcrossCompactLink()` で編集中 range を移動対象から除外する。
2. 短縮表示中の range だけは、従来どおり `h` / `l` で URL 範囲を飛び越える。
3. 編集中 range では keymap が処理を消費せず、後続の Vim plugin または CodeMirror の入力処理へ渡す。

### 確認項目

- `[yahoo](https://)` の URL 内で `h` / `l` keydown が plugin に消費されないこと
- 編集中 URL で `h` を押しても URL 左端へカーソルが移動しないこと
- 短縮表示中の URL 範囲では `h` / `l` 移動が従来どおり動作すること
- URL 入力中の短縮抑制と、リンク外へ移動した後の短縮維持が壊れていないこと

### 実施状況

- [x] 修正方針の確認
- [x] 編集中 range の keymap 対象外対応
- [x] 静的確認と Inkdrop 実機確認

### 確認結果

- Inkdrop 内の一時 editor で `[yahoo](https://)` を編集中に `h` / `l` keydown を発生させ、plugin がイベントを消費しないことを確認した。
- 編集中は `h` / `l` を押してもカーソル位置が変わらなかった。
- 短縮後は `h` で URL 左端、`l` で URL 右端へ移動し、従来の keymap 動作が維持された。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。

## 追加対応: URL 入力中の短縮抑制

### 背景

- `[google]()` の URL 部分へ `h` を入力すると、閉じ `)` が既にあるため `[google](h)` が完成済みリンクとして検出され、入力途中で短縮表示される。
- `h` は有効な相対 URL になり得るため、文字列だけから入力完了を判定することはできない。
- リンク内にカーソルまたは選択範囲がある間は編集中とみなし、リンク外へ移動した時点で短縮する。

### 修正案

1. 完成済みリンク範囲と現在の selection が重なるか判定する処理を追加する。
2. 本文入力が発生したリンクだけを一時的な編集中状態とし、class decoration、URL 置換 decoration、atomic range の対象から外す。
3. 本文変更時は従来どおりリンク範囲を再解析する。
4. selection 変更は編集中リンクから外れたかどうかの判定にだけ使用し、短縮済みリンクへカーソルを戻しても通常表示へ戻さない。
5. カーソルが閉じ `)` の直後へ移動した時点でリンク外とみなし、短縮表示へ切り替える。
6. 同じリンク内のカーソル移動では decoration を再生成しない。

### 確認項目

- `[google]()` の URL 部分へ `h` を入力しても短縮されないこと
- `[google](https://google.com)` のリンク内にカーソルがある間は短縮されないこと
- カーソルを閉じ `)` の直後または別の行へ移動すると短縮されること
- 短縮後にカーソルをリンク内へ戻しても短縮表示を維持すること
- 短縮済みリンク内で本文入力が発生した場合は、編集中として通常表示へ戻ること
- 編集中リンクの URL が atomic range に含まれないこと
- 同じリンク内の selection 変更では decoration を再生成しないこと

### 実施状況

- [x] 修正方針の確認
- [x] 編集中リンクの判定追加
- [x] decoration 更新条件の最適化
- [x] 静的確認と Inkdrop 実機確認

### 確認結果

- Inkdrop 内の一時 editor で `[google]()` の URL 部分へ `h` を入力し、短縮されないことを確認した。
- `[google](https://google.com)` のリンク内にカーソルがある間は通常表示を維持した。
- カーソルを閉じ `)` の直後へ移動すると class と短縮 Widget が追加された。
- 短縮後にカーソルを URL 内へ戻しても class と短縮 Widget が維持された。
- 短縮済みリンクへカーソルを移動しただけでは短縮を維持し、本文入力が発生すると通常表示へ戻った。
- `node --check lib/link-compact-extension.js` は成功した。
- `npm_config_cache=/tmp/link-compact-npm-cache npm pack --dry-run` は成功した。
- `git diff --check` は成功した。
