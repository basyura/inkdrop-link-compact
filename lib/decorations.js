"use babel";

// 表示部品を定義し、短縮装飾とカーソル移動用範囲を生成する関数を返す。
export function createDecorationBuilder() {
  const { Decoration, WidgetType } = require("@codemirror/view");
  const { RangeSetBuilder } = require("@codemirror/state");

  class LinkCompactWidget extends WidgetType {
    // 表示文字と元のリンク先を短縮表示部品に保持する。
    constructor(emoji, url) {
      super();
      this.emoji = emoji;
      this.url = url;
    }

    // 表示文字とリンク先を比較し、既存の表示部品を再利用できるか判定する。
    eq(other) {
      return other.emoji === this.emoji && other.url === this.url;
    }

    // 元のリンク先を持つ要素を作り、設定文字または右上向きの矢印を表示する。
    toDOM() {
      const el = document.createElement("span");
      el.className = "link-compact-mark";
      el.dataset.url = this.url;
      if (this.emoji != null && this.emoji !== "") {
        el.innerText = this.emoji;
        return el;
      }

      const namespace = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(namespace, "svg");
      svg.setAttribute("viewBox", "0 0 24 21");
      svg.setAttribute("width", "0.8em");
      svg.setAttribute("height", "0.7em");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");

      const path = document.createElementNS(namespace, "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("stroke-width", "1.5");
      path.setAttribute("d", "M3.84 20.25 19.75 4.34M19.75 19.34v-15h-15");
      svg.appendChild(path);
      el.appendChild(svg);
      return el;
    }
  }

  // 編集中のリンクを除外し、記法の置換装飾と移動時に一単位として扱う範囲を生成する。
  function buildDecorations(
    ranges,
    editingRanges,
    linkEmoji,
    notelinkEmoji,
    imglinkEmoji
  ) {
    const decorationBuilder = new RangeSetBuilder();
    const atomicRangeBuilder = new RangeSetBuilder();
    const labelBracket = Decoration.replace({});

    for (const range of ranges) {
      if (editingRanges.has(range)) {
        continue;
      }

      const { linkFrom, linkTo, labelFrom, labelTo, url, isImage } = range;
      const emoji = isImage
        ? imglinkEmoji
        : url.startsWith("inkdrop://")
          ? notelinkEmoji
          : linkEmoji;
      const replacement = Decoration.replace({
        widget: new LinkCompactWidget(emoji, url),
      });

      decorationBuilder.add(linkFrom, labelFrom, labelBracket);
      if (linkFrom != null) {
        decorationBuilder.add(
          linkFrom,
          linkTo,
          Decoration.mark({ class: "link-compact-enabled" })
        );
      }
      decorationBuilder.add(labelTo, linkTo, replacement);
      atomicRangeBuilder.add(linkFrom, labelFrom, labelBracket);
      atomicRangeBuilder.add(labelTo, linkTo, replacement);
    }

    return {
      decorations: decorationBuilder.finish(),
      atomicRanges: atomicRangeBuilder.finish(),
    };
  }

  return buildDecorations;
}
