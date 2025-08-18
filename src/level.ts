// Minimal level module - holds a prebuilt queue of rows (bottom-first)
export type Level = {
  // Each row is an array of cell values length = game width. Rows are ordered
  // oldest-first: shift() will return the next row to insert at the bottom.
  queue: number[][];
};

export function makeLevelFromRows(rows: number[][]): Level {
  return { queue: rows.slice() };
}
