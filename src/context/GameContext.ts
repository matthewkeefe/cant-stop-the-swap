import { createContext } from "react";

type GameContextValue = {
  paused: boolean;
  togglePause: () => void;
};

export const GameContext = createContext<GameContextValue | undefined>(undefined);
export type { GameContextValue };
