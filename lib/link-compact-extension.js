"use babel";

let extensionSpec = null;

function buildLinkLabelStarts(docText) {
  const bracketStack = [];
  const labelStarts = new Map();
  let backslashCount = 0;

  for (let cursor = 0; cursor < docText.length; cursor += 1) {
    const char = docText[cursor];
    const isEscaped = backslashCount % 2 === 1;

    if (!isEscaped && char === "[") {
      bracketStack.push(cursor);
    } else if (!isEscaped && char === "]") {
      const bracketStart = bracketStack.pop();
      if (bracketStart != null && docText[cursor + 1] === "(") {
        labelStarts.set(cursor, bracketStart);
      }
    }

    backslashCount = char === "\\" ? backslashCount + 1 : 0;
  }

  return labelStarts;
}

function buildLinkCompactRanges(docText) {
  const ranges = [];
  const labelStarts = buildLinkLabelStarts(docText);
  let searchFrom = 0;

  while (searchFrom < docText.length) {
    const linkStart = docText.indexOf("](", searchFrom);
    if (linkStart === -1) {
      break;
    }

    const urlStart = linkStart + 2;
    const bracketStart = labelStarts.get(linkStart);
    const isImage = bracketStart > 0 && docText[bracketStart - 1] === "!";
    let cursor = urlStart;
    let depth = 1;

    while (cursor < docText.length) {
      const char = docText[cursor];

      if (char === "\n" || char === "\r") {
        break;
      }

      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          if (cursor > urlStart && bracketStart != null) {
            ranges.push({
              from: urlStart,
              to: cursor,
              linkFrom: isImage ? bracketStart - 1 : bracketStart,
              linkTo: cursor + 1,
              labelFrom: bracketStart + 1,
              labelTo: linkStart,
              url: docText.slice(urlStart, cursor),
              isImage,
            });
          }
          cursor += 1;
          break;
        }
      }

      cursor += 1;
    }

    searchFrom = cursor > urlStart ? cursor : urlStart;
  }

  return ranges;
}

function isLinkBeingEdited({ linkFrom, linkTo }, selection) {
  if (linkFrom == null) {
    return false;
  }

  return selection.ranges.some(({ from, to }) =>
    from === to ? from > linkFrom && from < linkTo : from < linkTo && to > linkFrom
  );
}

function getEditingRanges(ranges, selection, includeRange = null) {
  const editingRanges = new Set();
  const editingRangeKeys = [];

  for (const range of ranges) {
    if (
      isLinkBeingEdited(range, selection) &&
      (includeRange == null || includeRange(range))
    ) {
      editingRanges.add(range);
      editingRangeKeys.push(`${range.from}:${range.to}`);
    }
  }

  return {
    editingRanges,
    editingRangeKey: editingRangeKeys.join(","),
  };
}

function getChangedRanges(changes) {
  const ranges = [];
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    ranges.push({ from: fromB, to: toB });
  });
  return ranges;
}

function isLinkChanged({ linkFrom, linkTo }, changedRanges) {
  if (linkFrom == null) {
    return false;
  }

  return changedRanges.some(({ from, to }) =>
    from === to ? from > linkFrom && from < linkTo : from < linkTo && to > linkFrom
  );
}

function isContinuedEditingRange(range, editingRanges, changes) {
  if (range.linkFrom == null) {
    return false;
  }

  for (const editingRange of editingRanges) {
    if (
      editingRange.linkFrom != null &&
      range.linkFrom === changes.mapPos(editingRange.linkFrom, 1) &&
      range.linkTo === changes.mapPos(editingRange.linkTo, -1)
    ) {
      return true;
    }
  }

  return false;
}

function isEditorView(view) {
  return (
    view != null &&
    view.state != null &&
    typeof view.dispatch === "function" &&
    typeof view.plugin === "function"
  );
}

export function ensureLinkCompactExtension(view, isShorten) {
  if (!isEditorView(view)) {
    return isShorten;
  }

  const { compartment, extension, append, reconfigure, clear } = getExtensionSpec();
  if (isShorten) {
    view.dispatch({
      effects: clear(),
    });
    return false;
  }

  if (compartment.get(view.state) != null) {
    view.dispatch({
      effects: reconfigure(extension),
    });
    return true;
  }

  view.dispatch({
    effects: append(extension),
  });
  return true;
}

export function isLinkCompactEditor(view) {
  return isEditorView(view);
}

function getExtensionSpec() {
  if (extensionSpec != null) {
    return extensionSpec;
  }

  const {
    Decoration,
    EditorView,
    keymap,
    WidgetType,
    ViewPlugin,
  } = require("@codemirror/view");
  const {
    Compartment,
    Prec,
    RangeSetBuilder,
    StateEffect,
  } = require("@codemirror/state");
  const expandImageLink = StateEffect.define();

  class LinkCompactWidget extends WidgetType {
    constructor(emoji, url) {
      super();
      this.emoji = emoji;
      this.url = url;
    }

    eq(other) {
      return other.emoji === this.emoji && other.url === this.url;
    }

    toDOM() {
      const el = document.createElement("span");
      el.className = "link-compact-mark";
      el.dataset.url = this.url;
      if (this.emoji != null && this.emoji !== "") {
        el.innerText = this.emoji;
        return el;
      }

      const namespace = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(namespace, "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("width", "1em");
      svg.setAttribute("height", "1em");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");

      const path = document.createElementNS(namespace, "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("d", "M3.84 20.25 19.75 4.34M19.75 19.34v-15h-15");
      svg.appendChild(path);
      el.appendChild(svg);
      return el;
    }
  }

  function buildDecorations(
    ranges,
    editingRanges,
    linkEmoji,
    notelinkEmoji,
    imglinkEmoji
  ) {
    const decorationBuilder = new RangeSetBuilder();
    const atomicRangeBuilder = new RangeSetBuilder();

    for (const range of ranges) {
      if (editingRanges.has(range)) {
        continue;
      }

      const { from, to, linkFrom, linkTo, url, isImage } = range;
      const emoji = isImage
        ? imglinkEmoji
        : url.startsWith("inkdrop://")
          ? notelinkEmoji
          : linkEmoji;
      const replacement = Decoration.replace({
        widget: new LinkCompactWidget(emoji, url),
      });

      if (linkFrom != null) {
        decorationBuilder.add(
          linkFrom,
          linkTo,
          Decoration.mark({ class: "link-compact-enabled" })
        );
      }
      decorationBuilder.add(from, to, replacement);
      atomicRangeBuilder.add(from, to, replacement);
    }

    return {
      decorations: decorationBuilder.finish(),
      atomicRanges: atomicRangeBuilder.finish(),
    };
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
        effects: expandImageLink.of(null),
        selection: { anchor: range.linkFrom + 1 },
        scrollIntoView: true,
      });
    } else {
      inkdrop.appDelegate.openUri(range.url);
    }
    return true;
  }

  function moveAcrossCompactLink(view, direction, plugin) {
    const selection = view.state.selection;
    if (!selection.main.empty || selection.ranges.length !== 1) {
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

      const { from, to } = candidate;
      return direction > 0 ? head >= from && head < to : head > from && head <= to;
    });
    if (range == null) {
      return false;
    }

    view.dispatch({
      selection: { anchor: direction > 0 ? range.to : range.from },
      scrollIntoView: true,
      userEvent: "select.cursor",
    });
    return true;
  }

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.updateRanges(view, null);
      }

      update(update) {
        if (update.docChanged) {
          this.updateRanges(update.view, update.changes);
        } else if (update.selectionSet && this.editingRangeKey !== "") {
          this.updateEditingRanges(update.view);
        }

        if (
          update.transactions.some((transaction) =>
            transaction.effects.some((effect) => effect.is(expandImageLink))
          )
        ) {
          const { editingRanges, editingRangeKey } = getEditingRanges(
            this.ranges,
            update.state.selection,
            (range) => range.isImage
          );
          this.editingRanges = editingRanges;
          this.editingRangeKey = editingRangeKey;
          this.updateDecorations();
        }
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
      provide: (pluginInstance) => [
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
          ])
        ),
        keymap.of([
          {
            key: "h",
            run: (view) => moveAcrossCompactLink(view, -1, pluginInstance),
          },
          {
            key: "l",
            run: (view) => moveAcrossCompactLink(view, 1, pluginInstance),
          },
        ]),
      ],
    }
  );

  const compartment = new Compartment();
  const extension = [plugin];

  extensionSpec = {
    compartment,
    extension,
    append: (extension) => StateEffect.appendConfig.of(compartment.of(extension)),
    reconfigure: (extension) => compartment.reconfigure(extension),
    clear: () => compartment.reconfigure([]),
  };

  return extensionSpec;
}
