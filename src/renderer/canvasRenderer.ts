import type { GameState } from "../game-core/engine";

/** Source rectangle for a frame inside a sprite sheet */
export type SrcRect = { sx: number; sy: number; sw: number; sh: number };

/** Optional skin: if present, we draw from a sprite sheet. */
export type Skin = {
  image: HTMLImageElement | null; // sheet image
  pickSrcForCell: (x: number, y: number) => SrcRect; // background choose per cell if you want variety
  // foreground gem by color. Optional second param 'variant' can be
  // "normal" or "clear" to request a matched/clearing sprite variant.
  pickSrcForColor?: (
    colorIndex: number,
    variant?: "normal" | "clear"
  ) => SrcRect; // foreground gem by color
  // NB: If pickSrcForColor is undefined, renderer uses flat colors fallback for gems.
};

let blinkT = 0;
const FADE_MS = 300; // fade duration from full to zero opacity (ms)

/**
 * insetSrc
 *
 * Utility to shrink a sprite source rectangle inward by a fixed number of pixels
 * on all sides. This prevents "texture bleeding," where scaling a sprite from
 * a packed atlas accidentally samples neighboring pixels (e.g., causing stray
 * colored lines at tile edges).
 *
 * @param src   The original source rectangle (sx, sy, sw, sh) in the atlas.
 * @param bleed How many pixels to inset on each edge. Defaults to 0 (no change).
 *              A value of 1 is usually enough if your atlas sprites are tightly packed.
 * @returns     A new source rectangle inset by the given bleed.
 */
function insetSrc(src: SrcRect, bleed = 0): SrcRect {
  if (!bleed) return src;
  return {
    sx: src.sx + bleed,
    sy: src.sy + bleed,
    sw: Math.max(0, src.sw - bleed * 2),
    sh: Math.max(0, src.sh - bleed * 2),
  };
}

/**
 * Draw one gem cell.
 * - Uses fgSkin if available (sprite sheet) else falls back to flat color rect.
 * - Applies a consistent inset so the gem sits inside the backtile border.
 * - Optional 'flash' overlay when clearing.
 */
function drawGemCell(params: {
  ctx: CanvasRenderingContext2D;
  v: number;
  px: number;
  py: number;
  cellSize: number;
  fgSkin?: Skin | undefined;
  colors: string[]; // fallback palette
  isClearing: boolean; // phase === "clearing"
  blinkT: number; // ms, used for flash overlay
  spriteBleed?: number; // default 1px bleed inset if needed
  insetPx?: number; // override inset px; default 10% of cellSize clamped to >=2
  isMatched?: boolean; // only flash if matched
}) {
  const {
    ctx,
    v,
    px,
    py,
    cellSize,
    fgSkin,
    colors,
    isClearing,
    blinkT,
    spriteBleed = 1,
    insetPx,
    isMatched,
  } = params;

  // Keep pixel-crisp
  ctx.imageSmoothingEnabled = false;

  // Gem inset (inside tile border)
  const inset = insetPx ?? Math.max(2, Math.floor(cellSize * 0.1));
  const dx = px + inset;
  const dy = py + inset;
  const dw = cellSize - inset * 2;

  // Draw foreground gem from skin if available, else flat color
  if (fgSkin?.image && fgSkin.image.complete && fgSkin.pickSrcForColor) {
    const variant = isMatched && isClearing ? "clear" : "normal";
    const raw = fgSkin.pickSrcForColor(v, variant);
    const { sx, sy, sw, sh } = insetSrc(raw, spriteBleed);
    ctx.save();
    // Draw gems fully opaque so they appear above any background imagery.
    ctx.globalAlpha = 1;
    ctx.drawImage(fgSkin.image, sx, sy, sw, sh, dx, dy, dw, dw);
    ctx.restore();
  } else {
    // Flat color fallback (opaque)
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = colors[v] ?? "#888";
    ctx.fillRect(dx, dy, dw, dw);
    ctx.restore();
  }

  // Fade overlay for matched tiles during clearing: opacity goes from 1 -> 0
  // over FADE_MS milliseconds. Use a temporary ctx.save()/restore() to
  // isolate globalAlpha changes.
  if (isClearing && isMatched) {
    const t = Math.min(FADE_MS, Math.max(0, blinkT));
    const alpha = 1 - t / FADE_MS; // 1 -> 0
    if (alpha > 0) {
      ctx.save();
        ctx.globalAlpha = alpha * 0.5; // scale down so sprite still visible underneath
      ctx.fillStyle = "white";
      ctx.fillRect(dx, dy, dw, dw);
      ctx.restore();
    }
  }
}

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
  scrollOffsetPx = 0,
  bgSkin?: Skin,
  fgSkin?: Skin,
  canvasBgImage?: HTMLImageElement | null
) {
  const {
    width,
    height,
    grid,
    colors,
    cursorX,
    cursorY,
    phase,
    fallPieces,
    showClearLine,
    clearLineY,
  } = state;

    blinkT = (blinkT + dtMs) % FADE_MS;

  // Background (canvas) - clear and optionally draw canvas background image
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (canvasBgImage && canvasBgImage.complete) {
    ctx.save();
    ctx.globalAlpha = 0.5; // 50% opacity for the glass texture
    ctx.drawImage(canvasBgImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  ctx.imageSmoothingEnabled = false;

  // No per-cell clearRect; only clear the canvas once at the start

  // Draw gems/blocks in grid
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x];
      const px = x * cellSize;
      const py = y * cellSize - scrollOffsetPx;

  // Draw background tile from skin if available
      if (bgSkin?.image && bgSkin.image.complete && bgSkin.pickSrcForCell) {
        const src = bgSkin.pickSrcForCell(x, y);
        const { sx, sy, sw, sh } = insetSrc(src, 0);
        ctx.drawImage(bgSkin.image, sx, sy, sw, sh, px, py, cellSize, cellSize);
      }

      if (v < 0) continue;
      const isMatched = !!(
        state.matchMask &&
        state.matchMask[y] &&
        state.matchMask[y][x]
      );
      drawGemCell({
        ctx,
        v,
        px,
        py,
        cellSize,
        fgSkin,
        colors,
        isClearing: phase === "clearing",
        blinkT,
        spriteBleed: 1, // set to 0 if your atlas has built-in padding
        isMatched,
      });
    }
  }

  // Falling pieces (draw using fgSkin if available)
  for (const p of fallPieces) {
    const px = p.x * cellSize;
    const py = p.y * cellSize - scrollOffsetPx;
    if (fgSkin?.image && fgSkin.image.complete && fgSkin.pickSrcForColor) {
      const { sx, sy, sw, sh } = fgSkin.pickSrcForColor(p.color);
      const inset = Math.max(2, Math.floor(cellSize * 0.1));
  ctx.save();
  // Draw falling pieces fully opaque so they render above the background
  ctx.globalAlpha = 1;
  ctx.drawImage(
        fgSkin.image,
        sx,
        sy,
        sw,
        sh,
        px + inset,
        py + inset,
        cellSize - inset * 2,
        cellSize - inset * 2
      );
      ctx.restore();
    } else {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = state.colors[p.color] ?? "#888";
  ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
  ctx.restore();
    }
  }

  // Particles (rainbow sprays)
  const particles: any[] = (state as any).particles || [];
  if (particles.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const pt of particles) {
      const px = pt.x - 0; // particles are in canvas space already
      const py = pt.y - scrollOffsetPx; // account for upward scroll
      ctx.beginPath();
      ctx.fillStyle = pt.color;
      ctx.arc(px, py, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Draw next row preview rising from the bottom when fractional scrolling is in progress
  const fractional = scrollOffsetPx % cellSize;
  if (fractional > 0 && (state as any).nextRowPreview) {
    const preview: number[] = (state as any).nextRowPreview;
    const baseY = height * cellSize - fractional; // where the preview row's top should be
    for (let x = 0; x < width; x++) {
      const v = preview[x];
      if (v < 0) continue;
      const px = x * cellSize;
      const py = baseY;
      // draw background tile if available
      if (bgSkin?.image && bgSkin.image.complete && bgSkin.pickSrcForCell) {
        const src = bgSkin.pickSrcForCell(x, height - 1);
        const { sx, sy, sw, sh } = insetSrc(src, 0);
        ctx.drawImage(bgSkin.image, sx, sy, sw, sh, px, py, cellSize, cellSize);
      }
      // draw gem
      drawGemCell({
        ctx,
        v,
        px,
        py,
        cellSize,
        fgSkin,
        colors,
        isClearing: false,
        blinkT: 0,
        spriteBleed: 1,
        isMatched: false,
      });
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

  // Win dashed line (if provided by engine state). Draw as a thinner dashed green-ish line.
  if (typeof (state as any).winLineY === "number") {
    const wY = (state as any).winLineY + 0.5;
    ctx.save();
    ctx.strokeStyle = "rgba(140, 255, 170, 0.9)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, wY);
    ctx.lineTo(width * cellSize, wY);
    ctx.stroke();
    ctx.restore();
  }

  // Cursor outline (two cells)
  const cx = cursorX * cellSize;
  const cy = cursorY * cellSize - scrollOffsetPx;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.strokeRect(cx + 1.5, cy + 1.5, cellSize * 2 - 3, cellSize - 3);
}
