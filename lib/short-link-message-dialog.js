"use babel";

import * as React from "react";
import { CompositeDisposable } from "event-kit";

let extensionSpec = null;

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

  class ShortLinkWidget extends WidgetType {
    constructor(emoji) {
      super();
      this.emoji = emoji;
    }

    eq(other) {
      return other.emoji === this.emoji;
    }

    toDOM() {
      const el = document.createElement("span");
      el.className = "short-link-mark";
      el.innerText = this.emoji;
      return el;
    }
  }

  function buildShortLinkRanges(docText) {
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

  function buildDecorations(ranges, emoji) {
    const builder = new RangeSetBuilder();

    for (const { from, to } of ranges) {
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new ShortLinkWidget(emoji),
        })
      );
    }

    return builder.finish();
  }

  function moveAcrossShortLink(view, direction, plugin) {
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
        this.ranges = buildShortLinkRanges(view.state.doc.toString());
        this.decorations = buildDecorations(
          this.ranges,
          inkdrop.config.get("short-link.linkEmoji")
        );
      }
    },
    {
      decorations: (value) => value.decorations,
      provide: (plugin) => [
        EditorView.atomicRanges.of((view) => {
          const instance = view.plugin(plugin);
          return instance?.decorations || Decoration.none;
        }),
        keymap.of([
          {
            key: "h",
            run: (view) => moveAcrossShortLink(view, -1, plugin),
          },
          {
            key: "l",
            run: (view) => moveAcrossShortLink(view, 1, plugin),
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
  };

  return extensionSpec;
}

function ensureShortLinkExtension(view) {
  if (
    view == null ||
    view.state == null ||
    typeof view.dispatch !== "function" ||
    typeof view.plugin !== "function"
  ) {
    return;
  }

  const { plugin, append } = getExtensionSpec();
  if (view.plugin(plugin) != null) {
    return;
  }

  view.dispatch({
    effects: append(plugin),
  });
}

export default class ShortLinkMessageDialog extends React.Component {
  componentWillMount() {
    this.subscriptions = new CompositeDisposable();

    this.subscriptions.add(
      inkdrop.commands.add(document.body, {
        "short-link:toggle": () => this.toggle(),
      })
    );

    this.noteId = "";

    const editor = inkdrop.getActiveEditor();
    if (editor != null) {
      this.attachEvents(editor);
    } else {
      this.subscriptions.add(inkdrop.onEditorLoad((e) => this.attachEvents(e)));
    }
  }

  componentWillUnmount() {
    this.subscriptions.dispose();
    if (this.observer != null) {
      this.observer.disconnect();
    }
  }

  render() {
    return <></>;
  }

  toggle() {
    ensureShortLinkExtension(inkdrop.getActiveEditor());
  }

  attachEvents = (editor) => {
    if (editor == null) {
      return;
    }

    this.editor = editor;
    ensureShortLinkExtension(editor);

    const editorEle = document.querySelector(".editor-layout");
    if (editorEle == null) {
      return;
    }
    if (this.observer != null) {
      this.observer.disconnect();
    }
    this.observer = new MutationObserver((_) => this.handleEditorUpdate());
    this.observer.observe(editorEle, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  };

  handleEditorUpdate = () => {
    const note = inkdrop.store.getState().editingNote;
    if (note == null) {
      return;
    }
    const id = note._id;
    if (this.noteId !== id) {
      this.noteId = id;
      this.attachEvents(inkdrop.getActiveEditor());
    }
  };
}
