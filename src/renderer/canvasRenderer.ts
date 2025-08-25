import type { GameState } from '../game-core/engine';

/** Minimal clean canvas renderer. Draws grid, falling pieces, particles,
 * dashed clear line, and a solid 6px white win line centered at winLineY.
 */
export type SrcRect = { sx: number; sy: number; sw: number; sh: number };
export type Skin = {
  image: HTMLImageElement | null;
  pickSrcForCell: (x: number, y: number) => SrcRect;
  pickSrcForColor?: (colorIndex: number, variant?: 'normal' | 'clear') => SrcRect;
};

let blinkT = 0;
const FADE_MS = 300;

function insetSrc(src: SrcRect, bleed = 0): SrcRect {
  if (!bleed) return src;
  return {
    sx: src.sx + bleed,
    sy: src.sy + bleed,
    sw: Math.max(0, src.sw - bleed * 2),
    sh: Math.max(0, src.sh - bleed * 2),
  };
}

function drawGemCell(params: {
  ctx: CanvasRenderingContext2D;
  v: number;
  px: number;
  py: number;
  cellSize: number;
  fgSkin?: Skin | undefined;
  colors: string[];
  isClearing: boolean;
  blinkT: number;
  spriteBleed?: number;
  insetPx?: number;
  isMatched?: boolean;
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
  ctx.imageSmoothingEnabled = false;
  const inset = insetPx ?? 2;
  const dx = px + inset;
  const dy = py + inset;
  const dw = cellSize - inset * 2;

  if (fgSkin?.image && fgSkin.image.complete && fgSkin.pickSrcForColor) {
    const variant = isMatched && isClearing ? 'clear' : 'normal';
    const raw = fgSkin.pickSrcForColor(v, variant);
    const { sx, sy, sw, sh } = insetSrc(raw, spriteBleed);
    ctx.save();
    ctx.drawImage(fgSkin.image, sx, sy, sw, sh, dx, dy, dw, dw);
    ctx.restore();
  } else {
    ctx.fillStyle = colors[v] ?? '#888';
    ctx.fillRect(dx, dy, dw, dw);
  }

  if (isClearing && isMatched) {
    const t = Math.min(FADE_MS, Math.max(0, blinkT));
    const alpha = 1 - t / FADE_MS;
    if (alpha > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = 'white';
      ctx.fillRect(dx, dy, dw, dw);
      ctx.restore();
    }
  }
}

export function drawStateToCanvas(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cellSize = 48,
  dtMs = 16.666,
  scrollOffsetPx = 0,
  bgSkin?: Skin,
  fgSkin?: Skin,
  // When provided as `false` the renderer will skip drawing the cursor on the canvas
  drawCursorOnCanvas = true,
  canvasBgImage?: HTMLImageElement | null,
) {
  const { width, height, grid, colors, phase, fallPieces, clearLineY } = state;
  const showClearLine = (state.linesClearedEq ?? 0) >= (state.targetLines ?? 0);

  blinkT = (blinkT + dtMs) % FADE_MS;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  if (canvasBgImage && canvasBgImage.complete) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(canvasBgImage, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = grid[y][x];
      const px = x * cellSize;
      const py = y * cellSize - scrollOffsetPx;
      if (bgSkin?.image && bgSkin.image.complete && bgSkin.pickSrcForCell) {
        const src = bgSkin.pickSrcForCell(x, y);
        const s = insetSrc(src, 0);
        ctx.drawImage(bgSkin.image, s.sx, s.sy, s.sw, s.sh, px, py, cellSize, cellSize);
      }
      if (v < 0) continue;
      const isMatched = !!(state.matchMask && state.matchMask[y] && state.matchMask[y][x]);
      drawGemCell({
        ctx,
        v,
        px,
        py,
        cellSize,
        fgSkin,
        colors,
        isClearing: phase === 'clearing',
        blinkT,
        spriteBleed: 1,
        isMatched,
      });
    }
  }

  for (const p of fallPieces) {
    const px = p.x * cellSize;
    const py = p.y * cellSize - scrollOffsetPx;
    if (fgSkin?.image && fgSkin.image.complete && fgSkin.pickSrcForColor) {
      const { sx, sy, sw, sh } = fgSkin.pickSrcForColor(p.color);
      ctx.drawImage(fgSkin.image, sx, sy, sw, sh, px + 2, py + 2, cellSize - 4, cellSize - 4);
    } else {
      ctx.fillStyle = state.colors[p.color] ?? '#888';
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    }
  }

  const particles = state.particles || [];
  if (particles.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of particles) {
      const px = pt.x;
      const py = pt.y - scrollOffsetPx;
      ctx.beginPath();
      ctx.fillStyle = pt.color;
      ctx.arc(px, py, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  const fractional = scrollOffsetPx % cellSize;
  if (fractional > 0 && state.nextRowPreview) {
    const preview: number[] = state.nextRowPreview;
    const baseY = height * cellSize - fractional;
    for (let x = 0; x < width; x++) {
      const v = preview[x];
      if (v < 0) continue;
      const px = x * cellSize;
      const py = baseY;
      if (bgSkin?.image && bgSkin.image.complete && bgSkin.pickSrcForCell) {
        const src = bgSkin.pickSrcForCell(x, height - 1);
        const s = insetSrc(src, 0);
        ctx.drawImage(bgSkin.image, s.sx, s.sy, s.sw, s.sh, px, py, cellSize, cellSize);
      }
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

  if (showClearLine) {
    const yPix = clearLineY * cellSize + 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, yPix);
    ctx.lineTo(width * cellSize, yPix);
    ctx.stroke();
    ctx.restore();
  }

  // Win line is rendered in DOM (WinLine component). Canvas renderer no
  // longer draws the solid white win threshold so the UI can supply a
  // styled, accessible bar that animates independently of the canvas.
  // Draw cursor outline on canvas only when requested. When a DOM/SVG overlay
  // is active we prefer the overlay styling; the canvas cursor is a fallback
  // for environments without the overlay.
  if (drawCursorOnCanvas) {
    try {
      const cx = (state.cursorX || 0) * cellSize;
      const cy = (state.cursorY || 0) * cellSize - scrollOffsetPx;
      const cw = cellSize * 2;
      const ch = cellSize;
      ctx.save();
      // subtle drop shadow glow
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = Math.max(2, Math.floor(cellSize * 0.06));
      ctx.lineWidth = Math.max(2, Math.floor(cellSize * 0.06));
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      // rounded rect stroke
      const r = Math.max(4, Math.floor(cellSize * 0.08));
      const x = cx + 1.5;
      const y = cy + 1.5;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + cw - r, y);
      ctx.quadraticCurveTo(x + cw, y, x + cw, y + r);
      ctx.lineTo(x + cw, y + ch - r);
      ctx.quadraticCurveTo(x + cw, y + ch, x + cw - r, y + ch);
      ctx.lineTo(x + r, y + ch);
      ctx.quadraticCurveTo(x, y + ch, x, y + ch - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    } catch {
      /* ignore cursor draw errors */
    }
  }
}
