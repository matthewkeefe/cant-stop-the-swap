import { describe, it, expect } from "vitest";
import { Engine } from "../src/game-core/engine";

describe("Engine start/reset behavior", () => {
  it("setLevelQueue populates visible rows and rowsInserted resets on new engine", () => {
    const e = new Engine(6, 6, 4);
    const rows = [
      [0, 0, 0, -1, -1, -1],
      [1, -1, 1, -1, 1, -1],
      [2, 2, 2, 2, 2, 2],
    ];
    e.setLevelQueue(rows, 2);
    // rowsInserted should reflect number of visible rows placed
    expect(e.rowsInserted).toBe(2);
    // bottom row should contain valid color indices or -1
    const bottom = e.grid[e.height - 1];
    expect(bottom.length).toBe(e.width);
    for (const v of bottom) {
      expect(typeof v === "number").toBeTruthy();
      expect(v === -1 || (v >= 0 && v < e.colors.length)).toBeTruthy();
    }

    // Create a fresh engine to simulate a reset
    const e2 = new Engine(6, 6, 4);
    expect(e2.rowsInserted).toBe(0);
    // grid should be empty (-1) initially
    for (let y = 0; y < e2.height; y++) {
      for (let x = 0; x < e2.width; x++) {
        expect(e2.grid[y][x]).toBe(-1);
      }
    }
  });
});
