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
  touchStateRef: MutableRefObject<{
    active: boolean;
    startTime: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>;
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
    canvasRef,
    isMobile,
    CELL,
    WIDTH,
    HEIGHT,
    lastCursorRef,
    touchStateRef,
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

    // Pointer / touch handlers for mobile
  const canvasEl = canvasRef.current;
    const TAP_MAX_MS = 300;
    const MOVE_THRESHOLD_PX = 8;

    const onPointerDown = (ev: PointerEvent) => {
      if (!isMobile) return;
      if (!engineRef.current) return;
      const rect = canvasEl!.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const cellX = Math.max(0, Math.min(WIDTH - 2, Math.floor(px / CELL)));
      const cellY = Math.max(0, Math.min(HEIGHT - 1, Math.floor(py / CELL)));
  engineRef.current.setCursorAbsolute(cellX, cellY);
  lastCursorRef.current = { x: cellX, y: cellY };
      touchStateRef.current = {
        active: true,
        startTime: performance.now(),
        startX: ev.clientX,
        startY: ev.clientY,
        moved: false,
      };
      try {
        (ev.target as Element).setPointerCapture(ev.pointerId);
      } catch {
        void 0;
      }
      ev.preventDefault();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!isMobile) return;
      if (!touchStateRef.current?.active) return;
      const dx = ev.clientX - touchStateRef.current.startX;
      const dy = ev.clientY - touchStateRef.current.startY;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) touchStateRef.current.moved = true;
      if (!engineRef.current) return;
      const rect = canvasEl!.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const cellX = Math.max(0, Math.min(WIDTH - 2, Math.floor(px / CELL)));
      const cellY = Math.max(0, Math.min(HEIGHT - 1, Math.floor(py / CELL)));
  engineRef.current.setCursorAbsolute(cellX, cellY);
  lastCursorRef.current = { x: cellX, y: cellY };
      ev.preventDefault();
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!isMobile) return;
      if (!touchStateRef.current?.active) return;
      const duration = performance.now() - touchStateRef.current.startTime;
      const moved = touchStateRef.current.moved;
      touchStateRef.current.active = false;
      try {
        (ev.target as Element).releasePointerCapture(ev.pointerId);
      } catch {
        void 0;
      }
      if (!moved && duration <= TAP_MAX_MS) {
        try {
          engineRef.current?.swap();
        } catch {
          void 0;
        }
      }
      ev.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', onPointerDown);
      canvasEl.addEventListener('pointermove', onPointerMove);
      canvasEl.addEventListener('pointerup', onPointerUp);
      canvasEl.addEventListener('pointercancel', onPointerUp);
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (canvasEl) {
        canvasEl.removeEventListener('pointerdown', onPointerDown);
        canvasEl.removeEventListener('pointermove', onPointerMove);
        canvasEl.removeEventListener('pointerup', onPointerUp);
        canvasEl.removeEventListener('pointercancel', onPointerUp);
      }
    };
    }, [
      scene,
      engineRef,
      canvasRef,
      isMobile,
      CELL,
      WIDTH,
      HEIGHT,
      lastCursorRef,
      touchStateRef,
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
