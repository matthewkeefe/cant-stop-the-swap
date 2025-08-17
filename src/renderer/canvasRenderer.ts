import type { GameState } from "../game-core/engine";

let blinkT = 0;

export function drawStateToCanvas(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize = 48,
  dtMs = 16.666
) {
  const {
    width,
    height,
    grid,
    colors,
    cursorX,
    cursorY,
    matchMask,
    phase,
    fallPieces,
    showClearLine,
    clearLineY,
  } = state;

  blinkT = (blinkT + dtMs) % 400;

  // Background
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0f0f12";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Grid tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x];
      if (v < 0) continue;
      const px = x * cellSize;
      const py = y * cellSize;
      ctx.fillStyle = colors[v] ?? "#888";
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);

      if (matchMask[y][x] && phase === "clearing" && blinkT < 200) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
      }
    }
  }

  // Falling pieces
  for (const p of fallPieces) {
    const px = p.x * cellSize;
    const py = p.y * cellSize;
    ctx.fillStyle = colors[p.color] ?? "#888";
    ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
  }

  // Dashed clear line
  if (showClearLine) {
    const yPix = clearLineY * cellSize + 0.5;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yPix);
    ctx.lineTo(width * cellSize, yPix);
    ctx.stroke();
    ctx.restore();
  }

  // Cursor outline (two cells)
  const cx = cursorX * cellSize;
  const cy = cursorY * cellSize;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(cx + 1.5, cy + 1.5, cellSize * 2 - 3, cellSize - 3);
}
