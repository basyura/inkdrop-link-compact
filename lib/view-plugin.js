"use babel";

import { buildLinkCompactRanges } from "./parser.js";
import {
  getEditingRanges,
  getChangedRanges,
  isLinkChanged,
  isContinuedEditingRange,
} from "./editing.js";
import { createDecorationBuilder } from "./decorations.js";

/*
 * エディターごとにリンク範囲、編集状態、短縮装飾とカーソル監視を管理する拡張を生成する。
 */
export function createLinkCompactPlugin(expandLink, provide, syncVisualCursor) {
  const { ViewPlugin } = require("@codemirror/view");
  const buildDecorations = createDecorationBuilder();

  const plugin = ViewPlugin.fromClass(
    class {
      /*
       * 編集状態と表示を初期化し、Vim カーソル要素の変化を監視する。
       */
      constructor(view) {
        this.visualHead = null;
        this.pendingVisualChange = null;
        this.pendingOpenLine = false;
        this.pendingInsertBefore = null;
        this.updateRanges(view, null);
        this.cursorObserver = new MutationObserver(() =>
          this.updateCursorLabels(view)
        );
        this.cursorObserver.observe(view.scrollDOM, {
          childList: true,
          subtree: true,
        });
        this.updateCursorLabels(view);
      }

      /*
       * 文書変更、選択変更、展開要求に応じて編集状態と表示を更新する。
       */
      update(update) {
        syncVisualCursor(update, this);
        if (update.docChanged) {
          this.pendingOpenLine = false;
          this.pendingInsertBefore = null;
          this.updateRanges(update.view, update.changes);
        } else if (update.selectionSet && this.editingRangeKey !== "") {
          this.updateEditingRanges(update.view);
        }

        if (
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(expandLink))
          )
        ) {
          const expandedRanges = this.ranges.filter((range) =>
            update.transactions.some((transaction) =>
              transaction.effects.some(
                (effect) => effect.is(expandLink) && effect.value === range.linkFrom
              )
            )
          );
          this.editingRanges = new Set(expandedRanges);
          this.editingRangeKey = expandedRanges
            .map((range) => `${range.from}:${range.to}`)
            .join(",");
          this.updateDecorations();
        }
        this.updateCursorLabels(update.view);
      }

      /*
       * 非表示記法上の Vim カーソルにクラスを付け、隠れた文字の描画を抑える。
       */
      updateCursorLabels(view) {
        const cursors = view.scrollDOM.querySelectorAll(
          ".cm-vimCursorLayer .cm-fat-cursor"
        );
        this.cursorElements = cursors;
        const selections = view.state.selection.ranges;
        let cursorIndex = 0;
        for (let index = 0; index < selections.length; index += 1) {
          const cursor = cursors[cursorIndex];
          if (!cursor) break;
          const primary = index === view.state.selection.mainIndex;
          if (cursor.classList.contains("cm-cursor-primary") !== primary) continue;
          cursorIndex += 1;
          const selection = selections[index];
          let head = selection.head;
          if (
            selection.anchor < head &&
            (head === view.state.doc.length ||
              view.state.sliceDoc(head, head + 1) !== "\n")
          ) {
            head -= 1;
          }
          const hidden = this.ranges.some(
            (range) =>
              !this.editingRanges.has(range) &&
              ((head >= range.linkFrom && head < range.labelFrom) ||
                (head >= range.labelTo && head < range.linkTo))
          );
          cursor.classList.toggle("link-compact-hidden-cursor-text", hidden);
        }
      }

      /*
       * カーソル監視を停止し、カーソル要素に付けた表示制御クラスを取り除く。
       */
      destroy() {
        this.cursorObserver.disconnect();
        // Vim owns the cursor nodes, so leave their appearance intact on removal.
        this.cursorElements?.forEach((cursor) =>
          cursor.classList.remove("link-compact-hidden-cursor-text")
        );
      }

      /*
       * 文書のリンクを再解析し、変更箇所と継続中の編集を基に展開状態を更新する。
       */
      updateRanges(view, changes) {
        const previousEditingRanges = this.editingRanges || new Set();
        this.ranges = buildLinkCompactRanges(view.state.doc.toString());
        if (changes != null) {
          const changedRanges = getChangedRanges(changes);
          const { editingRanges, editingRangeKey } = getEditingRanges(
            this.ranges,
            view.state.selection,
            (range) =>
              isLinkChanged(range, changedRanges) ||
              isContinuedEditingRange(range, previousEditingRanges, changes)
          );
          this.editingRanges = editingRanges;
          this.editingRangeKey = editingRangeKey;
        } else {
          this.editingRanges = new Set();
          this.editingRangeKey = "";
        }
        this.updateDecorations();
      }

      /*
       * 選択に対応する編集範囲が変わったら、展開状態を解除して短縮表示に戻す。
       */
      updateEditingRanges(view) {
        const { editingRangeKey } = getEditingRanges(
          this.ranges,
          view.state.selection
        );
        if (editingRangeKey === this.editingRangeKey) {
          return;
        }

        this.editingRanges = new Set();
        this.editingRangeKey = "";
        this.updateDecorations();
      }

      /*
       * 現在の編集範囲とアイコン設定から、表示装飾と移動用範囲を再生成する。
       */
      updateDecorations() {
        const { decorations, atomicRanges } = buildDecorations(
          this.ranges,
          this.editingRanges,
          inkdrop.config.get("link-compact.linkEmoji"),
          inkdrop.config.get("link-compact.notelinkEmoji"),
          inkdrop.config.get("link-compact.imglinkEmoji")
        );
        this.decorations = decorations;
        this.atomicRanges = atomicRanges;
      }
    },
    {
      decorations: (value) => value.decorations,
      provide,
    }
  );
  return plugin;
}
