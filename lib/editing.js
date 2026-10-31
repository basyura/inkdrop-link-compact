"use babel";

/*
 * カーソルがリンク内部にあるか、選択範囲がリンクに重なるかを判定する。
 */
function isLinkBeingEdited({ linkFrom, linkTo }, selection) {
  if (linkFrom == null) {
    return false;
  }

  return selection.ranges.some(({ from, to }) =>
    from === to ? from > linkFrom && from < linkTo : from < linkTo && to > linkFrom
  );
}

/*
 * 選択と追加条件に合う編集中のリンクを集め、状態比較用のキーとともに返す。
 */
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

/*
 * 文書変更から変更後の座標系で変更範囲を収集する。
 */
export function getChangedRanges(changes) {
  const ranges = [];
  changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    ranges.push({ from: fromB, to: toB });
  });
  return ranges;
}

/*
 * リンク内部への挿入またはリンクと重なる変更があるか判定する。
 */
export function isLinkChanged({ linkFrom, linkTo }, changedRanges) {
  if (linkFrom == null) {
    return false;
  }

  return changedRanges.some(({ from, to }) =>
    from === to ? from > linkFrom && from < linkTo : from < linkTo && to > linkFrom
  );
}

/*
 * 変更前の編集中リンクの位置を追従し、同じリンクの編集が継続しているか判定する。
 */
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
