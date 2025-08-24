import type { Atlas } from '../atlas';
import type { Skin, SrcRect } from '../renderer/canvasRenderer';

export function buildBgSkin(atlas: Atlas | null): Skin | undefined {
  if (!atlas) return undefined;
  const anyFrame = Object.values(atlas.frames)[0];
  const frameW = anyFrame?.w ?? 128;
  const frameH = anyFrame?.h ?? 128;
  const BACK_COL = 0;
  const BACK_ROW = 1;
  const src: SrcRect = {
    sx: BACK_COL * frameW,
    sy: BACK_ROW * frameH,
    sw: frameW,
    sh: frameH,
  };
  return {
    image: atlas.image,
    pickSrcForCell: () => src,
  };
}

export function buildFgSkin(atlas: Atlas | null): Skin | undefined {
  if (!atlas) return undefined;
  const keys = Object.keys(atlas.frames).sort();
  const candidates = keys.filter((k) => /_color/i.test(k));
  const order = (candidates.length >= 5 ? candidates : keys).slice(0, 5);

  const clearMap: Record<string, string | undefined> = {};
  for (const baseName of order) {
    const lowerBase = baseName.toLowerCase();
    const exactCandidates = [`${baseName}_clear`, `${baseName}-clear`, `${baseName}_matched`];
    let found: string | undefined = undefined;
    for (const c of exactCandidates) {
      if (atlas.frames[c]) {
        found = c;
        break;
      }
    }
    if (!found) {
      found = Object.keys(atlas.frames).find((k) => {
        const kl = k.toLowerCase();
        return kl.includes(lowerBase) && /_clear|-clear|clear|matched/i.test(kl);
      });
    }
    clearMap[baseName] = found;
  }

  const pickByColor = (i: number, variant: 'normal' | 'clear' = 'normal'): SrcRect => {
    const baseName = order[Math.max(0, Math.min(order.length - 1, i | 0))];
    if (variant === 'clear') {
      const clearName = clearMap[baseName];
      if (clearName && atlas.frames[clearName]) {
        const f = atlas.frames[clearName];
        return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
      }
    }
    const f = atlas.frames[baseName];
    return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
  };

  return {
    image: atlas.image,
    pickSrcForCell: () => {
      const f = atlas.frames[order[0]];
      return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
    },
    pickSrcForColor: pickByColor,
  };
}
