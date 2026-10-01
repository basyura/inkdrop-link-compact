"use babel";

function isLinkBeingEdited({ linkFrom, linkTo }, selection) {
  if (linkFrom == null) {
    return false;
  }

  return selection.ranges.some(({ from, to }) =>
    from === to ? from > linkFrom && from < linkTo : from < linkTo && to > linkFrom
  );
}

export function getEditingRanges(ranges, selection, includeRange = null) {
  const editingRanges = new Set();
  const editingRangeKeys = [];

  for (const range of ranges) {
    if (
      isLinkBeingEdited(range, selection) &&
      (includeRange == null || includeRange(range))
    ) {
      editingRanges.add(range);
      editingRangeKeys.push(`${range.from}:${range.to}`);
    }
  }

  return {
    editingRanges,
    editingRangeKey: editingRangeKeys.join(","),
  };
}

export function getChangedRanges(changes) {
  const ranges = [];
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    ranges.push({ from: fromB, to: toB });
  });
  return ranges;
}

export function isLinkChanged({ linkFrom, linkTo }, changedRanges) {
  if (linkFrom == null) {
    return false;
  }

  return changedRanges.some(({ from, to }) =>
    from === to ? from > linkFrom && from < linkTo : from < linkTo && to > linkFrom
  );
}

export function isContinuedEditingRange(range, editingRanges, changes) {
  if (range.linkFrom == null) {
    return false;
  }

  for (const editingRange of editingRanges) {
    if (
      editingRange.linkFrom != null &&
      range.linkFrom === changes.mapPos(editingRange.linkFrom, 1) &&
      range.linkTo === changes.mapPos(editingRange.linkTo, -1)
    ) {
      return true;
    }
  }

  return false;
}
