import { useEffect, useRef, useState } from "react";
import { Engine } from "./game-core/engine";

import {
  drawStateToCanvas,
  type Skin,
  type SrcRect,
} from "./renderer/canvasRenderer";

import tilesGemsPng from "./assets/sprites/gems.png";
import tilesGemsXmlUrl from "./assets/sprites/gems.xml?url";
import { type Atlas, loadGemsAtlas } from "./atlas"; // atlas helpers moved to src/atlas.ts
import LEVELS from "./levels";
import snd0 from "./assets/sounds/impactMining_000.ogg?url";
import snd1 from "./assets/sounds/impactMining_001.ogg?url";
import snd2 from "./assets/sounds/impactMining_002.ogg?url";
import snd3 from "./assets/sounds/impactMining_003.ogg?url";
import snd4 from "./assets/sounds/impactMining_004.ogg?url";
import swapSnd from "./assets/sounds/swap.ogg?url";

// This is the total number of lines that will be used to determine the win condition.
// The engine will add +16 overflow rows to this total for the level queue.
// This allows the player to have some overflow space to play with before reaching the win line.
// The player wins when they clear the target lines, which is set in the game options.
const DEFAULT_TOTAL_LEVEL_LINES = 10; // Default total lines for the level queue

// Preset keys removed — use a single explicit raise rate in inputs

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
    // single raise rate setting (rows per second)
    rate: 0.1,
  });

  const [selectedLevelId, setSelectedLevelId] = useState<string>(LEVELS[0]?.id ?? "level-1");
  // Preload audio elements for match/chain sounds
  const soundsRef = useRef<HTMLAudioElement[] | null>(null);
  // Preload swap sound
  const swapRef = useRef<HTMLAudioElement | null>(null);
  if (!soundsRef.current) {
    soundsRef.current = [snd0, snd1, snd2, snd3, snd4].map((u) => {
      const a = new Audio(u);
      a.preload = "auto";
      return a;
    });
  }
  if (!swapRef.current) {
    swapRef.current = new Audio(swapSnd);
    swapRef.current.preload = "auto";
  }
  // Music element for the currently playing level
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [hud, setHud] = useState({
    score: 0,
    matches: 0,
    chains: 0,
    linesEq: 0,
    tilesAbove: 0,
    hasWon: false,
  hasLost: false,
  risePauseMs: 0,
  risePauseMaxMs: 0,
  });

  // Load atlases once
  useEffect(() => {
    // When a level is selected, copy its settings into the inputs so Start uses them.
    const lvl = LEVELS.find((l) => l.id === selectedLevelId);
    if (lvl) {
      setInputs((p) => ({
        ...p,
        totalLines: lvl.totalLines,
        startingLines: lvl.startingLines,
        targetLines: lvl.targetLines,
        rate: lvl.raiseRate,
      }));
    }
  }, [selectedLevelId]);

  // Load atlases once
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

    // Main game loop
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;

      if (scene === "play" && engineRef.current) {
        engineRef.current.update(dt);
        const s = engineRef.current.getState();

        // Skins (background + foreground) when atlases are ready
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

          // Precompute a mapping from base frame -> clear variant so we
          // preserve the exact shape when swapping to the clear sprite.
          const clearMap: Record<string, string | undefined> = {};
          for (const baseName of order) {
            const lowerBase = baseName.toLowerCase();
            // Prefer exact suffix matches, then any frame that contains
            // both baseName and a 'clear' marker.
            const exactCandidates = [
              `${baseName}_clear`,
              `${baseName}-clear`,
              `${baseName}_matched`,
            ];
            let found: string | undefined = undefined;
            for (const c of exactCandidates) {
              if (atlas.frames[c]) {
                found = c;
                break;
              }
            }
            if (!found) {
              found = Object.keys(atlas.frames).find((k) => {
                const kl = k.toLowerCase();
                return (
                  kl.includes(lowerBase) &&
                  /_clear|\-clear|clear|matched/i.test(kl)
                );
              });
            }
            clearMap[baseName] = found;
          }

          const pickByColor = (
            i: number,
            variant: "normal" | "clear" = "normal"
          ): SrcRect => {
            const baseName =
              order[Math.max(0, Math.min(order.length - 1, i | 0))];
            if (variant === "clear") {
              const clearName = clearMap[baseName];
              if (clearName && atlas.frames[clearName]) {
                const f = atlas.frames[clearName];
                return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
              }
            }
            const f = atlas.frames[baseName];
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
          risePauseMs: s.risePauseMs ?? 0,
          risePauseMaxMs: s.risePauseMaxMs ?? 0,
        });

        // If win/loss occurred, stop any playing music
        if ((s.hasWon || s.hasLost) && musicRef.current) {
          try {
            musicRef.current.pause();
            musicRef.current.currentTime = 0;
          } catch (e) {
            /* ignore */
          }
        }

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

  // Start the game with initial settings
  function startGame() {
  // Stop previous music when starting/restarting
  if (musicRef.current) {
    try {
      musicRef.current.pause();
      musicRef.current.currentTime = 0;
    } catch (e) {}
    musicRef.current = null;
  }

  engineRef.current = new Engine(WIDTH, HEIGHT, 5);
  engineRef.current.targetLines = inputs.targetLines;
  // Use the explicit raise rate from inputs
  engineRef.current.autoRiseRateRowsPerSec = inputs.rate;
  // Wire up sound callback
  engineRef.current.onMatch = (chainCount: number) => {
    // Engine.chainCount: 1 = single initial match, 2+ = cascades.
    try {
      const sounds = soundsRef.current!;
      let idx = 0;
      if (chainCount <= 1) {
        // Single match -> impactMining_000
        idx = 0;
      } else if (chainCount === 2) {
        // First cascade after initial -> impactMining_001
        idx = 1;
      } else if (chainCount === 3) {
        idx = 2;
      } else if (chainCount === 4) {
        idx = 3;
      } else {
        idx = 4;
      }
      const audio = sounds[idx] as HTMLAudioElement;
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      clone.play().catch(() => {
        /* ignore play errors (e.g., not allowed before user gesture) */
      });
    } catch (e) {
      // swallow errors so game keeps running
    }
  };

  // Play swap sound when engine notifies of swaps
  engineRef.current.onSwap = () => {
    try {
      if (swapRef.current) {
        const clone = swapRef.current.cloneNode(true) as HTMLAudioElement;
        clone.play().catch(() => {});
      }
    } catch (e) {}
  };

  // Wire up onWin to stop music
  engineRef.current.onWin = () => {
    if (musicRef.current) {
      try {
        musicRef.current.pause();
        musicRef.current.currentTime = 0;
      } catch (e) {}
      musicRef.current = null;
    }
  };

  // Start playing level music if provided
  const lvl = LEVELS.find((l) => l.id === selectedLevelId);
  if (lvl && lvl.music) {
    try {
      const m = new Audio(lvl.music);
      m.loop = true;
      m.preload = "auto";
      m.volume = 0.25; // default music volume
      m.play().catch(() => {});
      musicRef.current = m;
    } catch (e) {
      // ignore
    }
  }
    
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
  risePauseMs: 0,
  risePauseMaxMs: 0,
    });
  }

  // preset change handler removed — UI no longer exposes rise preset controls

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
              {/* Chain Gauge: persistent bar above the grid (full width). */}
              <div
                style={{
                  width: WIDTH * CELL,
                  marginBottom: 8,
                }}
              >
                <div style={{ position: "relative", height: 28 }}>
                  {/* background track */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      background: "rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  />

                  {/* progress fill */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          hud.risePauseMaxMs
                            ? (hud.risePauseMs / hud.risePauseMaxMs) * 100
                            : 0
                        )
                      )}%`,
                      background: "linear-gradient(90deg,#6ee7b7,#34d399)",
                      transition: "width 120ms linear",
                    }}
                  />

                  {/* overlay content inside the bar */}
                  <div
                    style={{
                      position: "relative",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0 10px",
                      fontSize: 14,
                      color: "#ffffff",
                      fontWeight: 700,
                      textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div>Chain Gauge</div>
                    <div style={{ opacity: 0.95 }}>{Math.ceil((hud.risePauseMs || 0) / 1000)}s</div>
                  </div>
                </div>
              </div>

              {/* Game grid and overlays */}
              <div
                style={{
                  position: "relative",
                  width: WIDTH * CELL,
                  border: "2px solid #888",
                  backgroundColor: "#0f0f12",
                  borderRadius: 8,
                  overflow: "hidden",
                  // If the selected level has a background, apply it.
                  backgroundImage: LEVELS.find((l) => l.id === selectedLevelId)
                    ?.background
                    ? `url(${LEVELS.find((l) => l.id === selectedLevelId)?.background})`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
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
              {/* Title and small intro moved to the right HUD */}
              <div style={{ marginBottom: 10 }}>
                <h2 style={{ margin: 0 }}>Prism Grid</h2>
                {scene === "title" ? (
                  <p style={{ marginTop: 4, opacity: 0.9 }}>
                    Set your options, then press <strong>Enter</strong> or click <strong>Start</strong>.
                  </p>
                ) : null}
              </div>

              {/* Score HUD moved above settings */}
              {scene === "play" && (
                <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>
                    {/* rise pause indicator already shown above the grid; keep this space for consistency */}
                  </div>
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
                    Lines cleared (eq): <strong>{hud.linesEq}</strong> / <strong>{inputs.targetLines}</strong>
                  </div>
                  <div>
                    Tiles above line: <strong>{hud.tilesAbove}</strong>
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  Level:
                  <select
                    value={selectedLevelId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedLevelId(v);
                      }
                    }
                    style={{ width: 200, marginLeft: 8 }}
                  >
                    {LEVELS.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Only show level selector UI here. Other input controls removed per request. */}
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