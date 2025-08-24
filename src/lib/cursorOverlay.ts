// Utilities to manage the DOM SVG cursor overlay used above the canvas.
// Keep this file small and defensive (null/SSR-safe).

import { cursorSvg } from '../ui/CursorSVG';

export function updateCursorOverlay(
  overlay: HTMLDivElement | null,
  childId: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  radius: number,
) {
  if (!overlay) return;
  // Try to find existing child
  let child = overlay.querySelector<HTMLElement>(`#${childId}`);
  if (!child) {
    // Same SVG markup as before, kept compact. Defensive about missing DOM APIs.
    try {
      const svg = cursorSvg(childId, w, h, radius);
      overlay.insertAdjacentHTML('beforeend', svg);
      child = overlay.querySelector<HTMLElement>(`#${childId}`) ?? null;
    } catch {
      // ignore DOM errors
      return;
    }
  }

  try {
    if (!child) return;
    child.style.width = `${w}px`;
    child.style.height = `${h}px`;
    child.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
  } catch {
    // ignore styling errors
    return;
  }
}

export function removeCursorOverlay(overlay: HTMLDivElement | null, childId: string) {
  try {
    if (!overlay) return;
    const child = overlay.querySelector(`#${childId}`);
    if (child) child.remove();
  } catch {
    void 0;
  }
}
