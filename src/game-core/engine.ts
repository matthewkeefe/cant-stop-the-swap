export type Cell = number;
export type Phase = "idle" | "clearing" | "settling";

export type FallPiece = {
  x: number;
  fromY: number;
  toY: number;
  y: number; 
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
  score: number;
  matchesTotal: number;
  linesClearedEq: number;
  targetLines: number;
  autoRiseRateRowsPerSec: number;
  riseAccumRows: number;
  clearLineY: number;
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
  fallPieces: FallPiece[] = [];
  fallSpeedRowsPerSec = 18;
  score = 0;
  matchesTotal = 0;
  linesClearedEq = 0;
  targetLines = 5;
  autoRiseRateRowsPerSec = 0.6;
  riseAccumRows = 0;
  clearLineY: number;
  showClearLine = false;
  hasWon = false;
  hasLost = false;
  private chainMultTable = [1, 2, 4, 8, 16, 32, 64];

  constructor(width = 6, height = 12, numColors = 5) {
    this.width = width;
    this.height = height;
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
          (x >= 2 && color === this.grid[y][x - 1] && color === this.grid[y][x - 2]) ||
          (y <= this.height - 3 && color === this.grid[y + 1][x] && color === this.grid[y + 2][x])
        && tries < 10);
        this.grid[y][x] = color;
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

          // Every 6 gems cleared = 1 line
          const lineEq = Math.floor(tilesCleared / 6);
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
          this.fallPieces.push({ x, fromY, toY: writeY, y: fromY, color });
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
    const newRow: number[] = Array.from({ length: this.width }, () =>
      this.randColorIndex()
    );
    this.grid[this.height - 1] = newRow;
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
