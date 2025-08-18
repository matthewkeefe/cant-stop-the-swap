// Build a simple per-column top boundary (heightmap) from a mask image.
// The mask image is treated as an alpha mask: the first opaque pixel from
// the top defines the mask boundary for that column. Columns with no opaque
// pixel get a value of -1 (no boundary).

export type Mask = {
  width: number;
  height: number;
  colTop: Int32Array; // per-column y coordinate of first opaque pixel or -1
};

export async function buildMaskFromImage(url: string): Promise<Mask> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const cvs = document.createElement("canvas");
  cvs.width = img.naturalWidth;
  cvs.height = img.naturalHeight;
  const ctx = cvs.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, cvs.width, cvs.height).data;
  const colTop = new Int32Array(cvs.width);
  for (let x = 0; x < cvs.width; x++) {
    let found = -1;
    for (let y = 0; y < cvs.height; y++) {
      const idx = (y * cvs.width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha > 16) {
        found = y;
        break;
      }
    }
    colTop[x] = found;
  }
  return { width: cvs.width, height: cvs.height, colTop };
}

// Check contact between a cell (screen-space top Y) and the mask.
// cellLeftX and cellRightX are pixel coordinates in the mask image space.
// samples: array of sample X positions (pixels) within the cell; masked if any
// sample top is <= mask top bound (i.e., cell top crosses into mask)
export function cellTouchesMask(
  mask: Mask,
  cellTopY: number,
  sampleXs: number[]
): boolean {
  if (!mask) return false;
  for (const sx of sampleXs) {
    const ix = Math.floor(sx);
    if (ix < 0 || ix >= mask.width) continue;
    const top = mask.colTop[ix];
    if (top >= 0 && cellTopY <= top) return true;
  }
  return false;
}
