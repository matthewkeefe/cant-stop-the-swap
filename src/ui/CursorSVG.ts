// Returns the SVG markup string used by the DOM cursor overlay.
// Kept as a tiny module so markup is easy to inspect and reuse.
export function cursorSvg(childId: string, w: number, h: number, radius: number) {
  const strokeWidth = 3;
  const dashLen = Math.max(8, Math.round(w * 0.2));
  const dashGap = Math.max(6, Math.round(w * 0.12));

  return `
    <svg id="${childId}" xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute; left:0; top:0; pointer-events:none; overflow:visible;">
      <defs>
        <linearGradient id="cursor-grad" gradientUnits="objectBoundingBox">
          <stop offset="0%" stop-color="#ff3b3b" />
          <stop offset="16%" stop-color="#ffb13b" />
          <stop offset="33%" stop-color="#fff23b" />
          <stop offset="50%" stop-color="#3bff70" />
          <stop offset="66%" stop-color="#3bdcff" />
          <stop offset="83%" stop-color="#8a3bff" />
          <stop offset="100%" stop-color="#ff3b3b" />
          <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="6s" repeatCount="indefinite" />
        </linearGradient>
        <filter id="cursor-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" rx="${radius}" ry="${radius}" width="${w - strokeWidth}" height="${h - strokeWidth}" fill="none"
        stroke="url(#cursor-grad)" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dashLen} ${dashGap}" filter="url(#cursor-glow)" />
    </svg>
  `;
}
