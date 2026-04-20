"use babel";

import LinkCompactController from "./link-compact-controller";

let controller = null;

module.exports = {
  activate() {
    controller = new LinkCompactController();
    controller.activate();
  },

  deactivate() {
    if (controller != null) {
      controller.deactivate();
      controller = null;
    }
  },

  config: {
    linkEmoji: {
      title: "Link emoji",
      type: "string",
      description: "Character used to replace the hidden URL text",
      default: "🔗",
    },
  },
};
