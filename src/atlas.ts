// Atlas helpers moved out of App.tsx
export type AtlasFrame = {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Atlas = {
  image: HTMLImageElement;
  frames: Record<string, AtlasFrame>;
};

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

export async function tryFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export function parseGemsXml(xmlText: string): Record<string, AtlasFrame> {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const result: Record<string, AtlasFrame> = {};
  doc.querySelectorAll('SubTexture').forEach((el) => {
    const name = el.getAttribute('name') || '';
    const x = parseInt(el.getAttribute('x') || '0', 10);
    const y = parseInt(el.getAttribute('y') || '0', 10);
    const w = parseInt(el.getAttribute('width') || '0', 10);
    const h = parseInt(el.getAttribute('height') || '0', 10);
    result[name] = { name, x, y, w, h };
  });
  return result;
}

/** If no XML: slice the sheet into a grid (tweakable). */
export function makeGridFrames(
  img: HTMLImageElement,
  frameW: number,
  frameH: number,
): Record<string, AtlasFrame> {
  const cols = Math.max(1, Math.floor(img.naturalWidth / frameW));
  const rows = Math.max(1, Math.floor(img.naturalHeight / frameH));
  const frames: Record<string, AtlasFrame> = {};
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      frames[`auto_${idx.toString().padStart(3, '0')}`] = {
        name: `auto_${idx}`,
        x: c * frameW,
        y: r * frameH,
        w: frameW,
        h: frameH,
      };
      idx++;
    }
  }
  return frames;
}

export async function loadGemsAtlas(
  pngUrl: string,
  xmlUrl: string,
  gridFallback?: { w: number; h: number },
): Promise<Atlas> {
  const image = await loadImage(pngUrl);
  const xmlText = await tryFetchText(xmlUrl);
  const frames = xmlText
    ? parseGemsXml(xmlText)
    : makeGridFrames(image, gridFallback?.w ?? 128, gridFallback?.h ?? 128);
  return { image, frames };
}
