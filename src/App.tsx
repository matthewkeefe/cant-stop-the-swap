import { useEffect, useRef } from "react";
import { Engine } from "./game-core/engine";
import { drawStateToCanvas } from "./renderer/canvasRenderer";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  // constants for this demo
  const CELL = 48;
  const WIDTH = 6;
  const HEIGHT = 12;

  // init once
  useEffect(() => {
    engineRef.current = new Engine(WIDTH, HEIGHT, 5);
    const canvas = canvasRef.current!;
    canvas.width = WIDTH * CELL;
    canvas.height = HEIGHT * CELL;

    // keyboard controls
    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          engineRef.current!.moveCursor(-1, 0);
          break;
        case "ArrowRight":
          engineRef.current!.moveCursor(1, 0);
          break;
        case "ArrowUp":
          engineRef.current!.moveCursor(0, -1);
          break;
        case "ArrowDown":
          engineRef.current!.moveCursor(0, 1);
          break;
        case "z":
        case "Z":
        case " ":
          engineRef.current!.swap();
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    let raf = 0;
    const ctx = canvas.getContext("2d")!;
    const loop = () => {
      // For now, no physics step—just redraw current state
      drawStateToCanvas(ctx, engineRef.current!.getState(), CELL);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0b0b0e",
      }}
    >
      <div style={{ textAlign: "center", color: "#cbd5e1", fontFamily: "ui-sans-serif, system-ui" }}>
        <h1 style={{ marginBottom: 12 }}>Prism Grid (demo)</h1>
        <p style={{ marginTop: 0, marginBottom: 12 }}>
          Move: Arrow Keys • Swap: Z or Space
        </p>
        <canvas ref={canvasRef} style={{ borderRadius: 8 }} />
      </div>
    </div>
  );
}
