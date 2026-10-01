"use babel";

function buildCodeRanges(docText) {
  const fenceRanges = [];
  let fenceStart = null;
  let fenceLength = 0;
  let lineStart = 0;

  while (lineStart < docText.length) {
    const lineEnd = docText.indexOf("\n", lineStart);
    const nextLine = lineEnd === -1 ? docText.length : lineEnd + 1;
    const line = docText.slice(lineStart, lineEnd === -1 ? nextLine : lineEnd);
    if (fenceStart == null) {
      const opening = /^ {0,3}(`{3,})[^`\r]*\r?$/.exec(line);
      if (opening) {
        fenceStart = lineStart;
        fenceLength = opening[1].length;
      }
    } else {
      const closing = /^ {0,3}(`{3,})[ \t]*\r?$/.exec(line);
      if (closing && closing[1].length >= fenceLength) {
        fenceRanges.push({ from: fenceStart, to: nextLine });
        fenceStart = null;
      }
    }
    lineStart = nextLine;
  }
  if (fenceStart != null) {
    fenceRanges.push({ from: fenceStart, to: docText.length });
  }

  const ranges = [...fenceRanges];
  let cursor = 0;
  let fenceIndex = 0;
  while (cursor < docText.length) {
    const fence = fenceRanges[fenceIndex];
    if (fence && cursor >= fence.from) {
      cursor = fence.to;
      fenceIndex += 1;
      continue;
    }
    if (docText[cursor] !== "`") {
      cursor += 1;
      continue;
    }

    const start = cursor;
    while (docText[cursor] === "`") cursor += 1;
    const length = cursor - start;
    const limit = fence ? fence.from : docText.length;
    let end = cursor;
    while (end < limit) {
      end = docText.indexOf("`", end);
      if (end === -1 || end >= limit) break;
      let runEnd = end;
      while (docText[runEnd] === "`") runEnd += 1;
      if (runEnd - end === length) {
        ranges.push({ from: start, to: runEnd });
        cursor = runEnd;
        break;
      }
      end = runEnd;
    }
  }

  return ranges.sort((a, b) => a.from - b.from);
}

function overlapsCodeRange(codeRanges, from, to) {
  let low = 0;
  let high = codeRanges.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (codeRanges[middle].to <= from) low = middle + 1;
    else high = middle;
  }
  return low < codeRanges.length && codeRanges[low].from < to;
}

function buildLinkLabelStarts(docText, codeRanges) {
  const bracketStack = [];
  const labelStarts = new Map();
  let backslashCount = 0;
  let codeIndex = 0;

  for (let cursor = 0; cursor < docText.length; cursor += 1) {
    const code = codeRanges[codeIndex];
    if (code && cursor >= code.from) {
      bracketStack.length = 0;
      backslashCount = 0;
      cursor = code.to - 1;
      codeIndex += 1;
      continue;
    }
    const char = docText[cursor];
    const isEscaped = backslashCount % 2 === 1;

    if (!isEscaped && char === "[") {
      bracketStack.push(cursor);
    } else if (!isEscaped && char === "]") {
      const bracketStart = bracketStack.pop();
      if (bracketStart != null && docText[cursor + 1] === "(") {
        labelStarts.set(cursor, bracketStart);
      }
    }

    backslashCount = char === "\\" ? backslashCount + 1 : 0;
  }

  return labelStarts;
}

export function buildLinkCompactRanges(docText) {
  const ranges = [];
  const codeRanges = buildCodeRanges(docText);
  const labelStarts = buildLinkLabelStarts(docText, codeRanges);
  let searchFrom = 0;

  while (searchFrom < docText.length) {
    const linkStart = docText.indexOf("](", searchFrom);
    if (linkStart === -1) {
      break;
    }

    const urlStart = linkStart + 2;
    const bracketStart = labelStarts.get(linkStart);
    const isImage = bracketStart > 0 && docText[bracketStart - 1] === "!";
    let cursor = urlStart;
    let depth = 1;

    while (cursor < docText.length) {
      const char = docText[cursor];

      if (char === "\n" || char === "\r") {
        break;
      }

      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          if (
            cursor > urlStart &&
            bracketStart != null &&
            !overlapsCodeRange(codeRanges, bracketStart, cursor + 1)
          ) {
            ranges.push({
              from: urlStart,
              to: cursor,
              linkFrom: isImage ? bracketStart - 1 : bracketStart,
              linkTo: cursor + 1,
              labelFrom: bracketStart + 1,
              labelTo: linkStart,
              url: docText.slice(urlStart, cursor),
              isImage,
            });
          }
          cursor += 1;
          break;
        }
      }

      cursor += 1;
    }

    searchFrom = cursor > urlStart ? cursor : urlStart;
  }

  return ranges;
}
