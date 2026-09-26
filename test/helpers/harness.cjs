const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const state = require("@codemirror/state");
const cm = require("@codemirror/view");

function element(tagName = "div", namespaceURI = null) {
  const classes = new Set();
  return {
    tagName,
    namespaceURI,
    dataset: {},
    attributes: {},
    children: [],
    classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle(name, force) {
        const enabled = force ?? !classes.has(name);
        if (enabled) classes.add(name);
        else classes.delete(name);
        return enabled;
      },
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

async function createHarness(config = {}) {
  const observers = [];
  const registrations = [];
  const views = [];
  const commands = new Map();
  const editorLoads = new Set();
  const openedUris = [];
  const env = { activeEditor: null, editingNote: null, layout: element() };
  const document = {
    body: element("body"),
    createElement: (tag) => element(tag),
    createElementNS: (namespace, tag) => element(tag, namespace),
    querySelector: (selector) => (selector === ".editor-layout" ? env.layout : null),
  };
  class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe(target, options) {
      this.target = target;
      this.options = options;
    }
    disconnect() {
      this.disconnected = true;
    }
    fire() {
      if (!this.disconnected) this.callback([]);
    }
  }
  class CompositeDisposable {
    constructor() {
      this.items = [];
    }
    add(...items) {
      this.items.push(...items);
    }
    dispose() {
      this.items.splice(0).forEach((item) => item.dispose());
    }
  }
  const inkdrop = {
    config: { get: (name) => config[name.split(".")[1]] ?? "" },
    getActiveEditor: () => env.activeEditor,
    store: { getState: () => ({ editingNote: env.editingNote }) },
    appDelegate: { openUri: (uri) => openedUris.push(uri) },
    commands: {
      add(target, bindings) {
        if (target !== document.body) throw new Error("Unexpected command target");
        for (const [name, run] of Object.entries(bindings)) commands.set(name, run);
        return {
          dispose: () =>
            Object.keys(bindings).forEach((name) => commands.delete(name)),
        };
      },
    },
    onEditorLoad(callback) {
      editorLoads.add(callback);
      return { dispose: () => editorLoads.delete(callback) };
    },
  };
  // Capture the production class while retaining real CodeMirror extensions,
  // keymaps, transactions, compartments, decorations, and atomic range sets.
  const viewModule = {
    ...cm,
    ViewPlugin: {
      fromClass(Class, spec) {
        const definition = cm.ViewPlugin.fromClass(Class, spec);
        registrations.push({ Class, definition });
        return definition;
      },
    },
  };
  const hostModule = { exports: {} };
  const context = vm.createContext({
    document,
    MutationObserver,
    inkdrop,
    module: hostModule,
    require(name) {
      if (name === "@codemirror/view") return viewModule;
      if (name === "@codemirror/state") return state;
      throw new Error(`Unexpected require: ${name}`);
    },
  });
  const modules = new Map();
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    if (name === "event-kit") {
      const module = new vm.SyntheticModule(
        ["CompositeDisposable"],
        function () {
          this.setExport("CompositeDisposable", CompositeDisposable);
        },
        { context }
      );
      modules.set(name, module);
      return module;
    }
    const filename = path.resolve(__dirname, "../../lib", `${name}.js`);
    const module = new vm.SourceTextModule(readFileSync(filename, "utf8"), {
      context,
      identifier: filename,
    });
    modules.set(name, module);
    await module.link((specifier) => load(specifier.replace(/^\.\//, "")));
    return module;
  }
  const main = await load("link-compact");
  await main.evaluate();
  const extension = modules.get("link-compact-extension").namespace;

  function createView(doc, { anchor = 0, vim = false, cursors = [] } = {}) {
    const instances = new Map();
    const scrollDOM = element();
    if (vim) scrollDOM.classList.add("cm-vimMode");
    scrollDOM.querySelectorAll = () => view.cursors;
    const view = {
      state: state.EditorState.create({
        doc,
        selection: { anchor },
        extensions: state.EditorState.allowMultipleSelections.of(true),
      }),
      composing: false,
      scrollDOM,
      cursors,
      dispatches: [],
      plugin: (definition) => instances.get(definition) ?? null,
      dispatch(spec) {
        const transaction = this.state.update(spec);
        const update = new cm.ViewUpdate(this, transaction.state, [transaction]);
        this.state = transaction.state;
        this.dispatches.push(transaction);
        // This is a headless view adapter, not an EditorView or a browser DOM.
        const active = this.state.facet(cm.EditorView.decorations).length > 0;
        for (const { Class, definition } of registrations) {
          const instance = instances.get(definition);
          if (!active && instance) {
            instance.destroy();
            instances.delete(definition);
          } else if (active && !instance) {
            instances.set(definition, new Class(this));
          } else if (instance) {
            instance.update(update);
          }
        }
      },
      key(name) {
        for (const bindings of this.state.facet(cm.keymap)) {
          for (const binding of bindings) {
            if (binding.key === name && binding.run(this)) return true;
          }
        }
        return false;
      },
      get instance() {
        return instances.values().next().value;
      },
      destroy() {
        for (const instance of instances.values()) instance.destroy();
        instances.clear();
      },
    };
    views.push(view);
    return view;
  }

  return {
    env,
    config,
    commands,
    editorLoads,
    openedUris,
    observers,
    document,
    extension,
    entry: hostModule.exports,
    Controller: modules.get("link-compact-controller").namespace.default,
    createView,
    compact(doc, options) {
      const view = createView(doc, options);
      extension.ensureLinkCompactExtension(view, false);
      return view;
    },
    destroy() {
      hostModule.exports.deactivate();
      views.forEach((view) => view.destroy());
    },
  };
}

function ranges(set) {
  const result = [];
  for (const cursor = set.iter(); cursor.value; cursor.next()) {
    result.push({ from: cursor.from, to: cursor.to, value: cursor.value });
  }
  return result;
}

function widgets(view) {
  return ranges(view.instance.decorations).filter(({ value }) => value.spec.widget);
}

module.exports = { createHarness, element, ranges, widgets, ...state, cm };
