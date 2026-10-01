"use babel";

export function createInteractionHandlers(expandLink) {
  const { Decoration, EditorView, keymap } = require("@codemirror/view");
  const { EditorSelection, findClusterBreak, Prec } = require("@codemirror/state");

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

    const blockCursor = view.scrollDOM.classList.contains("cm-vimMode");
    const doc = transaction.startState.doc;
    const step = (pos, forward) => {
      const line = doc.lineAt(pos);
      if (forward ? pos === line.to : pos === line.from) {
        return Math.max(0, Math.min(doc.length, pos + (forward ? 1 : -1)));
      }
      return line.from + findClusterBreak(line.text, pos - line.from, forward);
    };
    let changed = false;
    const ranges = transaction.selection.ranges.map((selection, index) => {
      if (!selection.empty) return selection;
      const previous = transaction.startState.selection.ranges[index];
      const oldHead = previous?.head ?? selection.head;
      const forward = selection.head >= oldHead;
      let head = selection.head;

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
      if (head === selection.head) return selection;
      changed = true;
      return EditorSelection.cursor(head, forward ? 1 : -1);
    });

    return changed
      ? [
          transaction,
          { selection: EditorSelection.create(ranges, transaction.selection.mainIndex) },
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

  return { provide, filterCompactSelection };
}
