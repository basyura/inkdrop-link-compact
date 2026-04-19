"use babel";

import ShortLinkController from "./short-link-message-dialog";

let controller = null;

module.exports = {
  activate() {
    controller = new ShortLinkController();
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
      description: "Character used to substitute instead of the URL",
      default: "🔗",
    },
  },
};
