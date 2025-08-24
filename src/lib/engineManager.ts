import { Engine } from '../game-core/engine';

export type EngineManager = ReturnType<typeof createEngineManager>;

export function createEngineManager() {
  let engine: Engine | null = null;

  function start(width: number, height: number, numColors = 5) {
    if (engine) stop();
    engine = new Engine(width, height, numColors);
    return engine;
  }

  function stop() {
    // Clear handlers and drop reference
    try {
      if (engine) {
        engine.onMatch = undefined;
        engine.onSwap = undefined;
        engine.onWin = undefined;
      }
    } catch {
      void 0;
    }
    engine = null;
  }

  function get() {
    return engine;
  }

  function setHandlers(handlers: {
    onMatch?: (count: number) => void;
    onSwap?: () => void;
    onWin?: () => void;
  }) {
    if (!engine) return;
    engine.onMatch = handlers.onMatch;
    engine.onSwap = handlers.onSwap;
    engine.onWin = handlers.onWin;
  }

  return { start, stop, get, setHandlers } as const;
}
