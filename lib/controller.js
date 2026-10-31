"use babel";

import { CompositeDisposable } from "event-kit";
import { ensureLinkCompactExtension, isLinkCompactEditor } from "./extension.js";

export default class LinkCompactController {
  /*
   * コマンド購読、ノート識別子、短縮状態と監視の初期値を設定する。
   */
  constructor() {
    this.subscriptions = new CompositeDisposable();
    this.noteId = "";
    this.isShorten_ = false;
    this.observer = null;
  }

  /*
   * 短縮切り替えコマンドを登録し、エディターの準備に合わせて監視を開始する。
   */
  activate() {
    this.subscriptions.add(
      inkdrop.commands.add(document.body, {
        "link-compact:toggle": () => this.toggle(),
      })
    );

    const editor = inkdrop.getActiveEditor();
    if (editor != null) {
      this.attachEvents(editor);
    } else {
      this.subscriptions.add(inkdrop.onEditorLoad((e) => this.attachEvents(e)));
    }
  }

  /*
   * コマンドとロード通知の購読、およびエディターの監視を解除する。
   */
  deactivate() {
    this.subscriptions.dispose();
    this.disconnectObserver();
  }

  /*
   * アクティブエディターの短縮表示を切り替え、結果を保持する。
   */
  toggle() {
    this.isShorten_ = ensureLinkCompactExtension(
      inkdrop.getActiveEditor(),
      this.isShorten_
    );
  }

  /*
   * 有効なエディターに短縮表示を適用し、ノート切り替えの監視を設定する。
   */
  attachEvents(editor) {
    if (!isLinkCompactEditor(editor)) {
      return;
    }

    this.isShorten_ = ensureLinkCompactExtension(editor, this.isShorten_);

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

  /*
   * 既存のエディター監視を停止して参照を解放する。
   */
  disconnectObserver() {
    if (this.observer != null) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /*
   * ノートの切り替えを検知し、新しいノートで短縮表示を有効にする。
   */
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
