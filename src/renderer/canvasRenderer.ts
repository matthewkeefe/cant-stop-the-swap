import type { GameState } from "../game-core/engine";

export function drawStateToCanvas(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize = 48
) {
  const { width, height, grid, colors, cursorX, cursorY } = state;

  // Clear background
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0f0f12";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Draw cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorIndex = grid[y][x];
      const px = x * cellSize;
      const py = y * cellSize;
      ctx.fillStyle = colors[colorIndex] ?? "#888";
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    }
  }

  // Draw cursor outline around two adjacent cells
  const cx = cursorX * cellSize;
  const cy = cursorY * cellSize;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(cx + 1.5, cy + 1.5, cellSize * 2 - 3, cellSize - 3);
}
