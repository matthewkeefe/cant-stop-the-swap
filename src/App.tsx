import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import WinLine from "./ui/WinLine";
import { useNavigate } from "react-router-dom";
import { Engine } from "./game-core/engine";

import {
  drawStateToCanvas,
  type Skin,
  type SrcRect,
} from "./renderer/canvasRenderer";

import tilesGemsPng from "./assets/sprites/gems.png";
import tilesGemsXmlUrl from "./assets/sprites/gems.xml?url";
import { type Atlas, loadGemsAtlas } from "./atlas"; // atlas helpers moved to src/atlas.ts
import LEVELS from "./levels";
import snd0 from "./assets/sounds/impactMining_000.ogg?url";
import snd1 from "./assets/sounds/impactMining_001.ogg?url";
import snd2 from "./assets/sounds/impactMining_002.ogg?url";
import snd3 from "./assets/sounds/impactMining_003.ogg?url";
import snd4 from "./assets/sounds/impactMining_004.ogg?url";
import swapSnd from "./assets/sounds/swap.ogg?url";

// Default target lines used when a level doesn't provide one.
const DEFAULT_TARGET_LINES = 10;

// Preset keys removed — use a single explicit raise rate in inputs

// ----------------------------------------------------------------------------

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const lastCursorRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Touch state for mobile pointer interactions
  const touchStateRef = useRef<{
    active: boolean;
    startTime: number;
    startX: number;
    startY: number;
    moved: boolean;
  }>({ active: false, startTime: 0, startX: 0, startY: 0, moved: false });

  // Skins
  const backtilesAtlasRef = useRef<Atlas | null>(null);
  const tilesBlackAtlasRef = useRef<Atlas | null>(null);
  const [atlasesReady, setAtlasesReady] = useState(false);
  // DOM overlay for the cursor so it can appear above DOM WinLine
  const cursorOverlayRef = useRef<HTMLDivElement | null>(null);

  const CELL = 64;
  const WIDTH = 6;
  const HEIGHT = 12;

  const [scene, setScene] = useState<"title" | "play">("play");
  // Detect mobile viewport and adjust UI: on mobile we show a minimal UI.
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try {
      return (
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(max-width:640px)").matches
      );
    } catch {
      return false;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [inputs, setInputs] = useState({
    targetLines: 5,
    startingLines: 5,
    // single raise rate setting (rows per second)
    rate: 0.1,
  });

  const [selectedLevelId, setSelectedLevelId] = useState<string>(
    LEVELS[0]?.id ?? "level-1"
  );
  // If the user selected a level via the LevelSelectPage, prefer that
  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("selectedLevelId") : null;
      if (stored) setSelectedLevelId(stored);
    } catch {
      // ignore storage errors
    }
  }, []);
  // Keep a ref of selectedLevelId so long-lived event handlers can read the
  // latest value without re-registering listeners.
  const selectedLevelIdRef = useRef<string>(selectedLevelId);
  // Preload audio elements for match/chain sounds
  const soundsRef = useRef<HTMLAudioElement[] | null>(null);
  // Preload swap sound
  const swapRef = useRef<HTMLAudioElement | null>(null);
  // Track currently playing cloned sounds so we can stop them on pause
  const playingClonesRef = useRef<HTMLAudioElement[]>([]);
  // Pause state (pause stops automatic rising and mutes future sounds)
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  // Whether the current pause was caused by losing window/tab focus (visibility/blur)
  const pausedByFocusRef = useRef(false);
  // Remember previous scroll speed so we can restore after unpausing
  const prevScrollSpeedRef = useRef<number | null>(null);
  if (!soundsRef.current) {
    soundsRef.current = [snd0, snd1, snd2, snd3, snd4].map((u) => {
      const a = new Audio(u);
      a.preload = "auto";
      return a;
    });
  }
  if (!swapRef.current) {
    swapRef.current = new Audio(swapSnd);
    swapRef.current.preload = "auto";
  }
  // Music element for the currently playing level
  const musicRef = useRef<HTMLAudioElement | null>(null);
  // Guard to prevent double-advancing to next level
  const advancingRef = useRef(false);
  const [hud, setHud] = useState({
    score: 0,
    matches: 0,
    chains: 0,
    linesEq: 0,
    tilesAbove: 0,
    hasWon: false,
    hasLost: false,
    risePauseMs: 0,
    risePauseMaxMs: 0,
  });
  const [winLine, setWinLine] = useState({ percent: 0, yPx: -9999 });
  const [titleHover, setTitleHover] = useState(false);
  const [optionsHover, setOptionsHover] = useState(false);
  const [levelsHover, setLevelsHover] = useState(false);
  // Volume settings (persisted to localStorage)
  const [musicVolume, setMusicVolume] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("musicVolume") : null;
    return v !== null ? Math.max(0, Math.min(1, Number(v))) : 0.25;
  });
  const [sfxVolume, setSfxVolume] = useState<number>(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem("sfxVolume") : null;
    return v !== null ? Math.max(0, Math.min(1, Number(v))) : 1.0;
  });

  // Update local volume state if other windows/tabs (or OptionsPage) change localStorage
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (!e.key) return;
      if (e.key === "musicVolume") {
        const v = e.newValue;
        if (v != null) setMusicVolume(Math.max(0, Math.min(1, Number(v))));
      } else if (e.key === "sfxVolume") {
        const v = e.newValue;
        if (v != null) setSfxVolume(Math.max(0, Math.min(1, Number(v))));
      }
    }

    window.addEventListener("storage", onStorage);
    // Also listen for same-tab volume update events dispatched by OptionsPage
    const onVolumeEvent = (ev: Event) => {
      try {
        const d = (ev as CustomEvent).detail as { music?: number; sfx?: number } | undefined;
        if (d) {
          if (typeof d.music === "number") setMusicVolume(Math.max(0, Math.min(1, d.music)));
          if (typeof d.sfx === "number") setSfxVolume(Math.max(0, Math.min(1, d.sfx)));
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("volumechange", onVolumeEvent as EventListener);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Apply volume settings to currently playing audio elements when they change
  useEffect(() => {
    try {
      if (musicRef.current) {
        try {
          musicRef.current.volume = musicVolume;
        } catch {
          /* ignore */
        }
      }
      // Update preloaded SFX and swap element volumes
      if (soundsRef.current) {
        for (const s of soundsRef.current) {
          try {
            s.volume = sfxVolume;
          } catch {
            /* ignore */
          }
        }
      }
      if (swapRef.current) {
        try {
          swapRef.current.volume = sfxVolume;
        } catch {
          /* ignore */
        }
      }
      // Update any currently playing clones so volume slider takes immediate effect
      for (const a of playingClonesRef.current) {
        try {
          a.volume = sfxVolume;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, [musicVolume, sfxVolume]);

  // When a level is selected, copy its settings into the inputs so Start uses them.
  useEffect(() => {
    const lvl = LEVELS.find((l) => l.id === selectedLevelId);
    if (lvl) {
      setInputs((p) => ({
        ...p,
        startingLines: lvl.startingLines,
        targetLines: lvl.targetLines,
        rate: lvl.raiseRate,
      }));
    }
  }, [selectedLevelId]);

  // Keep pausedRef in sync with state
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Keep selectedLevelIdRef in sync with state so the keydown handler uses
  // the current level even though the handler is registered once on mount.
  useEffect(() => {
    selectedLevelIdRef.current = selectedLevelId;
  }, [selectedLevelId]);

  // Auto-start once on mount if this component is used for the /play route.
  useEffect(() => {
    // If on desktop auto-start the game. On mobile, prefer the title page so
    // the screen stays uncluttered and the player can tap Start explicitly.
    if (!isMobile) {
      if (scene === "play" && !engineRef.current) {
  // If navigation provided a startLevelId, use it; otherwise start default
  const navState = (location as unknown as { state?: { startLevelId?: string } })?.state;
        const startLevelId = navState?.startLevelId;
        if (startLevelId) startGame(startLevelId);
        else startGame();
      }
    } else {
      // Ensure mobile viewers start on the title page
      if (scene !== "title") setScene("title");
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep isMobile updated on resize / orientation change
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(max-width:640px)");
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    try {
      mq.addEventListener("change", onChange);
    } catch {
      // Safari fallback for older browsers without addEventListener on MediaQueryList
      const legacy = mq as MediaQueryList & {
        addListener?: (l: (ev: MediaQueryListEvent) => void) => void;
        removeListener?: (l: (ev: MediaQueryListEvent) => void) => void;
      };
      legacy.addListener?.(onChange);
    }
    return () => {
      try {
        mq.removeEventListener("change", onChange);
      } catch {
        const legacy = mq as MediaQueryList & {
          addListener?: (l: (ev: MediaQueryListEvent) => void) => void;
          removeListener?: (l: (ev: MediaQueryListEvent) => void) => void;
        };
        legacy.removeListener?.(onChange);
      }
    };
  }, []);

  // Fade out current music smoothly over `durationMs` then stop and clear ref.
  const fadeOutAndStopMusic = useCallback(
    (mRef: React.MutableRefObject<HTMLAudioElement | null>, durationMs = 300) => {
      const m = mRef.current;
      if (!m) return;
      try {
        const startVol = typeof m.volume === "number" ? m.volume : musicVolume;
        const start = performance.now();
        const step = 30; // ms tick
        const tick = () => {
          const t = performance.now() - start;
          const p = Math.min(1, t / durationMs);
          try {
            m.volume = Math.max(0, startVol * (1 - p));
          } catch {
            // ignore volume set errors
          }
          if (p >= 1) {
            try {
              m.pause();
              m.currentTime = 0;
            } catch {
              /* ignore */
            }
            mRef.current = null;
          } else {
            setTimeout(tick, step);
          }
        };
        tick();
      } catch {
        try {
          m.pause();
          m.currentTime = 0;
        } catch {
          /* ignore */
        }
        mRef.current = null;
      }
    },
    [musicVolume]
  );

  // Pause music and stop playing SFX when navigating away from the /play route
  useEffect(() => {
    try {
      const path = location.pathname || "";
      // Treat any route under /play as the active game.
      if (path.startsWith("/play")) return;

      // If navigating to Title, Options, or Level Select, gracefully fade out music
      if (path === "/" || path.startsWith("/options") || path.startsWith("/levels")) {
        if (musicRef.current) {
          try {
            fadeOutAndStopMusic(musicRef, 200);
          } catch (e) {
            void e;
            try {
              musicRef.current.pause();
              musicRef.current.currentTime = 0;
            } catch (ee) {
              void ee;
            }
            musicRef.current = null;
          }
        }
      } else {
        // Other non-play routes: ensure music is stopped immediately
        if (musicRef.current) {
          try {
            musicRef.current.pause();
            musicRef.current.currentTime = 0;
          } catch {
            /* ignore */
          }
          musicRef.current = null;
        }
      }

      // Stop any playing cloned SFX in all non-play cases
      for (const a of playingClonesRef.current) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      playingClonesRef.current = [];
    } catch {
      /* ignore */
    }
  }, [location.pathname, fadeOutAndStopMusic]);

  // Load atlases once
  useEffect(() => {
    //console.log('[App] useEffect running. scene:', scene, 'atlasesReady:', atlasesReady);
    (async () => {
      try {
        const gems = await loadGemsAtlas(tilesGemsPng, tilesGemsXmlUrl, {
          w: 128,
          h: 128,
        });
        tilesBlackAtlasRef.current = gems;
        setAtlasesReady(true);
      } catch (e) {
        console.error("Failed to load gems atlases", e);
        setAtlasesReady(false);
      }
    })();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = WIDTH * CELL;
    canvas.height = HEIGHT * CELL;

    const onKeyDown = (e: KeyboardEvent) => {
      if (scene === "title") {
        if (e.key === "Enter") {
          startGame();
        }
        return;
      }
      if (!engineRef.current) return;

      // If the engine reports a win, allow advancing with Z / z / Space.
      // Use the ref to ensure we read the latest selected level id.
      const gs = engineRef.current.getState();
      if (gs.hasWon) {
        if (
          e.key === "z" ||
          e.key === "Z" ||
          e.key === " " ||
          e.key === "Space"
        ) {
          e.preventDefault();
          const currentId = selectedLevelIdRef.current;
          const idx = LEVELS.findIndex((l) => l.id === currentId);
          const nextIdx = (idx + 1) % LEVELS.length;
          const nextId = LEVELS[nextIdx].id;
          advanceToLevel(nextId);
          return;
        }
        // don't allow other gameplay keys while won
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
          engineRef.current.moveCursor(-1, 0);
          break;
        case "ArrowRight":
          engineRef.current.moveCursor(1, 0);
          break;
        case "ArrowUp":
          engineRef.current.moveCursor(0, -1);
          break;
        case "ArrowDown":
          engineRef.current.moveCursor(0, 1);
          break;
        case "z":
        case "Z":
        case " ":
        case "Space":
          e.preventDefault();
          if (!pausedRef.current) engineRef.current.swap();
          break;
        case "x":
        case "X":
          engineRef.current.manualRaiseOnce();
          break;
        case "r":
        case "R":
          startGame();
          break;
        case "p":
        case "P":
          togglePause();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Mobile pointer handlers: enable touch-to-move and tap-to-swap when mobile
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
        // ignore pointer capture failures on some platforms
      }
      ev.preventDefault();
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (!isMobile) return;
      if (!touchStateRef.current.active) return;
      const dx = ev.clientX - touchStateRef.current.startX;
      const dy = ev.clientY - touchStateRef.current.startY;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX)
        touchStateRef.current.moved = true;
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
      if (!touchStateRef.current.active) return;
      const duration = performance.now() - touchStateRef.current.startTime;
      const moved = touchStateRef.current.moved;
      touchStateRef.current.active = false;
      try {
        (ev.target as Element).releasePointerCapture(ev.pointerId);
      } catch {
        // ignore release failures
      }
      // Treat quick taps without movement as swap action
      if (!moved && duration <= TAP_MAX_MS) {
        try {
          engineRef.current?.swap();
        } catch {
          console.log("Swap failed");
        }
      }
      ev.preventDefault();
    };

    if (canvasEl) {
      canvasEl.addEventListener("pointerdown", onPointerDown);
      canvasEl.addEventListener("pointermove", onPointerMove);
      canvasEl.addEventListener("pointerup", onPointerUp);
      canvasEl.addEventListener("pointercancel", onPointerUp);
    }
    // Auto-pause when the tab/window loses focus
    const onVisibilityChange = () => {
      if (scene === "play" && !pausedRef.current && document.hidden) {
    // behave as if pause button was pressed
    pausedByFocusRef.current = true;
    togglePause();
      }
    };

    const onWindowBlur = () => {
      if (scene === "play" && !pausedRef.current) {
    // behave as if pause button was pressed
    pausedByFocusRef.current = true;
    togglePause();
      }
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);

    

    let raf = 0;
    let last = performance.now();
    const ctx = canvas.getContext("2d")!;

    // Main game loop
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;

      if (scene === "play" && engineRef.current) {
        engineRef.current.update(dt);
        const s = engineRef.current.getState();

        // Skins (background + foreground) when atlases are ready
        let bgSkin: Skin | undefined;
        let fgSkin: Skin | undefined;

        if (atlasesReady && backtilesAtlasRef.current) {
          const atlas = backtilesAtlasRef.current;

          // Determine the per-frame size from the atlas (works with XML or grid fallback)
          const anyFrame = Object.values(atlas.frames)[0];
          const frameW = anyFrame?.w ?? 128;
          const frameH = anyFrame?.h ?? 128;

          // Lock to row 2, col 1 (0-based: row=1, col=0)
          const BACK_COL = 0;
          const BACK_ROW = 1;
          const src: SrcRect = {
            sx: BACK_COL * frameW,
            sy: BACK_ROW * frameH,
            sw: frameW,
            sh: frameH,
          };

          // Always return the same source rect so every cell uses that one backtile
          bgSkin = {
            image: atlas.image,
            pickSrcForCell: () => src,
          };
        }

        if (atlasesReady && tilesBlackAtlasRef.current) {
          const atlas = tilesBlackAtlasRef.current;

          // Map 5 color indices -> 5 different “tile” looks.
          const keys = Object.keys(atlas.frames).sort();
          const candidates = keys.filter((k) => /_color/i.test(k));
          const order = (candidates.length >= 5 ? candidates : keys).slice(
            0,
            5
          );

          // Precompute a mapping from base frame -> clear variant so we
          // preserve the exact shape when swapping to the clear sprite.
          const clearMap: Record<string, string | undefined> = {};
          for (const baseName of order) {
            const lowerBase = baseName.toLowerCase();
            // Prefer exact suffix matches, then any frame that contains
            // both baseName and a 'clear' marker.
            const exactCandidates = [
              `${baseName}_clear`,
              `${baseName}-clear`,
              `${baseName}_matched`,
            ];
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
                return (
                  kl.includes(lowerBase) &&
                  /_clear|-clear|clear|matched/i.test(kl)
                );
              });
            }
            clearMap[baseName] = found;
          }

          const pickByColor = (
            i: number,
            variant: "normal" | "clear" = "normal"
          ): SrcRect => {
            const baseName =
              order[Math.max(0, Math.min(order.length - 1, i | 0))];
            if (variant === "clear") {
              const clearName = clearMap[baseName];
              if (clearName && atlas.frames[clearName]) {
                const f = atlas.frames[clearName];
                return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
              }
            }
            const f = atlas.frames[baseName];
            return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
          };

          fgSkin = {
            image: atlas.image,
            pickSrcForCell: () => {
              // not used for fg, but satisfy type:
              const f = atlas.frames[order[0]];
              return { sx: f.x, sy: f.y, sw: f.w, sh: f.h };
            },
            pickSrcForColor: pickByColor,
          };
        }

        // Sticky-cursor guard
        if (
          s.cursorX === 0 &&
          s.cursorY === 0 &&
          !(lastCursorRef.current.x === 0 && lastCursorRef.current.y === 0)
        ) {
          engineRef.current.setCursorAbsolute(
            lastCursorRef.current.x,
            lastCursorRef.current.y
          );
          const s2 = engineRef.current.getState();
          drawStateToCanvas(
            ctx,
            s2,
            CELL,
            dt,
            s2.scrollOffsetPx ?? 0,
            bgSkin,
            fgSkin
          );
        } else {
          drawStateToCanvas(
            ctx,
            s,
            CELL,
            dt,
            s.scrollOffsetPx ?? 0,
            bgSkin,
            fgSkin
          );
        }

        lastCursorRef.current = { x: s.cursorX, y: s.cursorY };

        // Compute win line percent and Y for the DOM WinLine component.
        const engine = engineRef.current;
        const total = Math.max(1, engine.totalLevelLines || 1);
        const rows = Math.max(0, engine.rowsInserted || 0);
        const pct = Math.max(0, Math.min(100, (rows / total) * 100));
  const rawWinY = typeof s.winLineY === "number" ? s.winLineY - 2.5 : -9999;
  // Only clamp the lower bound so the win line can remain off-screen
  // below the canvas when rows haven't risen far enough. Previously
  // clamping the upper bound forced off-screen values to the bottom
  // of the canvas which made the line appear incorrectly. Allow
  // rawWinY > canvas height so parent `overflow: hidden` keeps it hidden.
  const clampedWinY = Math.max(-CELL, rawWinY);
  setWinLine({ percent: pct, yPx: clampedWinY });

        // HUD: tiles above dashed line (derived)
        let tilesAbove = 0;
        if ((s.linesClearedEq ?? 0) >= (s.targetLines ?? 0)) {
          for (let y = 0; y < s.clearLineY; y++) {
            for (let x = 0; x < s.width; x++) {
              if (s.grid[y][x] >= 0) tilesAbove++;
            }
          }
        }

        setHud({
          score: s.score,
          matches: s.matchesTotal,
          chains: s.chainCount,
          linesEq: s.linesClearedEq,
          tilesAbove,
          hasWon: s.hasWon,
          hasLost: s.hasLost,
          risePauseMs: s.risePauseMs ?? 0,
          risePauseMaxMs: s.risePauseMaxMs ?? 0,
        });

        // If win/loss occurred, fade out any playing music
        if ((s.hasWon || s.hasLost) && musicRef.current) {
          try {
            fadeOutAndStopMusic(musicRef, 200);
          } catch {
            /* ignore */
          }
        }

        canvas.style.filter = s.hasWon || s.hasLost ? "blur(3px)" : "none";

        // Update DOM cursor overlay to sit above WinLine (if present)
        try {
          const overlay = cursorOverlayRef.current;
          if (overlay) {
            const childId = "dom-cursor-box";
            let child = overlay.querySelector<HTMLDivElement>(`#${childId}`);
            const cx = s.cursorX * CELL + 1.5;
            const cy = s.cursorY * CELL - (s.scrollOffsetPx ?? 0) + 1.5;
            const w = CELL * 2 - 3;
            const h = CELL - 3;
            const radius = Math.min(10, Math.max(4, Math.floor(CELL * 0.12)));
            if (!child) {
              // Create an SVG element with an animated gradient stroke and dashed rounded rect
              const strokeWidth = 3;
              const dashLen = Math.max(8, Math.round(CELL * 0.2));
              const dashGap = Math.max(6, Math.round(CELL * 0.12));
              const svg = `
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
                    <!-- Neon glow filter -->
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
              overlay.insertAdjacentHTML("beforeend", svg);
              child = overlay.querySelector<HTMLDivElement>(`#${childId}`) as unknown as HTMLDivElement;
            }
            // position the SVG overlay to match canvas cursor
            child.style.width = `${w}px`;
            child.style.height = `${h}px`;
            child.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
          }
        } catch {
          /* ignore overlay positioning errors */
        }
      } else {
        // Title scene: clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0f0f12";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      if (canvasEl) {
        canvasEl.removeEventListener("pointerdown", onPointerDown);
        canvasEl.removeEventListener("pointermove", onPointerMove);
        canvasEl.removeEventListener("pointerup", onPointerUp);
        canvasEl.removeEventListener("pointercancel", onPointerUp);
      }
      cancelAnimationFrame(raf);
    };
    // startGame and togglePause are stable, so we can safely ignore them for this effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, atlasesReady]);

  // (single fadeOutAndStopMusic defined above with useCallback)

  // Toggle pause: stops automatic rising and silences sounds/music
  function togglePause() {
    const now = !paused;
    setPaused(now);
    pausedRef.current = now;

    if (now) {
      // Pause engine automatic rise by zeroing scroll speed (remember previous)
      if (engineRef.current) {
        prevScrollSpeedRef.current = engineRef.current.scrollSpeedPxPerSec;
        engineRef.current.scrollSpeedPxPerSec = 0;
      }
      // Pause music
      if (musicRef.current) {
        try {
          musicRef.current.pause();
        } catch {
          // ignore
        }
      }
      // Stop playing clones
      for (const a of playingClonesRef.current) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          // ignore
        }
      }
      playingClonesRef.current = [];
    } else {
  // Clearing focus-caused pause since this is a user-initiated resume
  pausedByFocusRef.current = false;
      // Unpause: restore previous scroll speed
      if (engineRef.current && prevScrollSpeedRef.current !== null) {
        engineRef.current.scrollSpeedPxPerSec = prevScrollSpeedRef.current;
        prevScrollSpeedRef.current = null;
      }
      // Resume music for current level
      const lvl = LEVELS.find((l) => l.id === selectedLevelId);
    if (lvl && lvl.music) {
        try {
          const m = new Audio(lvl.music);
          m.loop = true;
          m.preload = "auto";
      m.volume = musicVolume;
          m.play().catch(() => {});
          musicRef.current = m;
        } catch {
          // ignore
        }
      }
    }
  }

  // Start the game with initial settings
  function startGame(levelId?: string) {
    // Stop previous music when starting/restarting (fade out)
    if (musicRef.current) fadeOutAndStopMusic(musicRef, 200);

    // Determine effective level and inputs (prefer explicit levelId when provided)
    const effectiveLevelId = levelId ?? selectedLevelId;
    const lvlForStart = LEVELS.find((l) => l.id === effectiveLevelId);
    type EffectiveInputs = { targetLines: number; startingLines: number; rate: number };

    const effectiveInputs: EffectiveInputs = lvlForStart
      ? {
          targetLines: lvlForStart.targetLines,
          startingLines: lvlForStart.startingLines,
          rate: lvlForStart.raiseRate,
        }
      : (inputs as unknown as EffectiveInputs);

    // Reflect chosen level settings in the UI
    if (lvlForStart) {
      setInputs((p) => ({ ...p, ...effectiveInputs }));
    }

    engineRef.current = new Engine(WIDTH, HEIGHT, 5);
    engineRef.current.cellSize = CELL;
    engineRef.current.targetLines = effectiveInputs.targetLines;

    // Use the explicit raise rate from effectiveInputs
    engineRef.current.autoRiseRateRowsPerSec = effectiveInputs.rate;

    // Prevent swapping while paused by wrapping the instance method
    const origSwap = engineRef.current.swap.bind(engineRef.current);
    engineRef.current.swap = function () {
      if (pausedRef.current) return;
      return origSwap();
    };

    // Wire up sound callback
    engineRef.current.onMatch = (chainCount: number) => {
      // Engine.chainCount: 1 = single initial match, 2+ = cascades.
      try {
        const sounds = soundsRef.current!;
        let idx = 0;
        if (chainCount <= 1) {
          // Single match -> impactMining_000
          idx = 0;
        } else if (chainCount === 2) {
          // First cascade after initial -> impactMining_001
          idx = 1;
        } else if (chainCount === 3) {
          idx = 2;
        } else if (chainCount === 4) {
          idx = 3;
        } else {
          idx = 4;
        }
  if (pausedRef.current) return;
  const audio = sounds[idx] as HTMLAudioElement;
  const clone = audio.cloneNode(true) as HTMLAudioElement;
  try { clone.volume = sfxVolume; } catch { /* ignore volume set errors */ }
  clone.play().catch(() => {});
  playingClonesRef.current.push(clone);
      } catch {
        // swallow errors so game keeps running
      }
    };

    // Play swap sound when engine notifies of swaps
    engineRef.current.onSwap = () => {
      try {
        if (pausedRef.current) return;
        if (swapRef.current) {
          const clone = swapRef.current.cloneNode(true) as HTMLAudioElement;
          try { clone.volume = sfxVolume; } catch { /* ignore volume set errors */ }
          clone.play().catch(() => {});
          playingClonesRef.current.push(clone);
        }
      } catch {
        // ignore
      }
    };

    // Wire up onWin to gracefully fade out music
    engineRef.current.onWin = () => {
      if (musicRef.current) fadeOutAndStopMusic(musicRef, 300);
    };

    // Start playing level music if provided (use effective level id)
    if (lvlForStart && lvlForStart.music) {
      try {
        const m = new Audio(lvlForStart.music);
        m.loop = true;
        m.preload = "auto";
        m.volume = 0.25; // default music volume
        m.play().catch(() => {});
        musicRef.current = m;
      } catch {
        // ignore
      }
    }

    // Build prebuilt queue: targetLines + 16 overflow rows
    const total = Math.max(
      1,
      // prefer explicit targetLines; fall back to a sane default
  effectiveInputs.targetLines || DEFAULT_TARGET_LINES
    );
    const queueLen = total + 16;
    const rows: number[][] = [];

    for (let i = 0; i < queueLen; i++) {
      const row: number[] = [];
      for (let x = 0; x < WIDTH; x++) {
        // random color index based on engine palette
        const colorIndex = Math.floor(
          Math.random() * engineRef.current.colors.length
        );
        row.push(colorIndex);
      }
      rows.push(row);
    }

    engineRef.current.setLevelQueue(
      rows,
      Math.max(0, Math.min(HEIGHT, effectiveInputs.startingLines))
    );

    // Set the totalLevelLines so engine computes the rising win line; the
    // engine will add the +16 rows already included above.
  // Set totalLevelLines so engine computes the rising win line; the
  // engine will add the +16 rows already included above. We use the
  // configured targetLines as the total for the engine's win-line math.
  engineRef.current.totalLevelLines = total;

    setScene("play");
    setHud({
      score: 0,
      matches: 0,
      chains: 0,
      linesEq: 0,
      tilesAbove: 0,
      hasWon: false,
      hasLost: false,
      risePauseMs: 0,
      risePauseMaxMs: 0,
    });
  }

  // Advance cleanly to the specified level id: stop audio, clear clones, reset engine and hud, then start
  function advanceToLevel(levelId: string) {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      if (musicRef.current) fadeOutAndStopMusic(musicRef, 200);
      for (const a of playingClonesRef.current) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          /* ignore clone stop errors */
        }
      }
      playingClonesRef.current = [];
      engineRef.current = null;
      setPaused(false);
  pausedRef.current = false;
  pausedByFocusRef.current = false;
      setHud({
        score: 0,
        matches: 0,
        chains: 0,
        linesEq: 0,
        tilesAbove: 0,
        hasWon: false,
        hasLost: false,
        risePauseMs: 0,
        risePauseMaxMs: 0,
      });
      setSelectedLevelId(levelId);
      // start the new level
      startGame(levelId);
    } finally {
      advancingRef.current = false;
    }
  }

  // preset change handler removed — UI no longer exposes rise preset controls

  // game framework
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        background: "#0b0b0e",
        color: "#cbd5e1",
        fontFamily: "ui-sans-serif, system-ui",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "start",
              width: WIDTH * CELL + 280,
              maxWidth: "90vw",
            }}
          >
            <div>
              {/* Game grid and overlays */}
              <div
                style={{
                  position: "relative",
                  width: WIDTH * CELL,
                  border: "2px solid #888",
                  backgroundColor: "#0f0f12",
                  borderRadius: 8,
                  overflow: "hidden",
                  // If the selected level has a background, apply it.
                  backgroundImage: LEVELS.find((l) => l.id === selectedLevelId)
                    ?.background
                    ? `url(${
                        LEVELS.find((l) => l.id === selectedLevelId)?.background
                      })`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={WIDTH * CELL}
                  height={HEIGHT * CELL}
                  style={{ borderRadius: 8, position: "relative", zIndex: 1000 }}
                />
                {/* Cursor overlay: positioned absolutely over the canvas so it can appear above DOM WinLine */}
                <div
                  ref={cursorOverlayRef}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: WIDTH * CELL,
                    height: HEIGHT * CELL,
                    pointerEvents: "none",
                    zIndex: 1400,
                  }}
                />
                {/* Inline Chain Gauge: 8px tall, sits inside the board container at the top */}
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 11,
                    overflow: "hidden",
                    pointerEvents: "none",
                    opacity: 0.8,
                    zIndex: 1100,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          hud.risePauseMaxMs
                            ? (hud.risePauseMs / hud.risePauseMaxMs) * 100
                            : 0
                        )
                      )}%`,
                      background: "linear-gradient(90deg,#6ee7b7,#34d399)",
                      transition: "width 120ms linear",
                    }}
                  ></div>
                    {/* STOP label: shows only when the gauge is active (risePauseMaxMs > 0) */}
                    {hud.risePauseMs > 0 && (
                      <div
                        style={{
                          position: "absolute",
                          left: 4,
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: 9,
                          fontWeight: 800,
                          lineHeight: 1,
                          color: "#333",
                          textShadow: "0 2px 2px rgba(223, 210, 210, 1)",
                          pointerEvents: "none",
                          zIndex: 1110,
                          userSelect: "none",
                        }}
                      >
                        STOP!
                      </div>
                    )}
                </div>
                {/* Soft fade gradients at top and bottom to mask incoming rows */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    height: CELL,
                    pointerEvents: "none",
                    background:
                      "linear-gradient(to bottom, rgba(11,11,14,1), rgba(11,11,14,0))",
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: CELL,
                    pointerEvents: "none",
                    background:
                      "linear-gradient(to top, rgba(11,11,14,1), rgba(11,11,14,0))",
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                  }}
                />
                {/* Win line (DOM) */}
                <WinLine
                  percent={winLine.percent}
                  yPx={winLine.yPx}
                  aria-label="Win threshold"
                  style={{ filter: hud.hasWon || hud.hasLost ? "blur(3px)" : "none" }}
                />
                {/* Title button at top-right of the board */}
                <button
                  onMouseEnter={() => setTitleHover(true)}
                  onMouseLeave={() => setTitleHover(false)}
                  onClick={() => {
                    // Stop music and playing clones, reset engine and HUD, go to title
                    if (musicRef.current) fadeOutAndStopMusic(musicRef, 200);
                    for (const a of playingClonesRef.current) {
                      try {
                        a.pause();
                        a.currentTime = 0;
                      } catch {
                        /* ignore clone stop errors */
                      }
                    }
                    playingClonesRef.current = [];
                    engineRef.current = null;
                    setPaused(false);
                    pausedRef.current = false;
                    setHud({
                      score: 0,
                      matches: 0,
                      chains: 0,
                      linesEq: 0,
                      tilesAbove: 0,
                      hasWon: false,
                      hasLost: false,
                      risePauseMs: 0,
                      risePauseMaxMs: 0,
                    });
                    pausedByFocusRef.current = false;
                    navigate("/");
                  }}
                  style={{
                    position: "absolute",
                    right: 8,
                    top: 8,
                    zIndex: 1300,
                    padding: "6px 10px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: titleHover ? 1 : 0.25,
                    transition: "opacity 160ms ease-in-out",
                  }}
                >
                  Title
                </button>
                {/* Options button, same style as Title, sits to the left of it */}
                <button
                  onMouseEnter={() => setOptionsHover(true)}
                  onMouseLeave={() => setOptionsHover(false)}
                  onClick={() => {
                    navigate("/options");
                  }}
                  aria-label="Options"
                  style={{
                    position: "absolute",
                    right: 124,
                    top: 8,
                    zIndex: 1300,
                    padding: "6px 10px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: optionsHover ? 1 : 0.25,
                    transition: "opacity 160ms ease-in-out",
                  }}
                >
                  Options
                </button>
                {/* Levels button between Options and Title */}
                <button
                  onMouseEnter={() => setLevelsHover(true)}
                  onMouseLeave={() => setLevelsHover(false)}
                  onClick={() => {
                    navigate("/levels");
                  }}
                  aria-label="Levels"
                  style={{
                    position: "absolute",
                    right: 60,
                    top: 8,
                    zIndex: 1300,
                    padding: "6px 10px",
                    fontSize: 14,
                    borderRadius: 6,
                    border: "none",
                    background: "rgba(0,0,0,0.5)",
                    color: "#fff",
                    cursor: "pointer",
                    opacity: levelsHover ? 1 : 0.25,
                    transition: "opacity 160ms ease-in-out",
                  }}
                >
                  Levels
                </button>
                {scene === "play" &&
                  !isMobile &&
                  (hud.hasWon || hud.hasLost) && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        color: "#fff",
                        textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                        fontWeight: 700,
                        fontSize: 32,
                        letterSpacing: 1,
                        zIndex: 1200, // ensure overlay appears above WinLine
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 16px",
                          borderRadius: 8,
                          background: "rgba(0,0,0,0.5)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                        }}
                      >
                        {hud.hasWon ? "You win!" : "Game Over!"}
                        {hud.hasWon && (
                          <button
                            style={{
                              marginTop: 18,
                              fontSize: 20,
                              padding: "8px 24px",
                              borderRadius: 6,
                              border: "none",
                              background: "#34d399",
                              color: "#222",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                            }}
                            onClick={() => {
                              const idx = LEVELS.findIndex(
                                (l) => l.id === selectedLevelId
                              );
                              const nextIdx = (idx + 1) % LEVELS.length;
                              const nextId = LEVELS[nextIdx].id;
                              advanceToLevel(nextId);
                            }}
                          >
                            Next Level
                          </button>
                        )}
                        {hud.hasLost && (
                          <button
                            style={{
                              marginTop: 18,
                              fontSize: 20,
                              padding: "8px 24px",
                              borderRadius: 6,
                              border: "none",
                              background: "#f87171",
                              color: "#222",
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                            }}
                            onClick={() => {
                              // stop music and playing clones, reset engine and HUD, go to title
                              if (musicRef.current)
                                fadeOutAndStopMusic(musicRef, 200);
                              for (const a of playingClonesRef.current) {
                                try {
                                  a.pause();
                                  a.currentTime = 0;
                                } catch {
                                  /* ignore clone stop errors */
                                }
                              }
                              playingClonesRef.current = [];
                              engineRef.current = null;
                              setPaused(false);
                              pausedRef.current = false;
                              setHud({
                                score: 0,
                                matches: 0,
                                chains: 0,
                                linesEq: 0,
                                tilesAbove: 0,
                                hasWon: false,
                                hasLost: false,
                                risePauseMs: 0,
                                risePauseMaxMs: 0,
                              });
                              pausedByFocusRef.current = false;
                              navigate("/");
                            }}
                          >
                            Return to Title
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                {/* Continue overlay for focus-caused pause */}
                {scene === "play" && !isMobile && paused && pausedByFocusRef.current && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      color: "#fff",
                      textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                      fontWeight: 700,
                      fontSize: 32,
                      letterSpacing: 1,
                      zIndex: 1200,
                    }}
                  >
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: 8,
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div>Paused - Click Continue to resume</div>
                      <button
                        style={{
                          marginTop: 18,
                          fontSize: 20,
                          padding: "8px 24px",
                          borderRadius: 6,
                          border: "none",
                          background: "#34d399",
                          color: "#222",
                          fontWeight: 700,
                          cursor: "pointer",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                        }}
                        onClick={() => {
                          pausedByFocusRef.current = false;
                          togglePause();
                        }}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}
                {/* Mobile swap button: simple floating control for tap-to-swap */}
                {isMobile && scene === "play" && (
                  <button
                    onClick={() => {
                      try {
                        engineRef.current?.swap();
                      } catch {
                        // ignore
                      }
                    }}
                    style={{
                      position: "absolute",
                      right: 12,
                      bottom: 12,
                      zIndex: 30,
                      padding: "12px 16px",
                      fontSize: 18,
                      borderRadius: 8,
                      border: "none",
                      background: "#34d399",
                      color: "#062017",
                      boxShadow: "0 6px 18px rgba(0,0,0,0.3)",
                    }}
                  >
                    Swap
                  </button>
                )}
              </div>
            </div>

            {/* Right HUD: hide on mobile for a minimal experience */}
            {!isMobile && (
              <div style={{ fontSize: 14 }}>
                {/* Title and small intro moved to the right HUD */}
                <div style={{ marginBottom: 10 }}>
                  <h2 style={{ margin: 0 }}>Can't Stop the Swap</h2>
                  {scene === "title" ? (
                    <p style={{ marginTop: 4, opacity: 0.9 }}>
                      Press <strong>Enter</strong> or click{" "}
                      <strong>Start</strong>.
                    </p>
                  ) : null}
                </div>

                {/* Score HUD moved above settings */}
                {scene === "play" && (
                  <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>
                      {/* rise pause indicator already shown above the grid; keep this space for consistency */}
                    </div>
                    <div>
                      Score: <strong>{hud.score}</strong>
                    </div>
                    <div>
                      Matches (incl. chains): <strong>{hud.matches}</strong>
                    </div>
                    <div>
                      Current chain: <strong>x{Math.max(1, hud.chains)}</strong>
                    </div>
                    <div>
                      Lines cleared (eq): <strong>{hud.linesEq}</strong> /{" "}
                      <strong>{inputs.targetLines}</strong>
                    </div>
                    <div>
                      Tiles above line: <strong>{hud.tilesAbove}</strong>
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: "block", marginBottom: 6 }}>
                    Level: <strong style={{ marginLeft: 8 }}>{LEVELS.find(l => l.id === selectedLevelId)?.name}</strong>
                  </div>
                  {/* level selection is handled on the LevelSelect page; keep name display only */}
                </div>

                {scene === "play" ? (
                  <div>
                    <p style={{ marginTop: 8, opacity: 0.8 }}>
                      Controls: Arrows = move • Z/Space = swap • X = raise
                    </p>
                  </div>
                ) : (
                  <div>
                    <button onClick={() => startGame()}>Start</button>
                    <p style={{ marginTop: 8, opacity: 0.8 }}>
                      Press <strong>Enter</strong> to start.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Mobile title overlay: minimal UI with Start button */}
            {isMobile && scene === "title" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <h2 style={{ margin: 0 }}>Can't Stop the Swap</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => {
                      // start selected level
                      startGame();
                      setScene("play");
                    }}
                    style={{ padding: "10px 18px", fontSize: 18 }}
                  >
                    Start
                  </button>
                  <button
                    onClick={() => navigate("/")}
                    style={{ padding: "10px 18px", fontSize: 18 }}
                  >
                    Title
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
