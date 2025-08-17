import type { GameState } from "../game-core/engine";

/** Source rectangle for a frame inside a sprite sheet */
export type SrcRect = { sx: number; sy: number; sw: number; sh: number };

/** Optional skin: if present, we draw from a sprite sheet. */
export type Skin = {
  image: HTMLImageElement | null; // sheet image
  pickSrcForCell: (x: number, y: number) => SrcRect; // background choose per cell if you want variety
  pickSrcForColor?: (colorIndex: number) => SrcRect; // foreground gem by color
  // NB: If pickSrcForColor is undefined, renderer uses flat colors fallback for gems.
};

let blinkT = 0;

/**
 * Draws the game state.
 * - Always draws a background tile (if `bgSkin` provided)
 * - Draws a gem on top for any grid cell >= 0 (from `fgSkin` if provided, else flat colors)
 */
export function drawStateToCanvas(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize = 48,
  dtMs = 16.666,
  bgSkin?: Skin,
  fgSkin?: Skin
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

  // Background (canvas)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = "#0f0f12";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;

  // Draw board cell backgrounds first (from backtiles)
  if (bgSkin?.image && bgSkin.image.complete) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { sx, sy, sw, sh } = bgSkin.pickSrcForCell(x, y);
        const px = x * cellSize;
        const py = y * cellSize;
        ctx.drawImage(
          bgSkin.image,
          sx, sy, sw, sh,
          px + 1, py + 1, cellSize - 2, cellSize - 2
        );
      }
    }
  } else {
    // fallback: subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let y = 0; y <= height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize + 0.5);
      ctx.lineTo(width * cellSize, y * cellSize + 0.5);
      ctx.stroke();
    }
    for (let x = 0; x <= width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize + 0.5, 0);
      ctx.lineTo(x * cellSize + 0.5, height * cellSize);
      ctx.stroke();
    }
  }

  // Draw gems/blocks in grid
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x];
      if (v < 0) continue;

      const px = x * cellSize;
      const py = y * cellSize;

      if (fgSkin?.image && fgSkin.image.complete && fgSkin.pickSrcForColor) {
        const { sx, sy, sw, sh } = fgSkin.pickSrcForColor(v);
        // Slight inset so the gem sits inside the backtile border
        const inset = Math.max(2, Math.floor(cellSize * 0.10));
        ctx.drawImage(
          fgSkin.image,
          sx, sy, sw, sh,
          px + inset, py + inset, cellSize - inset * 2, cellSize - inset * 2
        );
      } else {
        // Flat color fallback (your original look)
        ctx.fillStyle = colors[v] ?? "#888";
        ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
      }

      // Flash overlay during "clearing"
      if (matchMask[y][x] && phase === "clearing" && blinkT < 200) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
      }
    }
  }

  // Falling pieces (draw using fgSkin if available)
  for (const p of fallPieces) {
    const px = p.x * cellSize;
    const py = p.y * cellSize;
    if (fgSkin?.image && fgSkin.image.complete && fgSkin.pickSrcForColor) {
      const { sx, sy, sw, sh } = fgSkin.pickSrcForColor(p.color);
      const inset = Math.max(2, Math.floor(cellSize * 0.10));
      ctx.drawImage(
        fgSkin.image,
        sx, sy, sw, sh,
        px + inset, py + inset, cellSize - inset * 2, cellSize - inset * 2
      );
    } else {
      ctx.fillStyle = state.colors[p.color] ?? "#888";
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    }
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
