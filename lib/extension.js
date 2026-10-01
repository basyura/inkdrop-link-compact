"use babel";

import { createLinkCompactPlugin } from "./view-plugin";
import { createInteractionHandlers } from "./interactions";

let extensionSpec = null;

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
      effects: reconfigure(extension(view)),
    });
  } else {
    view.dispatch({
      effects: append(extension(view)),
    });
  }
  view.dispatch({ selection: view.state.selection });
  return true;
}

export function isLinkCompactEditor(view) {
  return isEditorView(view);
}

function getExtensionSpec() {
  if (extensionSpec != null) {
    return extensionSpec;
  }

  const { Compartment, EditorState, StateEffect } = require("@codemirror/state");
  const expandLink = StateEffect.define();
  const { provide, filterCompactSelection } = createInteractionHandlers(expandLink);
  const plugin = createLinkCompactPlugin(expandLink, provide);

  const compartment = new Compartment();
  const extension = (view) => [
    plugin,
    EditorState.transactionFilter.of((transaction) =>
      filterCompactSelection(view, transaction, plugin)
    ),
  ];

  extensionSpec = {
    compartment,
    extension,
    append: (extension) => StateEffect.appendConfig.of(compartment.of(extension)),
    reconfigure: (extension) => compartment.reconfigure(extension),
    clear: () => compartment.reconfigure([]),
  };

  return extensionSpec;
}
