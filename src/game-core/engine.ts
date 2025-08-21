export type Cell = number;
export type Phase = "idle" | "clearing" | "settling";

export type FallPiece = {
  x: number;
  fromY: number;
  toY: number;
  y: number;
  color: number;
  // Optional per-piece fall speed in rows per second. If undefined, Engine.fallSpeedRowsPerSec is used.
  speedRowsPerSec?: number;
};

export type Particle = {
  x: number; // px (unscrolled canvas-space: y is in same space)
  y: number; // px (unscrolled)
  vx: number; // px/sec
  vy: number; // px/sec
  ageMs: number;
  lifeMs: number;
  color: string; // CSS color
  size: number; // px radius
};

export type GameState = {
  grid: Cell[][];
  width: number;
  height: number;
  cursorX: number;
  cursorY: number;
  colors: string[];
  phase: Phase;
  matchMask: boolean[][];
  chainCount: number;
  fallPieces: FallPiece[];
  score: number;
  matchesTotal: number;
  linesClearedEq: number;
  targetLines: number;
  autoRiseRateRowsPerSec: number;
  riseAccumRows: number;
  risePauseMs: number;
  risePauseMaxMs: number;
  clearLineY: number;
  showClearLine: boolean;
  hasWon: boolean;
  hasLost: boolean;
  // fractional upward scroll in pixels (renderer should subtract this)
  scrollOffsetPx?: number;
  particles: Particle[];
  winLineY?: number;
  nextRowPreview?: number[];
};

import type { Mask } from "../mask";
import { cellTouchesMask } from "../mask";

export class Engine {
  width: number;
  height: number;
  colors: string[];
  cellSize: number;
  grid: Cell[][];
  cursorX = 0;
  cursorY = 0;
  phase: Phase = "idle";
  matchMask: boolean[][];
  mask?: Mask;
  clearTimerMs = 0;
  chainCount = 0;
  fallPieces: FallPiece[] = [];
  fallSpeedRowsPerSec = 18;
  // Multiplier applied to fallSpeedRowsPerSec for cascades that result from clears.
  // Values < 1 slow the animation; tune to taste (default 0.6).
  cascadeFallSpeedMultiplier = 0.6;
  // Scrolling config: pixels/sec upward
  scrollSpeedPxPerSec = 24; // default: half cell/sec for 48px cell
  // Particle system
  particles: Particle[] = [];
  particleGravityPxPerSec2 = 1600; // downward gravity
  particleLifeMs = 800;
  particlesPerTile = 6;
  // current fractional scroll offset in pixels
  scrollOffsetPx = 0;
  // Prebuilt level queue; when empty we insert empty rows
  levelQueue: number[][] = [];
  // Win line in pixels from top (renderer coordinate space)
  // totalLevelLines: will be set by the app (App.tsx). Default 0 so the app
  // is the single source of truth for this value.
  totalLevelLines = 0;
  // How many rows have been inserted from the queue into the visible grid
  // (including initial visible rows populated by setLevelQueue).
  rowsInserted = 0;
  // Mask/contact hook placeholders
  maskCheckSamples = [0.25, 0.5, 0.75]; // sample fractions across cell width
  maskImageWidth = 0; // populated if mask provided (mask module gives width)
  onTopContact?: () => void;
  onWin?: () => void;
  // Called when a clear/match occurs. Receives the current chain count (1 = first clear).
  onMatch?: (chainCount: number) => void;
  // Called whenever the player performs a swap action that changes grid cells
  onSwap?: () => void;
  score = 0;
  matchesTotal = 0;
  linesClearedEq = 0;
  targetLines = 5;
  autoRiseRateRowsPerSec = 0.6;
  riseAccumRows = 0;
  // milliseconds remaining to pause automatic rising
  risePauseMs = 0;
  // the most recent total pause duration used to render a progress bar (ms)
  risePauseMaxMs = 0;
  clearLineY: number;
  showClearLine = false;
  hasWon = false;
  hasLost = false;
  private chainMultTable = [1, 2, 4, 8, 16, 32, 64];

  constructor(width = 6, height = 12, numColors = 5) {
    this.width = width;
    this.height = height;
    this.cellSize = 64; // default to 64px tiles
    this.colors = ["#e63946", "#2a9d8f", "#457b9d", "#f4a261", "#a29bfe"].slice(
      0,
      numColors
    );
    this.grid = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => -1)
    );
    this.matchMask = this.blankMask();
    this.clearLineY = Math.floor(this.height * 0.5);
    // Start cursor in the middle of the board
    this.cursorX = Math.floor((this.width - 2) / 2);
    this.cursorY = Math.floor(this.height / 2);
    // mask is optional and can be set via setMask()
  }

  // Provide a prebuilt queue of rows (each row is length = width). Rows are
  // shifted in order: shiftNextRow() returns the next row to insert at bottom.
  // rows: queue ordered so that rows[0] is the next row to be inserted at the
  // bottom. visibleCount (optional) controls how many rows to populate into
  // the visible grid immediately; the rest remain in this.levelQueue for
  // future scrolling.
  setLevelQueue(rows: number[][], visibleCount?: number) {
    const want = visibleCount !== undefined ? Math.max(0, visibleCount | 0) : 0;

    // Normalize incoming rows to width and build a simulated grid copy so we
    // can sanitize each queued row as if it were inserted one-by-one on top
    // of the current grid. This prevents queued rows from forming immediate
    // horizontal or vertical triples when they arrive.
    const simulatedGrid = this.grid.map((r) => r.slice());
    const normalizedRows: number[][] = rows.map((r) =>
      Array.from({ length: this.width }, (_, i) =>
        r[i] !== undefined ? r[i] : -1
      )
    );

    const sanitizedQueue: number[][] = [];
    for (const rawRow of normalizedRows) {
      const sanitized = this.sanitizeRow(rawRow.slice(), simulatedGrid);
      sanitizedQueue.push(sanitized.slice());
      // Simulate shifting the grid up and inserting the sanitized row so
      // subsequent queued rows are sanitized with correct vertical context.
      for (let y = 0; y < this.height - 1; y++)
        simulatedGrid[y] = simulatedGrid[y + 1].slice();
      simulatedGrid[this.height - 1] = sanitized.slice();
    }

    // Store the pre-sanitized queue
    this.levelQueue = sanitizedQueue.slice();

    // Prepare visible grid and populate bottom-up with up to `want` rows
    const temp: number[][] = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => -1)
    );
    let placed = 0;
    for (let y = this.height - 1; y >= 0 && placed < want; y--) {
      if (this.levelQueue.length > 0) {
        const r = this.levelQueue.shift()!;
        temp[y] = r.slice();
        placed++;
      } else break;
    }
    this.grid = temp;
    // Track how many rows we've inserted into the visible grid so far.
    this.rowsInserted = placed;
  }

  // Helper to pop next row or return empty row when queue is empty
  private shiftNextRow(): number[] {
    if (this.levelQueue.length > 0) {
      const r = this.levelQueue.shift()!;
      // Queue rows are pre-sanitized in setLevelQueue(); return a copy.
      return r.slice();
    }
    return Array.from({ length: this.width }, () => -1);
  }

  // Sanitize a candidate row so it does not create immediate 3-in-a-row
  // matches when inserted at the bottom. This removes horizontal triples
  // within the row itself and avoids vertical triples with the two rows
  // that will be directly above the inserted row (current bottom rows).
  private sanitizeRow(
    row: number[],
    gridContext: Cell[][] = this.grid
  ): number[] {
    const w = this.width;
    const numColors = this.colors.length;
    const out = Array.from({ length: w }, (_, i) =>
      row[i] !== undefined ? row[i] : -1
    );

    // Helper: pick a color not in the forbidden set
    const pickAlt = (forbidden: Set<number>) => {
      for (let c = 0; c < numColors; c++) if (!forbidden.has(c)) return c;
      // fallback
      return 0;
    };

    // First pass: fix horizontal triples left-to-right within the row
    for (let x = 0; x < w; x++) {
      if (out[x] < 0) continue;
      if (x >= 2 && out[x] === out[x - 1] && out[x - 1] === out[x - 2]) {
        // avoid matching the previous two
        const forbidden = new Set<number>([out[x - 1]]);
        // also avoid creating a vertical triple at this column
        const top1 = gridContext[this.height - 1]?.[x] ?? -1;
        const top2 = gridContext[this.height - 2]?.[x] ?? -1;
        if (top1 >= 0 && top1 === top2) forbidden.add(top1);
        out[x] = pickAlt(forbidden);
      }
    }

    // Second pass: ensure no vertical triples with the two rows above
    for (let x = 0; x < w; x++) {
      if (out[x] < 0) continue;
      const top1 = gridContext[this.height - 1]?.[x] ?? -1; // will be above after shift
      const top2 = gridContext[this.height - 2]?.[x] ?? -1;
      if (top1 >= 0 && top2 >= 0 && top1 === top2 && out[x] === top1) {
        const forbidden = new Set<number>([top1]);
        // Also avoid making horizontal triple by matching neighbors
        if (x >= 1 && out[x - 1] >= 0 && out[x - 1] === out[x - 2])
          forbidden.add(out[x - 1]);
        out[x] = pickAlt(forbidden);
      }
    }

    return out;
  }

  setStartingLines(n: number) {
    const rows = Math.max(0, Math.min(n, this.height));
    //console.log('[Engine] setStartingLines called');
    for (let y = this.height - 1; y >= this.height - rows; y--) {
      for (let x = 0; x < this.width; x++) {
        let color;
        let tries = 0;
        do {
          color = this.randColorIndex();
          tries++;
        } while (
          (x >= 2 &&
            color === this.grid[y][x - 1] &&
            color === this.grid[y][x - 2]) ||
          (y <= this.height - 3 &&
            color === this.grid[y + 1][x] &&
            color === this.grid[y + 2][x] &&
            tries < 10)
        );
        this.grid[y][x] = color;
      }
    }
  }

  private blankMask(): boolean[][] {
    return Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => false)
    );
  }

  setMask(mask: Mask, maskImageWidth?: number) {
    this.mask = mask;
    if (maskImageWidth) this.maskImageWidth = maskImageWidth;
  }

  // Check top contact against mask using multiple sample points across each cell.
  private checkTopContact(): boolean {
    if (!this.mask) return false;
    const cellPx = this.cellSize;
    const canvasWidthPx = this.width * cellPx;
    const scale = this.mask.width / canvasWidthPx;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const v = this.grid[y][x];
        if (v < 0) continue;
        // compute cell top in screen pixels
        const cellTopY = y * cellPx - this.scrollOffsetPx;
        // prepare sample Xs in mask image space
        const sampleXs: number[] = this.maskCheckSamples.map((f) => {
          const localX = x * cellPx + f * cellPx;
          return localX * scale;
        });
        if (cellTouchesMask(this.mask, cellTopY, sampleXs)) return true;
      }
    }
    return false;
  }

  private randColorIndex(): number {
    return Math.floor(Math.random() * this.colors.length);
  }

  setCursorAbsolute(x: number, y: number) {
    this.cursorX = Math.max(0, Math.min(this.width - 2, x | 0));
    this.cursorY = Math.max(0, Math.min(this.height - 1, y | 0));
  }

  moveCursor(dx: number, dy: number) {
    this.cursorX = Math.max(0, Math.min(this.width - 2, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.height - 1, this.cursorY + dy));
  }

  swap() {
    if (this.phase !== "idle" || this.hasWon || this.hasLost) return;
    const x = this.cursorX;
    const y = this.cursorY;
    const a = this.grid[y][x];
    const b = this.grid[y][x + 1];

    if (a < 0 && b < 0) return;

    this.grid[y][x] = b;
    this.grid[y][x + 1] = a;

    // Notify listeners that a swap occurred
    if (this.onSwap) this.onSwap();

    const anyMatches = this.scanForMatches();
    if (anyMatches) {
      this.phase = "clearing";
      this.clearTimerMs = 230;
      this.chainCount = Math.max(this.chainCount, 1);
      return;
    }

    if (a < 0 || b < 0) {
      this.startSettlingAnimation();
      return;
    }
  }

  manualRaiseOnce(): boolean {
    if (this.phase !== "idle" || this.hasWon || this.hasLost) return false;
    const lost = this.insertRowFromBottom();
    if (lost) this.hasLost = true;
    return lost;
  }

  update(dtMs: number) {
    if (this.hasWon || this.hasLost) return;
    // Tick down any rise pause timer first; when >0, automatic rising is paused
    if (this.risePauseMs > 0) {
      this.risePauseMs = Math.max(0, this.risePauseMs - dtMs);
    }
    // Update particle physics every tick so sprays animate regardless of phase
    if (this.particles.length > 0) {
      const alive: Particle[] = [];
      for (const p of this.particles) {
        p.ageMs += dtMs;
        if (p.ageMs < p.lifeMs) {
          // integrate
          p.vy += (this.particleGravityPxPerSec2 * dtMs) / 1000;
          p.x += (p.vx * dtMs) / 1000;
          p.y += (p.vy * dtMs) / 1000;
          alive.push(p);
        }
      }
      this.particles = alive;
    }
    // SCROLLING: advance fractional pixel scroll first
    // Only perform automatic scrolling when idle, scrolling speed > 0, and
    // not currently paused by a match countdown.
    if (
      this.phase === "idle" &&
      this.scrollSpeedPxPerSec > 0 &&
      this.risePauseMs <= 0
    ) {
      this.scrollOffsetPx += (this.scrollSpeedPxPerSec * dtMs) / 1000;
      const cellPx = this.cellSize;
      // Consume as many full rows as needed (handle large dtMs)
      while (this.scrollOffsetPx >= cellPx) {
        this.scrollOffsetPx -= cellPx;
        const lost = this.insertRowFromBottomFromQueue();
        if (lost) {
          this.hasLost = true;
          return;
        }
      }
      // Immediate top-of-screen loss: if any occupied cell's top edge
      // crosses y <= 0 (consider fractional scrollOffset), the game is lost
      // immediately instead of waiting for a full-row shift.
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          if (this.grid[y][x] >= 0) {
            const topY = y * cellPx - this.scrollOffsetPx;
            if (topY <= 0) {
              this.hasLost = true;
              return;
            }
          }
        }
      }
      // After scroll movement (including fractional), check mask contact
      if (this.mask && this.checkTopContact()) {
        if (this.onTopContact) this.onTopContact();
      }
    }

    if (this.phase === "clearing") {
      this.clearTimerMs -= dtMs;
      if (this.clearTimerMs <= 0) {
        const { tilesCleared, clearedBelowLine } = this.applyClearAndCount();
        if (tilesCleared > 0) {
          // Notify listeners that a match/clear happened. Pass the chainCount
          // which will be 1 for the initial clear in a chain or higher for
          // cascades.
          if (this.onMatch) this.onMatch(this.chainCount);
          this.matchesTotal += 1;
          const mult =
            this.chainCount - 1 < this.chainMultTable.length
              ? this.chainMultTable[this.chainCount - 1]
              : this.chainMultTable[this.chainMultTable.length - 1];
          this.score += tilesCleared * mult;

          const lineEq = Math.floor(tilesCleared / this.width);
          if (lineEq > 0) this.linesClearedEq += lineEq;

          if (!this.showClearLine && this.linesClearedEq >= this.targetLines) {
            this.showClearLine = true;
          }
          if (this.showClearLine && clearedBelowLine) {
            this.hasWon = true;
            return;
          }
          // Add pause time based on chainCount: 1-chain -> 1000ms, 2-chain -> 2000ms,
          // and exponential thereafter (2^(n-1) * 1000).
          const baseMs = 1000;
          const add = baseMs * Math.pow(2, Math.max(0, this.chainCount - 1));
          this.risePauseMs += add;
          // track the current total as the max for the progress bar; if
          // multiple adds occur, the bar resets to the new total so it
          // represents the most-recent countdown length.
          this.risePauseMaxMs = this.risePauseMs;
          // Emit rainbow particles for every cleared tile
          const cellPx = this.cellSize;
          for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
              if (this.matchMask[y][x]) {
                const cx = x * cellPx + cellPx / 2;
                const cy = y * cellPx + cellPx / 2;
                for (let k = 0; k < this.particlesPerTile; k++) {
                  const angle = Math.random() * Math.PI * 2;
                  const speed = 160 + Math.random() * 200; // px/sec
                  const vx = Math.cos(angle) * speed;
                  const vy = -120 - Math.random() * 420; // upward bias
                  const color = `hsl(${Math.floor(
                    Math.random() * 360
                  )},90%,60%)`;
                  const size = 2 + Math.random() * 3;
                  this.particles.push({
                    x: cx,
                    y: cy,
                    vx,
                    vy,
                    ageMs: 0,
                    lifeMs: this.particleLifeMs,
                    color,
                    size,
                  });
                }
              }
            }
          }
        }
        this.startSettlingAnimation();
      }
      return;
    }

    if (this.phase === "settling") {
      if (this.fallPieces.length > 0) {
        let allLanded = true;
        // Update each piece with its own speed (if provided) so cascade pieces
        // can fall slower than normal moves.
        for (const p of this.fallPieces) {
          const speed = p.speedRowsPerSec ?? this.fallSpeedRowsPerSec;
          const dy = (speed * dtMs) / 1000;
          if (p.y < p.toY) p.y = Math.min(p.y + dy, p.toY);
          if (p.y < p.toY) allLanded = false;
        }
        if (!allLanded) return;

        for (const p of this.fallPieces) this.grid[p.toY][p.x] = p.color;
        this.fallPieces = [];
      }

      const cascades = this.scanForMatches();
      if (cascades) {
        this.phase = "clearing";
        this.clearTimerMs = 200;
        this.chainCount += 1;
      } else {
        this.phase = "idle";
        this.chainCount = 0;
        // WIN CHECK: after cascades settled, if the on-screen win line has
        // risen into view (rowsInserted >= totalLevelLines) and no occupied
        // cell exists above the win line, fire onWin. This matches the
        // renderer which only draws the win line once it has risen into the
        // visible canvas.
        if (this.rowsInserted >= this.totalLevelLines) {
          const cellPx = 48;
          const canvasH = this.height * cellPx;
          // Use the same formula as getState().winLineY so the logical win
          // check matches the on-screen line position. The win line starts
          // below the canvas until enough rows have been inserted.
          const winLineScreenY =
            canvasH +
            (this.totalLevelLines - this.rowsInserted) * cellPx -
            this.scrollOffsetPx;
          let anyAbove = false;
          for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
              if (this.grid[y][x] >= 0) {
                const topY = y * cellPx - this.scrollOffsetPx;
                const bottomY = topY + cellPx; // cell bottom in screen coords
                // Consider a cell "above" the win line only if its entire
                // bottom edge is above the line. This allows cells that are
                // partially below the line (e.g. the row immediately below)
                // to not block the win.
                if (bottomY <= winLineScreenY) {
                  anyAbove = true;
                  break;
                }
              }
            }
            if (anyAbove) break;
          }
          if (!anyAbove) {
            this.hasWon = true;
            if (this.onWin) this.onWin();
            return;
          }
        }
      }
      return;
    }
    // Expose scroll offset in state for renderer
    // (no-op here; getState will include scrollOffsetPx)
  }

  // Insert row using prebuilt queue (or empty) - shifts grid up by one row
  private insertRowFromBottomFromQueue(): boolean {
    // If any cell in the top visible row is occupied, that's a loss (blocks
    // have reached the top of the visible grid). This is distinct from the
    // mask-based top contact hook which callers may use for soft alerts.
    for (let x = 0; x < this.width; x++) {
      if (this.grid[0][x] >= 0) return true;
    }
    // Fire mask contact hook if mask indicates contact (non-lethal by default)
    if (this.mask && this.checkTopContact()) {
      if (this.onTopContact) this.onTopContact();
    }
    // shift rows up
    for (let y = 0; y < this.height - 1; y++) {
      this.grid[y] = this.grid[y + 1].slice();
    }
    // Next row is from queue or empty. Queue rows are pre-sanitized in
    // setLevelQueue(), so use them directly to avoid visible changes while
    // the row is rising into view.
    const newRow = this.shiftNextRow();
    // Ensure length
    if (newRow.length !== this.width) {
      const r = Array.from({ length: this.width }, () => -1);
      for (let i = 0; i < Math.min(newRow.length, this.width); i++)
        r[i] = newRow[i];
      this.grid[this.height - 1] = r;
    } else {
      this.grid[this.height - 1] = newRow.slice();
    }
    this.cursorY = Math.max(0, this.cursorY - 1);
    this.rowsInserted++;
    return false;
  }

  private scanForMatches(): boolean {
    this.matchMask = this.blankMask();
    let found = false;

    for (let y = 0; y < this.height; y++) {
      let runStart = 0;
      for (let x = 1; x <= this.width; x++) {
        const prev = this.grid[y][x - 1];
        const curr = x < this.width ? this.grid[y][x] : Number.NaN;
        const same = x < this.width && prev >= 0 && curr >= 0 && prev === curr;
        if (!same) {
          const len = x - runStart;
          if (this.grid[y][x - 1] >= 0 && len >= 3) {
            found = true;
            for (let k = runStart; k < x; k++) this.matchMask[y][k] = true;
          }
          runStart = x;
        }
      }
    }

    for (let x = 0; x < this.width; x++) {
      let runStart = 0;
      for (let y = 1; y <= this.height; y++) {
        const prev = this.grid[y - 1][x];
        const curr = y < this.height ? this.grid[y][x] : Number.NaN;
        const same = y < this.height && prev >= 0 && curr >= 0 && prev === curr;
        if (!same) {
          const len = y - runStart;
          if (this.grid[y - 1][x] >= 0 && len >= 3) {
            found = true;
            for (let k = runStart; k < y; k++) this.matchMask[k][x] = true;
          }
          runStart = y;
        }
      }
    }
    return found;
  }

  private applyClearAndCount(): {
    tilesCleared: number;
    clearedBelowLine: boolean;
  } {
    let tilesCleared = 0;
    let clearedBelowLine = false;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.matchMask[y][x]) {
          tilesCleared++;
          if (this.showClearLine && y >= this.clearLineY)
            clearedBelowLine = true;
          this.grid[y][x] = -1;
        }
      }
    }
    return { tilesCleared, clearedBelowLine };
  }

  private startSettlingAnimation() {
    //console.log('[Engine] startSettlingAnimation called');
    this.fallPieces = [];
    for (let x = 0; x < this.width; x++) {
      const col: { color: number; fromY: number }[] = [];
      for (let y = 0; y < this.height; y++) {
        const v = this.grid[y][x];
        if (v >= 0) col.push({ color: v, fromY: y });
      }

      let writeY = this.height - 1;
      for (let i = col.length - 1; i >= 0; i--) {
        const { color, fromY } = col[i];
        if (fromY !== writeY) {
          this.grid[fromY][x] = -1;
          // Default speed; if we're settling immediately after a clear we
          // want cascades to fall slower so they read visually as part of
          // the chain. StartSettlingAnimation is called from both swap()
          // and after clearing; use the engine phase to decide multiplier.
          const speed =
            this.phase === "clearing"
              ? this.fallSpeedRowsPerSec * this.cascadeFallSpeedMultiplier
              : this.fallSpeedRowsPerSec;
          this.fallPieces.push({
            x,
            fromY,
            toY: writeY,
            y: fromY,
            color,
            speedRowsPerSec: speed,
          });
        }
        writeY--;
      }
      // Do NOT clear all cells above the last gem; leave them as-is
    }
    this.phase = "settling";
  }

  private insertRowFromBottom(): boolean {
    for (let x = 0; x < this.width; x++) {
      if (this.grid[0][x] >= 0) return true;
    }
    for (let y = 0; y < this.height - 1; y++) {
      this.grid[y] = this.grid[y + 1].slice();
    }
    const rawRow: number[] = Array.from({ length: this.width }, () =>
      this.randColorIndex()
    );
    this.grid[this.height - 1] = this.sanitizeRow(rawRow);
    this.cursorY = Math.max(0, this.cursorY - 1);
    return false;
  }

  getState(): GameState {
    return {
      grid: this.grid,
      width: this.width,
      height: this.height,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      colors: this.colors,
      phase: this.phase,
      matchMask: this.matchMask,
      chainCount: this.chainCount,
      fallPieces: this.fallPieces,
      score: this.score,
      matchesTotal: this.matchesTotal,
      linesClearedEq: this.linesClearedEq,
      targetLines: this.targetLines,
      autoRiseRateRowsPerSec: this.autoRiseRateRowsPerSec,
      riseAccumRows: this.riseAccumRows,
      risePauseMs: this.risePauseMs,
      risePauseMaxMs: this.risePauseMaxMs,
      clearLineY: this.clearLineY,
      showClearLine: this.showClearLine,
      hasWon: this.hasWon,
      hasLost: this.hasLost,
      scrollOffsetPx: this.scrollOffsetPx,
      // The win line concept: it should start off-screen below the canvas and
      // only move into the visible area once `totalLevelLines` rows have been
      // inserted. We compute the line as the canvas bottom plus the remaining
      // rows (totalLevelLines - rowsInserted) so that when rowsInserted <
      // totalLevelLines the line is below the canvas (off-screen). As more
      // rows are inserted the value will decrease and the line will rise into
      // view. Finally subtract fractional scrollOffsetPx.
      winLineY:
        this.height * this.cellSize +
        (this.totalLevelLines - this.rowsInserted) * this.cellSize -
        this.scrollOffsetPx,
      // Provide a preview of the next row that will be inserted from the
      // level queue (or an empty row when queue is empty). Renderer can use
      // this to draw incoming tiles rising into view during fractional
      // `scrollOffsetPx` values.
      // The queue is pre-sanitized in setLevelQueue(), so return a shallow
      // copy for the renderer preview (no further sanitization). This keeps
      // the rising preview identical to the row that will actually be
      // inserted.
      nextRowPreview:
        this.levelQueue.length > 0
          ? this.levelQueue[0].slice()
          : Array.from({ length: this.width }, () => -1),
      particles: this.particles.slice(),
    };
  }
}
