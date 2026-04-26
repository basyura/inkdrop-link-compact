"use babel";

let extensionSpec = null;

function buildLinkCompactRanges(docText) {
  const ranges = [];
  let searchFrom = 0;

  while (searchFrom < docText.length) {
    const linkStart = docText.indexOf("](", searchFrom);
    if (linkStart === -1) {
      break;
    }

    const urlStart = linkStart + 2;
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
          if (cursor > urlStart) {
            ranges.push({
              from: urlStart,
              to: cursor,
              url: docText.slice(urlStart, cursor),
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

  const { compartment, plugin, append, reconfigure, clear } = getExtensionSpec();
  if (isShorten) {
    view.dispatch({
      effects: clear(),
    });
    return false;
  }

  if (compartment.get(view.state) != null) {
    view.dispatch({
      effects: reconfigure(plugin),
    });
    return true;
  }

  view.dispatch({
    effects: append(plugin),
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
  const { Compartment, RangeSetBuilder, StateEffect } = require("@codemirror/state");

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
      el.innerText = this.emoji;
      return el;
    }
  }

  function buildDecorations(ranges, emoji) {
    const builder = new RangeSetBuilder();

    for (const { from, to, url } of ranges) {
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new LinkCompactWidget(emoji, url),
        })
      );
    }

    return builder.finish();
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
    const range = instance.ranges.find(({ from, to }) =>
      direction > 0 ? head >= from && head < to : head > from && head <= to
    );
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
        this.updateRanges(view);
      }

      update(update) {
        if (update.docChanged) {
          this.updateRanges(update.view);
        }
      }

      updateRanges(view) {
        this.ranges = buildLinkCompactRanges(view.state.doc.toString());
        this.decorations = buildDecorations(
          this.ranges,
          inkdrop.config.get("link-compact.linkEmoji")
        );
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (pluginInstance) => [
        EditorView.atomicRanges.of((view) => {
          const instance = view.plugin(pluginInstance);
          return instance?.decorations || Decoration.none;
        }),
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

  extensionSpec = {
    compartment,
    plugin,
    append: (extension) => StateEffect.appendConfig.of(compartment.of(extension)),
    reconfigure: (extension) => compartment.reconfigure(extension),
    clear: () => compartment.reconfigure([]),
  };

  return extensionSpec;
}
