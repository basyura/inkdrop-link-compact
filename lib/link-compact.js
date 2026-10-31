"use babel";

import LinkCompactController from "./controller.js";

let controller = null;

module.exports = {
  /*
   * コントローラーを生成してプラグインの処理を開始する。
   */
  activate() {
    controller = new LinkCompactController();
    controller.activate();
  },

  /*
   * コントローラーの購読と監視を解除して参照を解放する。
   */
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
