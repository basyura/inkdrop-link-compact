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
      default: "🌐",
    },
    notelinkEmoji: {
      title: "Note Link emoji",
      type: "string",
      description: "Character used to replace the hidden Note URL text",
      default: "📓",
    },
    imglinkEmoji: {
      title: "Image Link emoji",
      type: "string",
      description: "Character used to replace the hidden Image URL text",
      default: "🖼️",
    },
  },
};
