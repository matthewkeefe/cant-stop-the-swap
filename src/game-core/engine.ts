// Simple engine: grid, cursor, swap. Colors are indices 0..N-1.
export type Cell = number;
export type GameState = {
  grid: Cell[][];
  width: number;
  height: number;
  cursorX: number; // left cell of the 2-cell cursor
  cursorY: number;
  colors: string[];
};

export class Engine {
  width: number;
  height: number;
  colors: string[];
  grid: Cell[][];
  cursorX = 0;
  cursorY = 0;

  constructor(width = 6, height = 12, numColors = 5) {
    this.width = width;
    this.height = height;
    // High-contrast starter palette; adjust later as you like
    this.colors = ["#e63946", "#2a9d8f", "#457b9d", "#f4a261", "#a29bfe"].slice(
      0,
      numColors
    );
    this.grid = [];
    for (let y = 0; y < height; y++) {
      const row: Cell[] = [];
      for (let x = 0; x < width; x++) {
        row.push(this.randColorIndex());
      }
      this.grid.push(row);
    }
  }

  private randColorIndex(): number {
    return Math.floor(Math.random() * this.colors.length);
  }

  moveCursor(dx: number, dy: number) {
    // cursor covers two cells horizontally; keep X within [0, width-2]
    this.cursorX = Math.max(0, Math.min(this.width - 2, this.cursorX + dx));
    this.cursorY = Math.max(0, Math.min(this.height - 1, this.cursorY + dy));
  }

  swap() {
    const x = this.cursorX;
    const y = this.cursorY;
    const a = this.grid[y][x];
    const b = this.grid[y][x + 1];
    this.grid[y][x] = b;
    this.grid[y][x + 1] = a;
  }

  getState(): GameState {
    return {
      grid: this.grid,
      width: this.width,
      height: this.height,
      cursorX: this.cursorX,
      cursorY: this.cursorY,
      colors: this.colors,
    };
  }
}
