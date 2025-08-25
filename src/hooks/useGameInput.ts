import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { Engine } from '../game-core/engine';

type UseGameInputOpts = {
  scene: 'title' | 'play';
  engineRef: MutableRefObject<Engine | null>;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  isMobile: boolean;
  CELL: number;
  WIDTH: number;
  HEIGHT: number;
  lastCursorRef: MutableRefObject<{ x: number; y: number }>;
  startGame: (levelId?: string) => void;
  togglePause: () => void;
  // callback invoked when user requests advancing after a win
  onWinAdvance?: () => void;
  selectedLevelIdRef: MutableRefObject<string>;
  pausedRef: MutableRefObject<boolean>;
  // X key hold refs (managed in App) so hook doesn't attach engine internals
  xHoldRef: MutableRefObject<boolean>;
  xPrevRateRef: MutableRefObject<number | null>;
  // Base raise rate for current level so hook can restore it reliably
  baseRaiseRateRef?: MutableRefObject<number | null>;
};

export default function useGameInput(opts: UseGameInputOpts) {
  const {
    scene,
    engineRef,
    // canvasRef,
    // isMobile,
    // CELL,
    // WIDTH,
    // HEIGHT,
    // lastCursorRef,
    // touchStateRef,
    startGame,
    togglePause,
    onWinAdvance,
    selectedLevelIdRef,
    pausedRef,
    xHoldRef,
    xPrevRateRef,
    baseRaiseRateRef,
  } = opts;

  useEffect(() => {
    // Keyboard-only input wiring
    // Keyboard handlers
    const onKeyDown = (e: KeyboardEvent) => {
      try {
        if (scene === 'title') {
          if (e.key === 'Enter') {
            startGame();
          }
          return;
        }
        if (!engineRef.current) return;

        const gs = engineRef.current.getState();
        if (gs.hasWon) {
          if (e.key === 'z' || e.key === 'Z' || e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            try {
              onWinAdvance?.();
            } catch {
              void 0;
            }
            return;
          }
          return;
        }

        switch (e.key) {
          case 'ArrowLeft':
            engineRef.current.moveCursor(-1, 0);
            break;
          case 'ArrowRight':
            engineRef.current.moveCursor(1, 0);
            break;
          case 'ArrowUp':
            engineRef.current.moveCursor(0, -1);
            break;
          case 'ArrowDown':
            engineRef.current.moveCursor(0, 1);
            break;
          case 'z':
          case 'Z':
          case ' ':
          case 'Space':
            e.preventDefault();
            if (!pausedRef.current) engineRef.current.swap();
            break;
          case 'x':
          case 'X':
            if (!engineRef.current) break;
            // ignore repeated keydown events (auto-repeat) while the key is already held
            if (xHoldRef.current) break;
            try {
              xHoldRef.current = true;
              // store previous rate so we can restore later
              xPrevRateRef.current = engineRef.current.autoRiseRateRowsPerSec ?? null;
              // increase raise rate while held
              engineRef.current.autoRiseRateRowsPerSec = 2;
              engineRef.current.scrollSpeedPxPerSec = 2 * engineRef.current.cellSize;
            } catch {
              void 0;
            }
            break;
          case 'r':
          case 'R':
            startGame();
            break;
          case 'p':
          case 'P':
            togglePause();
            break;
          default:
            break;
        }
      } catch {
        void 0;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      try {
        if (e.key === 'x' || e.key === 'X') {
          if (!engineRef.current) return;
          try {
            xHoldRef.current = false;
            const prev = xPrevRateRef.current;
            if (typeof prev === 'number' && prev > 0) {
              engineRef.current.autoRiseRateRowsPerSec = prev;
              engineRef.current.scrollSpeedPxPerSec = prev * engineRef.current.cellSize;
            } else if (baseRaiseRateRef && typeof baseRaiseRateRef.current === 'number') {
              const base = baseRaiseRateRef.current!;
              engineRef.current.autoRiseRateRowsPerSec = base;
              engineRef.current.scrollSpeedPxPerSec = base * engineRef.current.cellSize;
            } else {
              const fallback = engineRef.current.autoRiseRateRowsPerSec ?? 0.1;
              engineRef.current.autoRiseRateRowsPerSec = fallback;
              engineRef.current.scrollSpeedPxPerSec = fallback * engineRef.current.cellSize;
            }
            xPrevRateRef.current = null;
          } catch {
            void 0;
          }
        }
      } catch {
        void 0;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    scene,
    engineRef,
    startGame,
    togglePause,
    onWinAdvance,
    selectedLevelIdRef,
    pausedRef,
    xHoldRef,
    xPrevRateRef,
    baseRaiseRateRef,
  ]);
}
