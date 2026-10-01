"use babel";

import { buildLinkCompactRanges } from "./parser";
import {
  getEditingRanges,
  getChangedRanges,
  isLinkChanged,
  isContinuedEditingRange,
} from "./editing";
import { createDecorationBuilder } from "./decorations";

export function createLinkCompactPlugin(expandLink, provide) {
  const { ViewPlugin } = require("@codemirror/view");
  const buildDecorations = createDecorationBuilder();

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.pendingOpenLine = false;
        this.pendingInsertBefore = null;
        this.updateRanges(view, null);
        this.cursorObserver = new MutationObserver(() => this.updateCursorLabels(view));
        this.cursorObserver.observe(view.scrollDOM, { childList: true, subtree: true });
        this.updateCursorLabels(view);
      }

      update(update) {
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
              transaction.effects.some((effect) =>
                effect.is(expandLink) && effect.value === range.linkFrom
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

      updateCursorLabels(view) {
        const cursors = view.scrollDOM.querySelectorAll(".cm-vimCursorLayer .cm-fat-cursor");
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
            (head === view.state.doc.length || view.state.sliceDoc(head, head + 1) !== "\n")
          ) {
            head -= 1;
          }
          const hidden = this.ranges.some((range) =>
            !this.editingRanges.has(range) &&
            ((head >= range.linkFrom && head < range.labelFrom) ||
              (head >= range.labelTo && head < range.linkTo))
          );
          cursor.classList.toggle("link-compact-hidden-cursor-text", hidden);
        }
      }

      destroy() {
        this.cursorObserver.disconnect();
        // Vim owns the cursor nodes, so leave their appearance intact on removal.
        this.cursorElements?.forEach((cursor) =>
          cursor.classList.remove("link-compact-hidden-cursor-text")
        );
      }

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
