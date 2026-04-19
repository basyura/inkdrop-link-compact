"use babel";

import { CompositeDisposable } from "event-kit";
import {
  ensureShortLinkExtension,
  isShortLinkEditor,
} from "./short-link-extension";

export default class ShortLinkController {
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.noteId = "";
    this.isShorten_ = false;
    this.observer = null;
  }

  activate() {
    this.subscriptions.add(
      inkdrop.commands.add(document.body, {
        "short-link:toggle": () => this.toggle(),
      })
    );

    const editor = inkdrop.getActiveEditor();
    if (editor != null) {
      this.attachEvents(editor);
    } else {
      this.subscriptions.add(inkdrop.onEditorLoad((e) => this.attachEvents(e)));
    }
  }

  deactivate() {
    this.subscriptions.dispose();
    this.disconnectObserver();
  }

  toggle() {
    this.isShorten_ = ensureShortLinkExtension(
      inkdrop.getActiveEditor(),
      this.isShorten_
    );
  }

  attachEvents(editor) {
    if (!isShortLinkEditor(editor)) {
      return;
    }

    this.isShorten_ = ensureShortLinkExtension(editor, this.isShorten_);

    const editorEle = document.querySelector(".editor-layout");
    if (editorEle == null) {
      return;
    }

    this.disconnectObserver();
    this.observer = new MutationObserver(() => this.handleEditorUpdate());
    this.observer.observe(editorEle, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  disconnectObserver() {
    if (this.observer != null) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  handleEditorUpdate() {
    const note = inkdrop.store.getState().editingNote;
    if (note == null) {
      return;
    }

    const id = note._id;
    if (this.noteId !== id) {
      this.noteId = id;
      this.isShorten_ = false;
      this.attachEvents(inkdrop.getActiveEditor());
    }
  }
}
