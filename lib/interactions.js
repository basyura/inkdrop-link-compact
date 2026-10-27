"use babel";

export function createInteractionHandlers(expandLink) {
  const { Decoration, EditorView, keymap } = require("@codemirror/view");
  const { Annotation, EditorSelection, findClusterBreak, Prec } = require("@codemirror/state");
  const visualCursor = Annotation.define();

  function rememberVisualChange(update, instance) {
    const cm = update.view.cm;
    const vim = cm?.state?.vim;
    if (update.docChanged || instance.pendingVisualChange?.operation !== cm?.curOp) {
      instance.pendingVisualChange = null;
    }
    if (
      !update.docChanged || update.view.composing || !cm?.curOp?.isVimOp ||
      !vim?.visualMode || vim.insertMode || vim.visualLine || vim.visualBlock ||
      vim.lastEditInputState?.operator !== "change"
    ) return;

    for (const transaction of update.transactions) {
      const selection = transaction.startState.selection;
      if (selection.ranges.length !== 1 || selection.main.empty) continue;
      const doc = transaction.startState.doc;
      const offset = (pos) => {
        const line = doc.line(pos.line + 1);
        return line.from + Math.min(pos.ch, line.length);
      };
      const logicalFrom = Math.min(offset(vim.sel.anchor), offset(vim.sel.head));
      if (logicalFrom <= selection.main.from) continue;
      const changes = [];
      transaction.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
        changes.push({ fromA, toA, fromB, inserted });
      });
      if (changes.length !== 1) continue;
      const change = changes[0];
      if (
        change.fromA !== selection.main.from || change.toA !== selection.main.to ||
        change.inserted.length !== 0
      ) continue;
      const oldLine = doc.lineAt(logicalFrom);
      const newLine = transaction.newDoc.lineAt(change.fromB);
      instance.pendingVisualChange = {
        operation: cm.curOp,
        head: change.fromB,
        requestedHead: newLine.from + Math.min(logicalFrom - oldLine.from, newLine.length),
      };
    }
  }

  function syncVisualCursor(update, instance) {
    rememberVisualChange(update, instance);
    const vim = update.view.cm?.state?.vim;
    if (update.docChanged || update.selectionSet) instance.visualHead = null;
    if (!vim?.visualMode || vim.visualLine || vim.visualBlock) return;
    for (const transaction of update.transactions) {
      const head = transaction.annotation(visualCursor);
      if (head == null) continue;
      const line = update.state.doc.lineAt(head);
      vim.sel.head = { line: line.number - 1, ch: head - line.from };
      instance.visualHead = head;
    }
  }

  function activateCompactLink(view, plugin) {
    const selection = view.state.selection;
    if (view.composing || !selection.main.empty || selection.ranges.length !== 1) {
      return false;
    }

    const instance = view.plugin(plugin);
    if (instance == null) {
      return false;
    }

    const head = selection.main.head;
    const range = instance.ranges.find(
      (candidate) =>
        !instance.editingRanges.has(candidate) &&
        (candidate.isImage
          ? head > candidate.linkFrom && head < candidate.linkTo
          : head >= candidate.labelFrom && head <= candidate.labelTo)
    );
    if (range == null) {
      return false;
    }

    if (range.isImage) {
      view.dispatch({
        effects: expandLink.of(range.linkFrom),
        selection: { anchor: range.linkFrom + 1 },
        scrollIntoView: true,
      });
    } else {
      inkdrop.appDelegate.openUri(range.url);
    }
    return true;
  }

  function revealBracketBeforeDelete(view, direction, plugin) {
    const selection = view.state.selection;
    if (view.composing || !selection.main.empty || selection.ranges.length !== 1) {
      return false;
    }

    const instance = view.plugin(plugin);
    if (instance == null) {
      return false;
    }

    const head = selection.main.head;
    const range = instance.ranges.find((candidate) => {
      if (instance.editingRanges.has(candidate)) {
        return false;
      }

      return direction < 0
        ? head === candidate.labelFrom || head === candidate.linkTo
        : head === candidate.labelTo;
    });
    if (range == null) {
      return false;
    }

    view.dispatch({
      effects: expandLink.of(range.linkFrom),
    });
    return true;
  }

  function filterCompactNewline(view, transaction, plugin) {
    if (
      !transaction.docChanged ||
      !transaction.isUserEvent("input") ||
      transaction.startState !== view.state ||
      view.composing ||
      !view.scrollDOM.classList.contains("cm-vimMode") ||
      view.dom.classList.contains("vim-mode-visual") ||
      view.dom.classList.contains("vim-mode-replace")
    ) {
      return transaction;
    }

    const instance = view.plugin(plugin);
    if (instance == null) return transaction;

    const changes = [];
    transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      changes.push({ fromA, toA, fromB, toB, inserted });
    });
    if (changes.length !== 1) return transaction;

    const { fromA, toA, fromB, toB, inserted } = changes[0];
    if (fromA !== toA || inserted.sliceString(0, 1) !== "\n") {
      return transaction;
    }

    const selection = transaction.newSelection;
    const cursorOffset = selection.main.head - fromB;
    if (
      selection.ranges.length !== 1 ||
      !selection.main.empty ||
      cursorOffset < 1 ||
      cursorOffset > inserted.length
    ) {
      return transaction;
    }

    const lineEnd = transaction.startState.doc.lineAt(fromA).to;
    const range = instance.ranges.find(
      (candidate) =>
        !instance.editingRanges.has(candidate) &&
        candidate.labelTo <= fromA &&
        fromA < candidate.linkTo &&
        candidate.linkTo === lineEnd
    );
    if (range == null) return transaction;

    return [
      transaction,
      {
        changes: [
          { from: fromB, to: toB, insert: "" },
          { from: lineEnd + inserted.length, insert: inserted },
        ],
        selection: { anchor: lineEnd + cursorOffset },
        sequential: true,
      },
    ];
  }

  function filterCompactSelection(view, transaction, plugin) {
    if (transaction.docChanged) {
      return filterCompactNewline(view, transaction, plugin);
    }
    if (
      !transaction.selection ||
      transaction.effects.length ||
      view.composing ||
      transaction.startState !== view.state
    ) {
      return transaction;
    }

    const instance = view.plugin(plugin);
    if (instance == null) return transaction;

    const pendingChange = instance.pendingVisualChange;
    if (
      pendingChange != null && pendingChange.operation === view.cm?.curOp &&
      view.cm?.state?.vim?.insertMode &&
      transaction.selection.ranges.length === 1 && transaction.selection.main.empty &&
      transaction.selection.main.head === pendingChange.requestedHead
    ) {
      return [transaction, { selection: { anchor: pendingChange.head } }];
    }

    const blockCursor = view.scrollDOM.classList.contains("cm-vimMode");
    // The Vim extension optionally attaches its adapter to EditorView.
    const vim = view.cm?.state?.vim;
    const visual = blockCursor && vim?.visualMode && !vim.insertMode && !vim.visualLine &&
      !vim.visualBlock && view.cm?.curOp?.isVimOp &&
      transaction.selection.ranges.length === 1;
    const doc = transaction.startState.doc;
    const step = (pos, forward) => {
      const line = doc.lineAt(pos);
      if (forward ? pos === line.to : pos === line.from) {
        return Math.max(0, Math.min(doc.length, pos + (forward ? 1 : -1)));
      }
      return line.from + findClusterBreak(line.text, pos - line.from, forward);
    };
    let changed = false;
    let correctedVisualHead;
    const ranges = transaction.selection.ranges.map((selection, index) => {
      if (!selection.empty && !visual) return selection;
      const previous = transaction.startState.selection.ranges[index];
      const cursorHead = (range) => range.head -
        (visual && range.anchor < range.head &&
          (range.head === doc.length || doc.sliceString(range.head, range.head + 1) !== "\n")
          ? 1 : 0);
      const oldHead = visual && instance.visualHead != null
        ? instance.visualHead
        : previous ? cursorHead(previous) : cursorHead(selection);
      const visualLine = visual ? doc.line(vim.sel.head.line + 1) : null;
      const requestedHead = visual
        ? visualLine.from + Math.min(vim.sel.head.ch, visualLine.length)
        : selection.head;
      const forward = requestedHead >= oldHead;
      let head = requestedHead;

      // A correction can land on the bracket of an adjacent link.
      for (let pass = 0; pass <= instance.ranges.length; pass += 1) {
        const before = head;
        for (const range of instance.ranges) {
          if (instance.editingRanges.has(range)) continue;
          const { linkFrom, labelFrom, labelTo, linkTo } = range;
          if (head === linkFrom && instance.pendingInsertBefore === linkFrom) {
            continue;
          }
          if (head >= linkFrom && head < labelFrom) {
            const previousChar = step(linkFrom, false);
            head =
              !forward && (blockCursor || oldHead === labelFrom) && previousChar < linkFrom
                ? previousChar
                : labelFrom;
          } else if (head > labelTo && head < linkTo) {
            head = forward ? linkTo : labelTo;
          }
          if (
            blockCursor &&
            !instance.pendingOpenLine &&
            head === linkTo &&
            head === doc.lineAt(head).to
          ) {
            head = labelTo;
          }
        }
        if (head === before) break;
      }
      if (visual) {
        changed = true;
        correctedVisualHead = head;
        const anchorLine = doc.line(vim.sel.anchor.line + 1);
        const anchor = anchorLine.from + Math.min(vim.sel.anchor.ch, anchorLine.length);
        const selected = head === requestedHead ? selection : EditorSelection.range(
          Math.min(anchorLine.to, anchor + (head < anchor ? 1 : 0)),
          Math.min(doc.lineAt(head).to, head + (head >= anchor ? 1 : 0))
        );
        let { from, to } = selected;
        for (const range of instance.ranges) {
          if (instance.editingRanges.has(range)) continue;
          // Selecting the icon includes its entire hidden Markdown source.
          if (to > range.labelTo && to < range.linkTo) to = range.linkTo;
          if (from === range.labelFrom && to > range.labelTo) from = range.linkFrom;
        }
        return selected.anchor <= selected.head
          ? EditorSelection.range(from, to)
          : EditorSelection.range(to, from);
      }
      if (head === requestedHead) return selection;
      changed = true;
      return EditorSelection.cursor(head, forward ? 1 : -1);
    });

    return changed
      ? [
          transaction,
          {
            selection: EditorSelection.create(ranges, transaction.selection.mainIndex),
            annotations: correctedVisualHead == null ? [] : visualCursor.of(correctedVisualHead),
          },
        ]
      : transaction;
  }

  function provide(pluginInstance) {
    return [
      Prec.highest(
        EditorView.domEventHandlers({
          keydown(event, view) {
            const instance = view.plugin(pluginInstance);
            if (instance != null) {
              instance.pendingInsertBefore = null;
              const selection = view.state.selection;
              if (
                event.key === "i" &&
                !event.ctrlKey && !event.altKey && !event.metaKey &&
                !view.composing &&
                view.scrollDOM.classList.contains("cm-vimMode") &&
                !view.dom.classList.contains("vim-mode-insert") &&
                !view.dom.classList.contains("vim-mode-visual") &&
                !view.dom.classList.contains("vim-mode-replace") &&
                selection.ranges.length === 1 && selection.main.empty
              ) {
                const range = instance.ranges.find((candidate) =>
                  candidate.labelFrom === selection.main.head &&
                  !instance.editingRanges.has(candidate)
                );
                if (range != null) {
                  instance.pendingInsertBefore = range.linkFrom;
                  view.dispatch({ selection: { anchor: range.linkFrom } });
                }
              }
              instance.pendingOpenLine =
                !view.composing &&
                view.scrollDOM.classList.contains("cm-vimMode") &&
                !view.dom.classList.contains("vim-mode-visual") &&
                !view.dom.classList.contains("vim-mode-replace") &&
                (event.key === "o" || event.key === "O") &&
                !event.ctrlKey &&
                !event.altKey &&
                !event.metaKey;
            }
            return false;
          },
        })
      ),
      EditorView.atomicRanges.of((view) => {
        const instance = view.plugin(pluginInstance);
        return instance?.atomicRanges || Decoration.none;
      }),
      Prec.high(
        keymap.of([
          {
            key: "Enter",
            run: (view) => activateCompactLink(view, pluginInstance),
            stopPropagation: true,
          },
          {
            key: "Backspace",
            run: (view) => revealBracketBeforeDelete(view, -1, pluginInstance),
          },
          {
            key: "Delete",
            run: (view) => revealBracketBeforeDelete(view, 1, pluginInstance),
          },
        ])
      ),
    ];
  }

  return { provide, filterCompactSelection, syncVisualCursor };
}
