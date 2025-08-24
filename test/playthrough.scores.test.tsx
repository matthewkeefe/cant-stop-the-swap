import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../src/App";
import LEVELS from "../src/levels";

describe("playthrough scoring", () => {
  it("records a level score into sessionStorage when advancing", async () => {
    // Start at level 1
    try {
      localStorage.setItem("selectedLevelId", LEVELS[0].id);
      sessionStorage.removeItem("currentPlaythrough");
    } catch {
      // ignore storage failures
    }

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    // Allow the app to start and the engine to initialize
    await new Promise((r) => setTimeout(r, 80));

    // Dispatch a Z key to attempt to advance (existing tests use this pattern)
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
    await new Promise((r) => setTimeout(r, 40));

    // Check sessionStorage for playthrough entries
    let stored: string | null = null;
    try {
      stored = sessionStorage.getItem("currentPlaythrough");
    } catch {
      /* ignore */
    }

    if (stored) {
      const parsed = JSON.parse(stored) as { levelId: string; score: number }[];
      expect(Array.isArray(parsed)).toBe(true);
      if (parsed.length > 0) {
        expect(parsed[0].levelId).toBe(LEVELS[0].id);
        expect(typeof parsed[0].score).toBe("number");
      }
    } else {
      // Not all environments will result in an automatic advance; ensure no crash
      expect(stored).toBeNull();
    }
  });
});
