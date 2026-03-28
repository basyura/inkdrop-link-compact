"use babel";

import * as React from "react";
import { CompositeDisposable } from "event-kit";

let extensionSpec = null;

function getExtensionSpec() {
  if (extensionSpec != null) {
    return extensionSpec;
  }

  const { Decoration, WidgetType, ViewPlugin } = require("@codemirror/view");
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

  function buildDecorations(view) {
    const builder = new RangeSetBuilder();
    const docText = view.state.doc.toString();
    const emoji = inkdrop.config.get("short-link.linkEmoji");
    const urlRe = /\]\(.*?\)/gim;
    let match;

    while ((match = urlRe.exec(docText))) {
      const from = match.index + 2;
      const to = urlRe.lastIndex - 1;

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

  const plugin = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view);
      }

      update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
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
