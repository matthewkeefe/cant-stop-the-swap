import { useEffect, useRef } from 'react';
import { useDrag } from '@use-gesture/react';

// Gesture tuning constants
const TAP_MAX_MS = 220;
const TAP_MAX_MOVE_PX = 8;
const SWIPE_MIN_DX = 24;
const SWIPE_MAX_ABS_DY = 18;
const SWIPE_MIN_VX = 0.35; // px / ms

type Cell = { col: number; row: number };

export type GestureApi = {
  screenToCell: (pt: { x: number; y: number }) => Cell | null;
  moveCursorToCell: (col: number, row: number) => void;
  swapWithNeighbor: (col: number, row: number, dir: 'left' | 'right') => void;
  drawFrame: () => void;
};

function isPredominantlyHorizontal(dx: number, dy: number) {
  return Math.abs(dx) >= Math.abs(dy) && Math.abs(dy) <= SWIPE_MAX_ABS_DY;
}

function extractClientXY(e: MouseEvent | TouchEvent | PointerEvent | undefined) {
  if (!e) return { clientX: 0, clientY: 0 };
  if ('changedTouches' in e && e.changedTouches && e.changedTouches[0]) {
    const t = e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY };
  }
  return { clientX: (e as MouseEvent | PointerEvent).clientX, clientY: (e as MouseEvent | PointerEvent).clientY };
}

export default function useCanvasGestures(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  api: GestureApi,
) {
  const startPt = useRef<{ x: number; y: number; t: number } | null>(null);
  const startCell = useRef<Cell | null>(null);
  const lastHoverCell = useRef<Cell | null>(null);
  const activePointers = useRef(0);
  const holdMode = useRef(false);
  const currentSwapCol = useRef<number | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    try {
      c.style.touchAction = 'none';
    } catch {
      /* ignore */
    }

    const onContext = (ev: Event) => ev.preventDefault();
    const onPointerDown = () => {
      activePointers.current += 1;
      if (activePointers.current > 1) {
        // cancel any in-progress gesture
        startPt.current = null;
        startCell.current = null;
        lastHoverCell.current = null;
      }
    };
    const onPointerUp = () => {
      activePointers.current = Math.max(0, activePointers.current - 1);
    };

    c.addEventListener('contextmenu', onContext);
    c.addEventListener('pointerdown', onPointerDown);
    c.addEventListener('pointerup', onPointerUp);
    c.addEventListener('pointercancel', onPointerUp);

    return () => {
      c.removeEventListener('contextmenu', onContext);
      c.removeEventListener('pointerdown', onPointerDown);
      c.removeEventListener('pointerup', onPointerUp);
      c.removeEventListener('pointercancel', onPointerUp);
    };
  }, [canvasRef]);

  useDrag(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (state: any) => {
      const { event, first, last } = state;
      if (activePointers.current > 1) return; // ignore multi-touch gestures

      const now = performance.now();
      const { clientX, clientY } = extractClientXY(event);
      const pt = { x: clientX, y: clientY };
      const curCell = api.screenToCell(pt);

      if (first) {
        // start tracking
        startPt.current = { x: clientX, y: clientY, t: now };
        startCell.current = curCell;
        lastHoverCell.current = null;
        // enter hold-mode immediately on press; select the tile for moving
        holdMode.current = true;
        currentSwapCol.current = startCell.current ? startCell.current.col : null;
        if (startCell.current) {
          api.moveCursorToCell(startCell.current.col, startCell.current.row);
          api.drawFrame();
        }
        return;
      }

      if (!first && !last) {
  // movement during drag
  // if not in hold-mode (shouldn't happen since press activates it), fall back to hover

  // If we're in hold-mode, perform continuous horizontal swaps as pointer crosses columns
        if (holdMode.current && startCell.current && curCell) {
          const row = startCell.current.row;
          if (curCell.row === row && typeof currentSwapCol.current === 'number') {
            const targetCol = curCell.col;
            // perform stepwise swaps from currentSwapCol to targetCol
            while (currentSwapCol.current !== null && currentSwapCol.current < targetCol) {
              // swap right
              api.swapWithNeighbor(currentSwapCol.current, row, 'right');
              currentSwapCol.current += 1;
              api.drawFrame();
            }
            while (currentSwapCol.current !== null && currentSwapCol.current > targetCol) {
              // swap left
              api.swapWithNeighbor(currentSwapCol.current, row, 'left');
              currentSwapCol.current -= 1;
              api.drawFrame();
            }
            // highlight the tile at the currentSwapCol
            if (currentSwapCol.current !== null) {
              api.moveCursorToCell(currentSwapCol.current, row);
            }
            return;
          }
        }

        // default hover behavior when not in hold-mode
        if (curCell) {
          const prev = lastHoverCell.current;
          if (!prev || prev.col !== curCell.col || prev.row !== curCell.row) {
            lastHoverCell.current = curCell;
            api.moveCursorToCell(curCell.col, curCell.row);
            api.drawFrame();
          }
        }
        return;
      }

      if (last) {
  // clear hold-mode state on release
        const s = startPt.current;
        if (!s || !startCell.current) {
          startPt.current = null;
          startCell.current = null;
          lastHoverCell.current = null;
          holdMode.current = false;
          currentSwapCol.current = null;
          return;
        }

        // If we were in hold-mode, ensure cursor is on the final swapped column
        if (holdMode.current && typeof currentSwapCol.current === 'number') {
          api.moveCursorToCell(currentSwapCol.current, startCell.current.row);
          api.drawFrame();
        } else {
          const dx = clientX - s.x;
          const dy = clientY - s.y;
          const dt = Math.max(1, now - s.t);
          const vx = Math.abs(dx) / dt;

          if (isPredominantlyHorizontal(dx, dy) && (Math.abs(dx) >= SWIPE_MIN_DX || vx >= SWIPE_MIN_VX)) {
            const dir = dx > 0 ? 'right' : 'left';
            api.swapWithNeighbor(startCell.current.col, startCell.current.row, dir);
            api.drawFrame();
          } else {
            if (Math.abs(dx) <= TAP_MAX_MOVE_PX && Math.abs(dy) <= TAP_MAX_MOVE_PX && dt <= TAP_MAX_MS) {
              if (curCell) {
                api.moveCursorToCell(curCell.col, curCell.row);
                api.drawFrame();
              }
            }
          }
        }

        startPt.current = null;
        startCell.current = null;
        lastHoverCell.current = null;
        holdMode.current = false;
        currentSwapCol.current = null;
      }
    },
    {
      target: canvasRef,
      filterTaps: true,
    },
  );
}
