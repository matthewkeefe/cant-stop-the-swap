import { useEffect, useRef, useState } from "react";
import { Engine } from "./game-core/engine";

const DEFAULT_TOTAL_LEVEL_LINES = 7;
import {
  drawStateToCanvas,
  type Skin,
  type SrcRect,
} from "./renderer/canvasRenderer";

import tilesGemsPng from "./assets/sprites/gems.png";
import tilesGemsXmlUrl from "./assets/sprites/gems.xml?url";
import { type Atlas, loadGemsAtlas } from "./atlas"; // atlas helpers moved to src/atlas.ts

type PresetKey = "Easy" | "Normal" | "Hard" | "Custom";
const PRESETS: Record<PresetKey, number> = {
  Easy: 0.2,
  Normal: 0.5,
  Hard: 0.8,
  Custom: 0,
};

// ----------------------------------------------------------------------------

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Skins
  const backtilesAtlasRef = useRef<Atlas | null>(null);
  const tilesBlackAtlasRef = useRef<Atlas | null>(null);
  const [atlasesReady, setAtlasesReady] = useState(false);

  const CELL = 48;
  const WIDTH = 6;
  const HEIGHT = 12;

  const [scene, setScene] = useState<"title" | "play">("title");
  const [inputs, setInputs] = useState({
    totalLines: DEFAULT_TOTAL_LEVEL_LINES,
    targetLines: 5,
    startingLines: 5,
    preset: "Normal" as PresetKey,
    rate: PRESETS["Normal"],
  });
  const [hud, setHud] = useState({
    score: 0,
    matches: 0,
    chains: 0,
    linesEq: 0,
    tilesAbove: 0,
    hasWon: false,
    hasLost: false,
  });

  // Load Kenney atlases once
  useEffect(() => {
    //console.log('[App] useEffect running. scene:', scene, 'atlasesReady:', atlasesReady);
    (async () => {
      try {
        const gems = await loadGemsAtlas(tilesGemsPng, tilesGemsXmlUrl, {
          w: 128,
          h: 128,
        });
        tilesBlackAtlasRef.current = gems;
        setAtlasesReady(true);
      } catch (e) {
        console.error("Failed to load gems atlases", e);
        setAtlasesReady(false);
      }
    })();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = WIDTH * CELL;
    canvas.height = HEIGHT * CELL;

    const onKeyDown = (e: KeyboardEvent) => {
      //console.log('[App] KeyDown:', e.key, 'scene:', scene);
      if (scene === "title") {
        if (e.key === "Enter") {
          startGame();
        }
        return;
      }
      if (!engineRef.current) return;

      // Only call startGame for R (reset), not for swap actions
      switch (e.key) {
        case "ArrowLeft":
          engineRef.current.moveCursor(-1, 0);
          break;
        case "ArrowRight":
          engineRef.current.moveCursor(1, 0);
          break;
        case "ArrowUp":
          engineRef.current.moveCursor(0, -1);
          break;
        case "ArrowDown":
          engineRef.current.moveCursor(0, 1);
          break;
        case "z":
        case "Z":
        case " ":
        case "Space":
          e.preventDefault();
          engineRef.current.swap();
          break;
        case "x":
        case "X":
          engineRef.current.manualRaiseOnce();
          break;
        case "r":
        case "R":
          startGame();
          break;
        default:
          // Do nothing for other keys
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    let raf = 0;
    let last = performance.now();
    const ctx = canvas.getContext("2d")!;

    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;

      if (scene === "play" && engineRef.current) {
        engineRef.current.update(dt);
        const s = engineRef.current.getState();

        // ---- Build skins (background + foreground) when atlases are ready ----
        let bgSkin: Skin | undefined;
        let fgSkin: Skin | undefined;

        if (atlasesReady && backtilesAtlasRef.current) {
          const atlas = backtilesAtlasRef.current;

          // Determine the per-frame size from the atlas (works with XML or grid fallback)
          const anyFrame = Object.values(atlas.frames)[0];
          const frameW = anyFrame?.w ?? 128;
          const frameH = anyFrame?.h ?? 128;

          // Lock to row 2, col 1 (0-based: row=1, col=0)
          const BACK_COL = 0;
          const BACK_ROW = 1;
          const src: SrcRect = {
            sx: BACK_COL * frameW,
            sy: BACK_ROW * frameH,
            sw: frameW,
            sh: frameH,
          };

          // Always return the same source rect so every cell uses that one backtile
          bgSkin = {
            image: atlas.image,
            pickSrcForCell: () => src,
          };
        }

        if (atlasesReady && tilesBlackAtlasRef.current) {
          const atlas = tilesBlackAtlasRef.current;

          // Map 5 color indices -> 5 different “tile” looks.
          const keys = Object.keys(atlas.frames).sort();
          const candidates = keys.filter((k) => /_color/i.test(k));
          const order = (candidates.length >= 5 ? candidates : keys).slice(
            0,
            5
          );

          const pickByColor = (i: number): SrcRect => {
            const name = order[Math.max(0, Math.min(order.length - 1, i | 0))];
            const f = atlas.frames[name];
            return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
          };

          fgSkin = {
            image: atlas.image,
            pickSrcForCell: () => {
              // not used for fg, but satisfy type:
              const f = atlas.frames[order[0]];
              return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
            },
            pickSrcForColor: pickByColor,
          };
        }

        // Sticky-cursor guard
        if (
          s.cursorX === 0 &&
          s.cursorY === 0 &&
          !(lastCursorRef.current.x === 0 && lastCursorRef.current.y === 0)
        ) {
          engineRef.current.setCursorAbsolute(
            lastCursorRef.current.x,
            lastCursorRef.current.y
          );
          const s2 = engineRef.current.getState();
          drawStateToCanvas(
            ctx,
            s2,
            CELL,
            dt,
            s2.scrollOffsetPx ?? 0,
            bgSkin,
            fgSkin
          );
        } else {
          drawStateToCanvas(
            ctx,
            s,
            CELL,
            dt,
            s.scrollOffsetPx ?? 0,
            bgSkin,
            fgSkin
          );
        }

        lastCursorRef.current = { x: s.cursorX, y: s.cursorY };

        // HUD: tiles above dashed line
        let tilesAbove = 0;
        if (s.showClearLine) {
          for (let y = 0; y < s.clearLineY; y++) {
            for (let x = 0; x < s.width; x++) {
              if (s.grid[y][x] >= 0) tilesAbove++;
            }
          }
        }

        setHud({
          score: s.score,
          matches: s.matchesTotal,
          chains: s.chainCount,
          linesEq: s.linesClearedEq,
          tilesAbove,
          hasWon: s.hasWon,
          hasLost: s.hasLost,
        });

        canvas.style.filter = s.hasWon || s.hasLost ? "blur(3px)" : "none";
      } else {
        // Title scene: clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0f0f12";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [scene, atlasesReady]);

  function startGame() {
    engineRef.current = new Engine(WIDTH, HEIGHT, 5);
    engineRef.current.targetLines = inputs.targetLines;
    const useRate =
      inputs.preset === "Custom" ? inputs.rate : PRESETS[inputs.preset];
    engineRef.current.autoRiseRateRowsPerSec = useRate;
    // Build prebuilt queue: totalLines + 16 overflow rows
    const total = Math.max(1, inputs.totalLines || DEFAULT_TOTAL_LEVEL_LINES);
    const queueLen = total + 16;
    const rows: number[][] = [];
    for (let i = 0; i < queueLen; i++) {
      const row: number[] = [];
      for (let x = 0; x < WIDTH; x++) {
        // random color index based on engine palette
        const colorIndex = Math.floor(
          Math.random() * engineRef.current.colors.length
        );
        row.push(colorIndex);
      }
      rows.push(row);
    }
    engineRef.current.setLevelQueue(
      rows,
      Math.max(0, Math.min(HEIGHT, inputs.startingLines))
    );
    // Set the totalLevelLines so engine computes the rising win line; the
    // engine will add the +16 rows already included above.
    engineRef.current.totalLevelLines = total;

    setScene("play");
    setHud({
      score: 0,
      matches: 0,
      chains: 0,
      linesEq: 0,
      tilesAbove: 0,
      hasWon: false,
      hasLost: false,
    });
  }

  const onPresetChange = (value: PresetKey) => {
    setInputs((p) => ({
      ...p,
      preset: value,
      rate: value === "Custom" ? p.rate : PRESETS[value],
    }));
  };

  // game framework
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        background: "#0b0b0e",
        color: "#cbd5e1",
        fontFamily: "ui-sans-serif, system-ui",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "start",
              width: WIDTH * CELL + 280,
              maxWidth: "90vw",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 8px 0" }}>Prism Grid</h2>
              {scene === "title" ? (
                <p style={{ marginTop: 0, opacity: 0.9 }}>
                  Set your options, then press <strong>Enter</strong> or click{" "}
                  <strong>Start</strong>.
                </p>
              ) : null}
              {/* Game grid and overlays */}
              <div
                style={{
                  position: "relative",
                  width: WIDTH * CELL,
                  border: "2px solid #888",
                  backgroundColor: "#0f0f12",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={WIDTH * CELL}
                  height={HEIGHT * CELL}
                  style={{ borderRadius: 8 }}
                />
                {/* Soft fade gradients at top and bottom to mask incoming rows */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: CELL,
                    pointerEvents: "none",
                    background:
                      "linear-gradient(to bottom, rgba(11,11,14,1), rgba(11,11,14,0))",
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: CELL,
                    pointerEvents: "none",
                    background:
                      "linear-gradient(to top, rgba(11,11,14,1), rgba(11,11,14,0))",
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                  }}
                />
                {scene === "play" && (hud.hasWon || hud.hasLost) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      fontWeight: 700,
                      fontSize: 32,
                      letterSpacing: 1,
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      {hud.hasWon ? "You win!" : "You lose!"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ fontSize: 14 }}>
              {/* Score HUD moved above settings */}
              {scene === "play" && (
                <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>
                  <div>
                    Score: <strong>{hud.score}</strong>
                  </div>
                  <div>
                    Matches (incl. chains): <strong>{hud.matches}</strong>
                  </div>
                  <div>
                    Current chain: <strong>x{Math.max(1, hud.chains)}</strong>
                  </div>
                  <div>
                    Lines cleared (eq): <strong>{hud.linesEq}</strong> /{" "}
                    <strong>{inputs.targetLines}</strong>
                  </div>
                  <div>
                    Tiles above line: <strong>{hud.tilesAbove}</strong>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  Total Level Lines:
                  <input
                    type="number"
                    min={1}
                    max={999}
                    step={1}
                    value={inputs.totalLines}
                    onChange={(e) =>
                      setInputs((p) => ({
                        ...p,
                        totalLines: Math.max(
                          1,
                          parseInt(e.target.value || "0", 10)
                        ),
                      }))
                    }
                    style={{ width: 80 }}
                  />
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    (Total lines sets the win threshold; +16 lines are added to
                    the level queue to allow overflow)
                  </div>
                </label>
                <label style={{ display: "block", marginBottom: 6 }}>
                  Starting lines (visible at start):
                  <input
                    type="number"
                    min={0}
                    max={HEIGHT}
                    step={1}
                    value={inputs.startingLines}
                    onChange={(e) =>
                      setInputs((p) => ({
                        ...p,
                        startingLines: Math.max(
                          0,
                          Math.min(HEIGHT, parseInt(e.target.value || "0", 10))
                        ),
                      }))
                    }
                    style={{ width: 80 }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 6 }}>
                  Target lines (win):{" "}
                  <input
                    type="number"
                    min={1}
                    max={99}
                    step={1}
                    value={inputs.targetLines}
                    onChange={(e) =>
                      setInputs((p) => ({
                        ...p,
                        targetLines: Math.max(
                          1,
                          parseInt(e.target.value || "0", 5)
                        ),
                      }))
                    }
                    style={{ width: 80 }}
                  />
                </label>

                <label style={{ display: "block", marginBottom: 6 }}>
                  Rise preset:&nbsp;
                  <select
                    value={inputs.preset}
                    onChange={(e) =>
                      onPresetChange(e.target.value as PresetKey)
                    }
                  >
                    <option>Easy</option>
                    <option>Normal</option>
                    <option>Hard</option>
                    <option>Custom</option>
                  </select>
                </label>

                <label style={{ display: "block" }}>
                  Rise rate (rows/sec):{" "}
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.05}
                    value={
                      inputs.preset === "Custom"
                        ? inputs.rate
                        : PRESETS[inputs.preset]
                    }
                    onChange={(e) =>
                      setInputs((p) => ({
                        ...p,
                        rate: parseFloat(e.target.value || "0"),
                        preset: "Custom",
                      }))
                    }
                    style={{ width: 80 }}
                    disabled={inputs.preset !== "Custom"}
                  />
                </label>
              </div>

              {scene === "play" ? (
                <div>
                  <button onClick={() => startGame()}>Reset</button>
                  <p style={{ marginTop: 8, opacity: 0.8 }}>
                    Controls: Arrows = move • Z/Space = swap • X = raise • R =
                    reset
                  </p>
                </div>
              ) : (
                <div>
                  <button onClick={() => startGame()}>Start</button>
                  <p style={{ marginTop: 8, opacity: 0.8 }}>
                    Press <strong>Enter</strong> to start.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
