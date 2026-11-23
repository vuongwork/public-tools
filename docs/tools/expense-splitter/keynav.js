/**
 * Where keyboard focus goes from grid cell (ei = expense column, mi = member row).
 * move: "up" | "down" | "left" | "right" — arrow keys;
 *       "next" | "prev" — Enter / Shift+Enter after editing a cell (down the column).
 * Returns { type: "cell", ei, mi } | { type: "exp-name", ei } | { type: "mem-name", mi }
 *       | { type: "add-exp" } | null (stay).
 */
export function cellTarget({ ei, mi, nExp, nMem }, move) {
  const cell = (e, m) => ({ type: "cell", ei: e, mi: m });
  switch (move) {
    case "up": return mi > 0 ? cell(ei, mi - 1) : { type: "exp-name", ei };
    case "down": return mi < nMem - 1 ? cell(ei, mi + 1) : null;
    case "left": return ei > 0 ? cell(ei - 1, mi) : { type: "mem-name", mi };
    case "right": return ei < nExp - 1 ? cell(ei + 1, mi) : null;
    case "next":
      if (mi < nMem - 1) return cell(ei, mi + 1);
      return ei < nExp - 1 ? cell(ei + 1, 0) : { type: "add-exp" };
    case "prev": return cell(ei, Math.max(0, mi - 1));
    default: return null;
  }
}
