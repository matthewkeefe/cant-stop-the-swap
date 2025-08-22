import { describe, it, expect } from "vitest";
import { getNextLevelId } from "../src/levels/utils";

describe("Level progression utilities", () => {
  it("returns next level id and wraps around", () => {
    const levels = [
      { id: "level-1" },
      { id: "level-2" },
      { id: "level-3" },
    ];

    expect(getNextLevelId(levels, "level-1")).toBe("level-2");
    expect(getNextLevelId(levels, "level-2")).toBe("level-3");
    // wrap
    expect(getNextLevelId(levels, "level-3")).toBe("level-1");
    // unknown id -> first
    expect(getNextLevelId(levels, "nope")).toBe("level-1");
  });
});
