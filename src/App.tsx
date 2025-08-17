import { useEffect, useRef, useState } from "react";
import { Engine } from "./game-core/engine";
import { drawStateToCanvas } from "./renderer/canvasRenderer";

type PresetKey = "Easy" | "Normal" | "Hard" | "Custom";
const PRESETS: Record<PresetKey, number> = {
  Easy: 0.40,
  Normal: 0.60,
  Hard: 0.90,
  Custom: 0,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const CELL = 48;
  const WIDTH = 6;
  const HEIGHT = 12;

  const [scene, setScene] = useState<"title" | "play">("title");
  const [inputs, setInputs] = useState({
    startLines: 5,
    targetLines: 10,
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

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = WIDTH * CELL;
    canvas.height = HEIGHT * CELL;

    const onKeyDown = (e: KeyboardEvent) => {
      if (scene === "title") {
        if (e.key === "Enter") startGame();
        return;
      }
      if (!engineRef.current) return;

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

        if (
          (s.cursorX === 0 && s.cursorY === 0) &&
          !(lastCursorRef.current.x === 0 && lastCursorRef.current.y === 0)
        ) {
          engineRef.current.setCursorAbsolute(
            lastCursorRef.current.x,
            lastCursorRef.current.y
          );
          const s2 = engineRef.current.getState();
          drawStateToCanvas(ctx, s2, CELL, dt);
        } else {
          drawStateToCanvas(ctx, s, CELL, dt);
        }

        lastCursorRef.current = { x: s.cursorX, y: s.cursorY };

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
  }, [scene]);

  function startGame() {
    engineRef.current = new Engine(WIDTH, HEIGHT, 5);
    engineRef.current.targetLines = inputs.targetLines;
    const useRate =
      inputs.preset === "Custom" ? inputs.rate : PRESETS[inputs.preset];
    engineRef.current.autoRiseRateRowsPerSec = useRate;
    engineRef.current.setStartingLines(inputs.startLines);

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

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b0b0e",
        color: "#cbd5e1",
        fontFamily: "ui-sans-serif, system-ui",
        padding: 16,
      }}
    >
      <div style={{ display: "grid", gap: 16, alignItems: "start" }}>
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
            ) : (
              <div style={{ fontSize: 14, opacity: 0.9 }}>
                <div>Score: <strong>{hud.score}</strong></div>
                <div>Matches (incl. chains): <strong>{hud.matches}</strong></div>
                <div>Current chain: <strong>x{Math.max(1, hud.chains)}</strong></div>
                <div>
                  Lines cleared (eq): <strong>{hud.linesEq}</strong> /{" "}
                  <strong>{inputs.targetLines}</strong>
                </div>
                <div>Tiles above line: <strong>{hud.tilesAbove}</strong></div>
              </div>
            )}
          </div>

          <div style={{ fontSize: 14 }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", marginBottom: 6 }}>
                Starting lines (bottom):{" "}
                <input
                  type="number"
                  min={0}
                  max={HEIGHT - 1}
                  step={1}
                  value={inputs.startLines}
                  onChange={(e) =>
                    setInputs((p) => ({
                      ...p,
                      startLines: Math.max(
                        0,
                        Math.min(HEIGHT - 1, parseInt(e.target.value || "0", 10))
                      ),
                    }))
                  }
                  style={{ width: 80 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 6 }}>
                Target lines (to show dashed line):{" "}
                <input
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={inputs.targetLines}
                  onChange={(e) =>
                    setInputs((p) => ({
                      ...p,
                      targetLines: Math.max(1, parseInt(e.target.value || "0", 10)),
                    }))
                  }
                  style={{ width: 80 }}
                />
              </label>

              <label style={{ display: "block", marginBottom: 6 }}>
                Rise preset:&nbsp;
                <select
                  value={inputs.preset}
                  onChange={(e) => onPresetChange(e.target.value as PresetKey)}
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
                  Controls: Arrows = move • Z/Space = swap • X = raise • R = reset
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

        <div style={{ position: "relative", width: WIDTH * CELL }}>
          <canvas
            ref={canvasRef}
            width={WIDTH * CELL}
            height={HEIGHT * CELL}
            style={{ borderRadius: 8 }}
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
    </div>
  );
}
