export type Level = {
  id: string;
  name: string;
  shortName: string;
  // URL for background image, or null for none (transparent)
  background: string | null;
  color: string | null;
  startingLines: number;
  targetLines: number;
  raiseRate: number; // rows per second
  // optional music URL to play for this level
  music?: string | null;
};
