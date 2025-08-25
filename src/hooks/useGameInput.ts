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
    // helper to access transient debug object without using 'any' inline
    type DebugObj = NonNullable<Window['__CSTS_DEBUG']>;
    const getCstsDebug = (): DebugObj => {
      const w = window as unknown as Window & { __CSTS_DEBUG?: Window['__CSTS_DEBUG'] };
      if (!w.__CSTS_DEBUG) w.__CSTS_DEBUG = {} as Window['__CSTS_DEBUG'];
      return w.__CSTS_DEBUG as DebugObj;
    };
    // debounce to avoid double-swap when both pointerup and click fire on some devices
    let lastSwapAt = 0;
    const SWAP_DEBOUNCE_MS = 300;
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
    const TAP_MAX_MS = 500; // be forgiving on mobile
    const MOVE_THRESHOLD_PX = 8;

    const onPointerDown = (ev: PointerEvent) => {
      if (!isMobile) return;
      if (!engineRef.current) return;
      const rect = canvasEl!.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const py = ev.clientY - rect.top;
      const cssCell = rect.width / WIDTH;
      const centerX = Math.floor(px / cssCell);
      const centerY = Math.floor(py / cssCell);
      const cellX = Math.max(0, Math.min(WIDTH - 2, centerX));
      const cellY = Math.max(0, Math.min(HEIGHT - 1, centerY));
      engineRef.current.setCursorAbsolute(cellX, cellY);
      lastCursorRef.current = { x: cellX, y: cellY };
      touchStateRef.current = {
        active: true,
        startTime: performance.now(),
        startX: ev.clientX,
        startY: ev.clientY,
        moved: false,
      };
      // write lightweight debug info for optional overlay
      try {
        const dbg = getCstsDebug();
        (dbg as DebugObj)['lastPointer'] = { type: 'down', cellX, cellY, time: Date.now() };
      } catch {
        void 0;
      }
      try {
        (ev.target as Element).setPointerCapture(ev.pointerId);
      } catch {
        void 0;
      }
      try {
        ev.preventDefault();
      } catch {
        /* ignore */
      }
      console.debug('[input] pointerdown', { cellX, cellY });
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
      const cssCell = rect.width / WIDTH;
      const centerX = Math.floor(px / cssCell);
      const centerY = Math.floor(py / cssCell);
      const cellX = Math.max(0, Math.min(WIDTH - 2, centerX));
      const cellY = Math.max(0, Math.min(HEIGHT - 1, centerY));
      engineRef.current.setCursorAbsolute(cellX, cellY);
      lastCursorRef.current = { x: cellX, y: cellY };
      try {
        const dbg = getCstsDebug();
        (dbg as DebugObj)['lastPointer'] = { type: 'move', cellX, cellY, time: Date.now() };
      } catch {
        void 0;
      }
      try {
        ev.preventDefault();
      } catch {
        /* ignore */
      }
      console.debug('[input] pointermove', { cellX, cellY, moved: touchStateRef.current.moved });
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (!isMobile) return;
      if (!touchStateRef.current?.active) return;
      const duration = performance.now() - touchStateRef.current.startTime;
      // recompute movement at pointerup (more reliable than stored flag in some browsers)
      const dx = ev.clientX - touchStateRef.current.startX;
      const dy = ev.clientY - touchStateRef.current.startY;
      const moved = Math.hypot(dx, dy) > MOVE_THRESHOLD_PX;
      touchStateRef.current.active = false;
      try {
        (ev.target as Element).releasePointerCapture(ev.pointerId);
      } catch {
        void 0;
      }
      console.debug('[input] pointerup', {
        duration,
        moved,
        cursor: engineRef.current?.cursorX + '/' + engineRef.current?.cursorY,
        phase: engineRef.current?.phase,
      });
      try {
        const dbg = getCstsDebug();
        (dbg as DebugObj)['lastPointer'] = {
          type: 'up',
          duration,
          moved,
          cellX: engineRef.current?.cursorX,
          cellY: engineRef.current?.cursorY,
          time: Date.now(),
          phase: engineRef.current?.phase,
        };
      } catch {
        void 0;
      }
      // Allow a slightly more forgiving tap detection on mobile: if the finger
      // moved a small amount or the release was slightly slower, still treat as tap.
      const RELAX_FACTOR = 1.5;
      if (
        (!moved && duration <= TAP_MAX_MS) ||
        (Math.hypot(dx, dy) <= MOVE_THRESHOLD_PX * RELAX_FACTOR &&
          duration <= TAP_MAX_MS * RELAX_FACTOR)
      ) {
        try {
          const now = Date.now();
          if (now - lastSwapAt > SWAP_DEBOUNCE_MS) {
            console.debug('[input] performing swapAt (tap)', lastCursorRef.current);
            engineRef.current?.swapAt(lastCursorRef.current.x, lastCursorRef.current.y);
            lastSwapAt = now;
          } else {
            console.debug('[input] skipped duplicate swap (debounced)');
          }
        } catch (e) {
          console.debug('[input] swap error', e);
        }
      }
      try {
        ev.preventDefault();
      } catch {
        /* ignore */
      }
    };

    const onClick = (ev?: MouseEvent) => {
      if (!isMobile) return;
      if (scene !== 'play') return;
      try {
        const now = Date.now();
        if (now - lastSwapAt <= SWAP_DEBOUNCE_MS) {
          console.debug('[input] click fallback - skipped duplicate swap (debounced)');
          return;
        }
        // Prefer using the event coordinates to compute the exact tapped cell.
        let cx = lastCursorRef.current.x;
        let cy = lastCursorRef.current.y;
        try {
          if (ev && canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            const px = ev.clientX - rect.left;
            const py = ev.clientY - rect.top;
            const cssCell = rect.width / WIDTH;
            const centerX = Math.floor(px / cssCell);
            const centerY = Math.floor(py / cssCell);
            cx = Math.max(0, Math.min(WIDTH - 2, centerX));
            cy = Math.max(0, Math.min(HEIGHT - 1, centerY));
          }
        } catch {
          /* ignore coordinate errors */
        }
        console.debug('[input] click fallback - swapAt', { cx, cy });
        engineRef.current?.swapAt(cx, cy);
        lastSwapAt = now;
      } catch (e) {
        console.debug('[input] click swap error', e);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', onPointerDown);
      canvasEl.addEventListener('pointermove', onPointerMove);
      canvasEl.addEventListener('pointerup', onPointerUp);
      canvasEl.addEventListener('pointercancel', onPointerUp);
      canvasEl.addEventListener('click', onClick as EventListener);
    }

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (canvasEl) {
        canvasEl.removeEventListener('pointerdown', onPointerDown);
        canvasEl.removeEventListener('pointermove', onPointerMove);
        canvasEl.removeEventListener('pointerup', onPointerUp);
        canvasEl.removeEventListener('pointercancel', onPointerUp);
        canvasEl.removeEventListener('click', onClick as EventListener);
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
