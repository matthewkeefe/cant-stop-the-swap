import { describe, it, expect } from "vitest";
import { Engine } from "../src/game-core/engine";

// Small helper to create a row that would normally create a horizontal triple
function tripleRow(width: number, color: number) {
  const r = Array.from({ length: width }, () => -1);
  if (width >= 3) {
    r[0] = color;
    r[1] = color;
    r[2] = color;
  }
  return r;
}

describe("Engine queue sanitization", () => {
  it("preview matches inserted bottom row after rising", () => {
    const e = new Engine(6, 6, 4);
    // prepare a queue where the first row would create a horizontal triple
    const raw = tripleRow(6, 0);
    const raw2 = Array.from({ length: 6 }, (_, i) => (i % 2 === 0 ? 1 : -1));
    e.setLevelQueue([raw, raw2], 0);

    // preview should equal the queued sanitized row copy
    const state = e.getState() as any;
    expect(state.nextRowPreview).toBeDefined();
    const preview = (state.nextRowPreview as number[]).slice();

    // Simulate a full-row scroll: set scroll offset to one cell and call
    // update() so insertion from queue occurs using public API.
    e.scrollOffsetPx = 48;
    e.update(16);
    
    // After insertion, bottom row should equal the preview
    const bottom = e.grid[e.height - 1].slice();
    expect(bottom).toEqual(preview);
  });
});
