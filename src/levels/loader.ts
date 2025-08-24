import type { Level } from './types';
import raw from './levels.json';

type RawLevel = Omit<Level, 'background' | 'music'> & {
  background: string | null;
  music?: string | null;
};

const rawLevels = raw as RawLevel[];

// Build-time asset map using Vite's globEager with ?url so values are URL strings.
const assetMap: Record<string, string> = {};
// Use Vite's import.meta.glob with eager/as:'url' so all assets are bundled and we get URL strings.
// Provide a narrow type for glob to avoid using `any` which the linter flags.
type ViteGlobFn = (
  pattern: string,
  opts?: { eager?: boolean; as?: 'url' | 'raw' | 'default' | 'document' | 'webassembly' },
) => Record<string, string>;
const metaWithGlob = import.meta as unknown as { glob?: ViteGlobFn };
const globFiles = metaWithGlob.glob?.('../assets/**/*', { eager: true, as: 'url' }) ?? {};
for (const key in globFiles) {
  const url = globFiles[key] as string | undefined;
  if (!url) continue;
  // Normalize key to forward slashes so Windows backslashes won't break lookups
  const keyPosix = key.replace(/\\/g, '/');
  // Ensure key has a leading ../ to match JSON paths like '../assets/...'
  const normalizedKey = keyPosix.replace(/^\.\/?/, '../');
  assetMap[normalizedKey] = url;
  // Also store without the leading '../' so lookups of 'assets/...' succeed
  assetMap[normalizedKey.replace(/^\.\./, '')] = url;
  // Also index by basename (e.g. 'desert.png') so JSON paths that include only filename match
  const parts = normalizedKey.split('/');
  const basename = parts[parts.length - 1];
  if (basename) assetMap[basename] = url;
}

function resolveAsset(path: string | null) {
  if (!path) return null;
  // Prefer public-style relative paths (e.g. 'assets/background/foo.png') so
  // GH Pages will resolve them relative to the repo root (e.g. '/<repo>/assets/...').
  try {
    const cleaned = path.replace(/^\.\/?/, ''); // remove './' or '../' prefix
    if (cleaned.startsWith('assets/')) {
      // If the bundler produced a mapped URL for the asset, prefer that.
      const mapped =
        assetMap[cleaned] ||
        assetMap[`../${cleaned}`] ||
        assetMap[cleaned.replace(/^assets\//, '')];
      if (mapped) return mapped;
      // Otherwise return the relative public path which will point to the public copy
      // deployed at '/<repo>/assets/...'. Do not add a leading slash so it remains
      // relative to the current repo path on GitHub Pages.
      return cleaned;
    }
  } catch {
    // ignore and fall back to the generic resolver below
  }

  // Normalize other path variants to match keys in assetMap
  const variants = new Set<string>();
  const add = (p: string) => variants.add(p);
  add(path);
  add(path.replace(/^\.\//, ''));
  add(path.replace(/^\.\.\//, ''));
  add(path.replace(/^\//, ''));
  add(`../${path}`);
  add(`./${path}`);
  // Also try without any leading ../ so keys like 'assets/...' match
  add(path.replace(/^\.\.\//, ''));

  for (const v of variants) {
    if (!v) continue;
    const m = assetMap[v];
    if (m) return m;
  }

  // Fallback: try suffix match in case keys are absolute-ish or hashed
  for (const key in assetMap) {
    if (key.endsWith(path) || path.endsWith(key) || key.endsWith(path.replace(/^\.\/?/, ''))) {
      return assetMap[key];
    }
  }

  // Try a bundler-friendly URL() fallback which Vite rewrites at build time.
  try {
    // new URL will either produce a usable URL in node (file://...) or be rewritten by Vite
    const candidate = new URL(path, import.meta.url).href;
    return candidate;
  } catch {
    // ignore
  }

  // Dev-time warning to make missing mappings visible
  try {
    const isDev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;
    if (isDev) console.warn(`levels loader: could not resolve asset path '${path}'`);
  } catch {
    // ignore
  }

  return path;
}

export function loadLevels(): Level[] {
  return rawLevels.map((l) => ({
    id: l.id,
    name: l.name,
    shortName: l.shortName,
    background: l.background ? resolveAsset(l.background) : null,
    color: l.color ?? null,
    startingLines: l.startingLines,
    targetLines: l.targetLines,
    raiseRate: l.raiseRate,
    music: l.music ? resolveAsset(l.music) : null,
  }));
}

export default loadLevels();
