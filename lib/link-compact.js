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
      description:
        "Character used to replace the hidden URL text. Leave blank for an upper-right arrow icon.",
      default: "",
    },
    notelinkEmoji: {
      title: "Note Link emoji",
      type: "string",
      description:
        "Character used to replace the hidden Note URL text. Leave blank for an upper-right arrow icon.",
      default: "",
    },
    imglinkEmoji: {
      title: "Image Link emoji",
      type: "string",
      description:
        "Character used to replace the hidden Image URL text. Leave blank for an upper-right arrow icon.",
      default: "",
    },
  },
};
