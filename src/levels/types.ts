export type Level = {
  id: string;
  name: string;
  // URL for background image, or null for none (transparent)
  background: string | null;
  totalLines: number;
  startingLines: number;
  targetLines: number;
  raiseRate: number; // rows per second
  // optional music URL to play for this level
  music?: string | null;
};
