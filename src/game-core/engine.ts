// Prism Grid engine (TA-style):
// - Rising stack from bottom (auto-rise pauses during clear/settle)
// - Swap/match/chain with score using a chain-multiplier table
// - Dashed clear line appears after target progress; win on clear below the line
// - Manual raise (one row) when idle
// Cells: -1 = empty, 0..N-1 = color index.

export type Cell = number;
export type Phase = "idle" | "clearing" | "settling";

export type FallPiece = {
  x: number;
  fromY: number;
  toY: number;
  y: number; // fractional row during animation
  color: number;
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

  // Scoring / progress
  score: number;
  matchesTotal: number;        // number of clear events (chains counted as separate events)
  linesClearedEq: number;      // tiles/width floored
  targetLines: number;

  // Rising stack
  autoRiseRateRowsPerSec: number;
  riseAccumRows: number;

  // Win/Lose
  clearLineY: number;          // 0 = top
  showClearLine: boolean;
  hasWon: boolean;
  hasLost: boolean;
};

export class Engine {
  width: number;
  height: number;
  colors: string[];
  grid: Cell[][];
  cursorX = 0;
  cursorY = 0;

  phase: Phase = "idle";
  matchMask: boolean[][];
  clearTimerMs = 0;
  chainCount = 0;

  // Animation (fall)
  fallPieces: FallPiece[] = [];
  fallSpeedRowsPerSec = 18;

  // Score/progress
  score = 0;
  matchesTotal = 0;
  linesClearedEq = 0;
  targetLines = 10; // UI can change

  // Rising stack
  autoRiseRateRowsPerSec = 0.6; // UI can change; paused during clear/settle
  riseAccumRows = 0;

  // Win/Lose state
  clearLineY: number;
  showClearLine = false;
  hasWon = false;
  hasLost = false;

  // Multiplier table (B1): x1->1, x2->2, x3->4, x4->8, x5->16...
  private chainMultTable = [1, 2, 4, 8, 16, 32, 64];

  constructor(width = 6, height = 12, numColors = 5) {
    this.width = width;
    this.height = height;
    this.colors = ["#e63946", "#2a9d8f", "#457b9d", "#f4a261", "#a29bfe"].slice(
      0,
      numColors
    );
    // Start with an empty board; title screen will call setStartingLines(...)
    this.grid = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => -1)
    );
    this.matchMask = this.blankMask();
    // dashed line halfway by default (can tweak)
    this.clearLineY = Math.floor(this.height * 0.5);
  }

  /** Fill bottom N rows with random tiles; rows above remain empty (-1). */
  setStartingLines(n: number) {
    const rows = Math.max(0, Math.min(n, this.height));
    for (let y = this.height - 1; y >= this.height - rows; y--) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x] = this.randColorIndex();
      }
    }
  }

  private blankMask(): boolean[][] {
    return Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => false)
    );
  }

  private randColorIndex(): number {
    return Math.floor(Math.random() * this.colors.length);
  }

  /** Set cursor to an absolute grid position (bypasses phase checks). */
  setCursorAbsolute(x: number, y: number) {
    this.cursorX = Math.max(0, Math.min(this.width - 2, x | 0));
    this.cursorY = Math.max(0, Math.min(this.height - 1, y | 0));
  }

  // Cursor always moves
  moveCursor(dx: number, dy: number) {
    this.cursorX = Math.max(0, Math.min(this.width - 2, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.height - 1, this.cursorY + dy));
  }

  // Swap only when idle and both cells are non-empty
  swap() {
    if (this.phase !== "idle" || this.hasWon || this.hasLost) return;
    const x = this.cursorX;
    const y = this.cursorY;
    const a = this.grid[y][x];
    const b = this.grid[y][x + 1];
    if (a < 0 || b < 0) return;

    this.grid[y][x] = b;
    this.grid[y][x + 1] = a;

    const any = this.scanForMatches();
    if (any) {
      this.phase = "clearing";
      this.clearTimerMs = 230;
      this.chainCount = Math.max(this.chainCount, 1);
    }
  }

  /** Manual raise one row (A1). Returns true if this caused a loss. */
  manualRaiseOnce(): boolean {
    if (this.phase !== "idle" || this.hasWon || this.hasLost) return false;
    const lost = this.insertRowFromBottom();
    if (lost) this.hasLost = true;
    return lost;
  }

  /** Called every frame with dt in ms. */
  update(dtMs: number) {
    if (this.hasWon || this.hasLost) return;

    // Auto-rise only when idle (pause during clear/settle)
    if (this.phase === "idle" && this.autoRiseRateRowsPerSec > 0) {
      this.riseAccumRows += (this.autoRiseRateRowsPerSec * dtMs) / 1000;
      while (this.riseAccumRows >= 1) {
        this.riseAccumRows -= 1;
        const lost = this.insertRowFromBottom();
        if (lost) {
          this.hasLost = true;
          return;
        }
      }
    }

    if (this.phase === "clearing") {
      this.clearTimerMs -= dtMs;
      if (this.clearTimerMs <= 0) {
        const { tilesCleared, clearedBelowLine } = this.applyClearAndCount();
        if (tilesCleared > 0) {
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
        }
        this.startSettlingAnimation();
      }
      return;
    }

    if (this.phase === "settling") {
      if (this.fallPieces.length > 0) {
        const dy = (this.fallSpeedRowsPerSec * dtMs) / 1000;
        let allLanded = true;
        for (const p of this.fallPieces) {
          if (p.y < p.toY) p.y = Math.min(p.y + dy, p.toY);
          if (p.y < p.toY) allLanded = false;
        }
        if (!allLanded) return;

        for (const p of this.fallPieces) this.grid[p.toY][p.x] = p.color;
        this.fallPieces = [];
      }

      // Refill (blanks allowed to remain if you later add budgets)
      this.fillNewCells();

      const cascades = this.scanForMatches();
      if (cascades) {
        this.phase = "clearing";
        this.clearTimerMs = 200;
        this.chainCount += 1;
      } else {
        this.phase = "idle";
        this.chainCount = 0;
      }
      return;
    }
  }

  // --- Matching/Clearing ---

  private scanForMatches(): boolean {
    this.matchMask = this.blankMask();
    let found = false;

    // Horizontal
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

    // Vertical
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

  /** Clear matched tiles; return count and whether any were below dashed line. */
  private applyClearAndCount(): { tilesCleared: number; clearedBelowLine: boolean } {
    let tilesCleared = 0;
    let clearedBelowLine = false;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.matchMask[y][x]) {
          tilesCleared++;
          if (this.showClearLine && y >= this.clearLineY) clearedBelowLine = true;
          this.grid[y][x] = -1;
        }
      }
    }
    return { tilesCleared, clearedBelowLine };
  }

  private startSettlingAnimation() {
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
          this.fallPieces.push({ x, fromY, toY: writeY, y: fromY, color });
        }
        writeY--;
      }
      for (let y = writeY; y >= 0; y--) this.grid[y][x] = -1;
    }

    this.phase = "settling";
  }

  private fillNewCells() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x] === -1) this.grid[y][x] = this.randColorIndex();
      }
    }
  }

  // --- Rising stack ---

  /** Insert one new random row at the bottom; raise everything by 1; lose if top would overflow. */
  private insertRowFromBottom(): boolean /* lost? */ {
    // If top row occupied, raising would overflow -> lose.
    for (let x = 0; x < this.width; x++) {
      if (this.grid[0][x] >= 0) return true;
    }

    // Shift all rows up by 1 (top row discarded), write new bottom row
    for (let y = 0; y < this.height - 1; y++) {
      this.grid[y] = this.grid[y + 1].slice();
    }
    const newRow: number[] = Array.from({ length: this.width }, () =>
      this.randColorIndex()
    );
    this.grid[this.height - 1] = newRow;

    // NEW: cursor should ride with the stack (move one row up on-screen)
    // Clamp to 0..height-1 just in case
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

      clearLineY: this.clearLineY,
      showClearLine: this.showClearLine,
      hasWon: this.hasWon,
      hasLost: this.hasLost,
    };
  }
}
