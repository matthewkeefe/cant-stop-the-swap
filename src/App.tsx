import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import WinLine from './ui/WinLine';
import { useNavigate } from 'react-router-dom';
import { Engine } from './game-core/engine';
import { createEngineManager } from './lib/engineManager';

import { drawStateToCanvas, type Skin } from './renderer/canvasRenderer';
import useGameInput from './hooks/useGameInput';
import { createAudioManager } from './lib/audioManager';
import { buildBgSkin, buildFgSkin } from './lib/graphics';
import { updateCursorOverlay } from './lib/cursorOverlay';

import tilesGemsPng from './assets/sprites/gems.png';
import tilesGemsXmlUrl from './assets/sprites/gems.xml?url';
import { type Atlas, loadGemsAtlas } from './atlas'; // atlas helpers moved to src/atlas.ts
import LEVELS from './levels';
import Footer from './components/Footer';
import snd0 from './assets/sounds/impactMining_000.ogg?url';
import snd1 from './assets/sounds/impactMining_001.ogg?url';
import snd2 from './assets/sounds/impactMining_002.ogg?url';
import snd3 from './assets/sounds/impactMining_003.ogg?url';
import snd4 from './assets/sounds/impactMining_004.ogg?url';
import swapSnd from './assets/sounds/swap.ogg?url';

// Default target lines used when a level doesn't provide one.
const DEFAULT_TARGET_LINES = 10;

// Preset keys removed — use a single explicit raise rate in inputs

// ----------------------------------------------------------------------------

/**
 * Main application component for "Can't Stop the Swap".
 *
 * Handles game state, rendering, audio, input, and navigation between scenes (title, play, options, levels).
 * Manages the game engine, HUD, level selection, audio playback (music and SFX), and mobile/desktop UI adaptations.
 *
 * Features:
 * - Game grid rendering via canvas and DOM overlays.
 * - Keyboard and mobile touch controls for gameplay.
 * - Level progression, score tracking, and playthrough persistence.
 * - Audio management with fade-out and immediate stop for music/SFX.
 * - Responsive UI for mobile and desktop, including minimal mobile overlays.
 * - Pause/resume logic, including auto-pause on window/tab blur.
 * - Dynamic loading of tile atlases and level backgrounds.
 *
 * @component
 * @returns {JSX.Element} The root app UI.
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const engineMgrRef = useRef(createEngineManager());
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

  const [scene, setScene] = useState<'title' | 'play'>('play');
  // Detect mobile viewport and adjust UI: on mobile we show a minimal UI.
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(max-width:640px)').matches
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

  const [selectedLevelId, setSelectedLevelId] = useState<string>(LEVELS[0]?.id ?? 'level-1');
  // If the user selected a level via the LevelSelectPage, prefer that
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('selectedLevelId') : null;
      if (stored) setSelectedLevelId(stored);
    } catch {
      // ignore storage errors
    }
  }, []);
  // Keep a ref of selectedLevelId so long-lived event handlers can read the
  // latest value without re-registering listeners.
  const selectedLevelIdRef = useRef<string>(selectedLevelId);
  // Audio manager encapsulates SFX/music and clones
  const audioMgrRef = useRef(createAudioManager());
  // Pause state (pause stops automatic rising and mutes future sounds)
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  // Whether the current pause was caused by losing window/tab focus (visibility/blur)
  const pausedByFocusRef = useRef(false);
  // Track whether the X key is currently held and the previous raise rate to restore
  const xHoldRef = useRef(false);
  const xPrevRateRef = useRef<number | null>(null);
  // Track the base raise rate for the current level so X-release can restore correctly
  const baseRaiseRateRef = useRef<number | null>(null);
  // Remember previous scroll speed so we can restore after unpausing
  const prevScrollSpeedRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      audioMgrRef.current.init([snd0, snd1, snd2, snd3, snd4], swapSnd);
    } catch {
      /* ignore */
    }
  }, []);

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

  // Scores for the current playthrough: array of { levelId, score }
  const [playthroughScores, setPlaythroughScores] = useState<{ levelId: string; score: number }[]>(
    () => {
      try {
        if (typeof window !== 'undefined') {
          const raw = sessionStorage.getItem('currentPlaythrough');
          return raw ? (JSON.parse(raw) as { levelId: string; score: number }[]) : [];
        }
      } catch {
        /* ignore */
      }
      return [];
    },
  );

  const [winLine, setWinLine] = useState({ percent: 0, yPx: -9999 });
  const [titleHover, setTitleHover] = useState(false);
  const [optionsHover, setOptionsHover] = useState(false);
  const [levelsHover, setLevelsHover] = useState(false);

  // Volume settings (persisted to localStorage)
  const [musicVolume, setMusicVolume] = useState<number>(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem('musicVolume') : null;
    return v !== null ? Math.max(0, Math.min(1, Number(v))) : 0.25;
  });

  const [sfxVolume, setSfxVolume] = useState<number>(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem('sfxVolume') : null;
    return v !== null ? Math.max(0, Math.min(1, Number(v))) : 1.0;
  });

  // Update local volume state if other windows/tabs (or OptionsPage) change localStorage
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (!e.key) return;
      if (e.key === 'musicVolume') {
        const v = e.newValue;
        if (v != null) setMusicVolume(Math.max(0, Math.min(1, Number(v))));
      } else if (e.key === 'sfxVolume') {
        const v = e.newValue;
        if (v != null) setSfxVolume(Math.max(0, Math.min(1, Number(v))));
      }
    }

    window.addEventListener('storage', onStorage);

    // Also listen for same-tab volume update events dispatched by OptionsPage
    const onVolumeEvent = (ev: Event) => {
      try {
        const d = (ev as CustomEvent).detail as { music?: number; sfx?: number } | undefined;
        if (d) {
          if (typeof d.music === 'number') setMusicVolume(Math.max(0, Math.min(1, d.music)));
          if (typeof d.sfx === 'number') setSfxVolume(Math.max(0, Math.min(1, d.sfx)));
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('volumechange', onVolumeEvent as EventListener);
    return () => window.removeEventListener('storage', onStorage);
  }, []); // end app useEffect for volumes

  // Apply volume settings to currently playing audio elements when they change
  useEffect(() => {
    try {
      audioMgrRef.current.setVolumes(musicVolume, sfxVolume);
      musicRef.current = audioMgrRef.current.getMusic();
    } catch {
      /* ignore */
    }
  }, [musicVolume, sfxVolume]);

  // Fade out current music smoothly over `durationMs` then stop and clear ref.
  const fadeOutAndStopMusic = useCallback((durationMs = 300) => {
    try {
      audioMgrRef.current.fadeOutAndStopMusic(durationMs);
    } catch {
      /* ignore */
    }
  }, []);

  // Force-stop all tracked audio instances immediately (no fade)
  const forceStopAllAudioImmediate = useCallback(() => {
    try {
      audioMgrRef.current.forceStopAllAudioImmediate();
    } catch {
      /* ignore */
    }
    try {
      musicRef.current = audioMgrRef.current.getMusic();
    } catch {
      /* ignore */
    }
  }, []);

  // Pause music and stop playing SFX when navigating away from the /play route
  useEffect(() => {
    try {
      const path = location.pathname || '';
      // Treat any route under /play as the active game.
      if (path.startsWith('/play')) return;

      // If navigating to Title, Options, or Level Select, aggressively stop music
      if (path === '/' || path.startsWith('/options') || path.startsWith('/levels')) {
        // Try a graceful fade, but also force-stop all tracked music to prevent lingering audio
        try {
          fadeOutAndStopMusic(200);
        } catch {
          /* ignore */
        }
        try {
          forceStopAllAudioImmediate();
        } catch {
          /* ignore */
        }
      } else {
        // Other non-play routes: ensure music is stopped immediately
        try {
          forceStopAllAudioImmediate();
        } catch {
          /* ignore */
        }
      }

      // Stop any playing cloned SFX in all non-play cases
      try {
        audioMgrRef.current.stopPlayingClones();
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }, [location.pathname, fadeOutAndStopMusic, forceStopAllAudioImmediate]);

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

  const totalScore = playthroughScores.reduce((s, p) => s + (p?.score ?? 0), 0);

  // Auto-start once on mount if this component is used for the /play route.
  useEffect(() => {
    // Auto-start: when mounted for /play, start the level immediately (mobile and desktop).
    if (scene === 'play' && !engineRef.current) {
      const navState = (location as unknown as { state?: { startLevelId?: string } })?.state;
      const startLevelId = navState?.startLevelId;
      if (startLevelId) startGame(startLevelId);
      else startGame();
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also auto-start when navigation brings us to /play with a startLevelId
  // (covers client-side Title -> Play navigation when App is already mounted).
  useEffect(() => {
    try {
      const path = location.pathname || '';
      if (!path.startsWith('/play')) return;
      const navState = (location as unknown as { state?: { startLevelId?: string } })?.state;
      const startLevelId = navState?.startLevelId;
      // If engine already running, do nothing
      if (engineRef.current) return;
      // Auto-start regardless of device when navigating to /play
      if (startLevelId) startGame(startLevelId);
      else startGame();
    } catch {
      /* ignore */
    }
    // Intentionally run when pathname or isMobile changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, isMobile]);

  // Centralized input handling (keyboard + touch)
  useGameInput({
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
    onWinAdvance: () => {
      if (advancingRef.current) return;
      try {
        if (musicRef.current) fadeOutAndStopMusic(300);
      } catch {
        void 0;
      }
      try {
        const idx = LEVELS.findIndex((l) => l.id === selectedLevelIdRef.current);
        const nextIdx = idx + 1;
        if (nextIdx >= LEVELS.length) {
          navigate('/you-beat');
        } else {
          const nextId = LEVELS[nextIdx].id;
          advanceToLevel(nextId);
        }
      } catch {
        void 0;
      }
    },
    selectedLevelIdRef,
    pausedRef,
    xHoldRef,
    xPrevRateRef,
    baseRaiseRateRef,
  });

  // Small diagnostic overlay to show last pointer/tap info when enabled.
  // Toggle by setting `window.__CSTS_DEBUG_SHOW = true` in the browser console.
  const DebugOverlay = () => {
    try {
      // only render if explicitly enabled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window as any).__CSTS_DEBUG_SHOW) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = (window as any).__CSTS_DEBUG || {};
      const last = d.lastPointer;
      if (!last) return null;
      return (
        <div
          style={{
            position: 'fixed',
            left: 8,
            top: 8,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            color: 'white',
            padding: 8,
            fontSize: 12,
            borderRadius: 6,
          }}
        >
          <div>Last: {last.type}</div>
          <div>
            cell: {last.cellX ?? '-'} / {last.cellY ?? '-'}
          </div>
          <div>moved: {String(last.moved ?? false)}</div>
          <div>dur: {last.duration ?? '-'}</div>
          <div>phase: {last.phase ?? '-'}</div>
        </div>
      );
    } catch {
      return null;
    }
  };

  // Keep isMobile updated on resize / orientation change
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(max-width:640px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    try {
      mq.addEventListener('change', onChange);
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
        mq.removeEventListener('change', onChange);
      } catch {
        const legacy = mq as MediaQueryList & {
          addListener?: (l: (ev: MediaQueryListEvent) => void) => void;
          removeListener?: (l: (ev: MediaQueryListEvent) => void) => void;
        };
        legacy.removeListener?.(onChange);
      }
    };
  }, []);

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
        console.error('Failed to load gems atlases', e);
        setAtlasesReady(false);
      }
    })();
  }, []);

  // Main game and input handling loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    // Typed alias so we can attach small runtime bookkeeping fields without `any`.
    const canvasWithMeta = canvas as HTMLCanvasElement & {
      _devicePixelRatio?: number;
      _cssCellSize?: number;
    };

    // Responsive canvas sizing: compute CSS size that fits the viewport
    // while respecting the configured board logical size (WIDTH * CELL).
    const computeAndApplySize = () => {
      try {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        // CSS width should not exceed the logical board width; allow up to 90vw
        const maxCssWidth = Math.min(WIDTH * CELL, Math.floor(window.innerWidth * 0.9));
        const cssWidth = Math.max(64, maxCssWidth); // enforce a sensible minimum
        const scale = cssWidth / (WIDTH * CELL);
        const cssCellSize = CELL * scale; // cell size in CSS pixels

        const cssHeight = Math.round(HEIGHT * cssCellSize);
        const backingWidth = Math.round(cssWidth * dpr);
        const backingHeight = Math.round(cssHeight * dpr);

        // Apply CSS size for layout and high-DPI backing resolution for crispness
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.width = backingWidth;
        canvas.height = backingHeight;

        // store current DPR and cell CSS size for rendering
        canvasWithMeta._devicePixelRatio = dpr;
        canvasWithMeta._cssCellSize = cssCellSize;

        // If engine exists, set its cellSize to CSS pixels so logic that uses
        // engine.cellSize (e.g., scroll speed) remains in CSS coordinate space.
        if (engineRef.current) {
          engineRef.current.cellSize = cssCellSize;
          // Recompute scroll speed if a base raise rate is present
          try {
            if (baseRaiseRateRef.current) {
              engineRef.current.scrollSpeedPxPerSec =
                baseRaiseRateRef.current * engineRef.current.cellSize;
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        // fallback to fixed sizing
        canvas.width = WIDTH * CELL;
        canvas.height = HEIGHT * CELL;
        canvas.style.width = `${WIDTH * CELL}px`;
        canvas.style.height = `${HEIGHT * CELL}px`;
        canvasWithMeta._devicePixelRatio = 1;
        canvasWithMeta._cssCellSize = CELL;
      }
    };

    // Initial sizing and on resize/orientation change
    computeAndApplySize();
    const onResize = () => computeAndApplySize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // input handlers moved to useGameInput hook
    // Auto-pause when the tab/window loses focus
    const onVisibilityChange = () => {
      if (scene === 'play' && !pausedRef.current && document.hidden) {
        // behave as if pause button was pressed
        pausedByFocusRef.current = true;
        // If X was held, restore previous raise rate so we don't get stuck when focus returns
        try {
          if (xHoldRef.current) {
            xHoldRef.current = false;
            const prev = xPrevRateRef.current;
            if (typeof prev === 'number' && engineRef.current) {
              engineRef.current.autoRiseRateRowsPerSec = prev;
              try {
                engineRef.current.scrollSpeedPxPerSec = prev * engineRef.current.cellSize;
              } catch {
                /* ignore */
              }
            }
            xPrevRateRef.current = null;
          }
        } catch {
          void 0;
        }
        togglePause();
      }
    };

    const onWindowBlur = () => {
      if (scene === 'play' && !pausedRef.current) {
        // behave as if pause button was pressed
        pausedByFocusRef.current = true;
        try {
          if (xHoldRef.current) {
            xHoldRef.current = false;
            const prev = xPrevRateRef.current;
            if (typeof prev === 'number' && engineRef.current) {
              engineRef.current.autoRiseRateRowsPerSec = prev;
              try {
                engineRef.current.scrollSpeedPxPerSec = prev * engineRef.current.cellSize;
              } catch {
                /* ignore */
              }
            }
            xPrevRateRef.current = null;
          }
        } catch {
          void 0;
        }
        togglePause();
      }
    };

    window.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);

    let raf = 0;
    let last = performance.now();
    const ctx = canvas.getContext('2d')!;

    // Main game loop
    const loop = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;

      if (scene === 'play' && engineRef.current) {
        engineRef.current.update(dt);
        const s = engineRef.current.getState();

        // Skins (background + foreground) when atlases are ready —
        // use the extracted helpers in src/lib/graphics.ts
        let bgSkin: Skin | undefined;
        let fgSkin: Skin | undefined;

        if (atlasesReady) {
          bgSkin = buildBgSkin(backtilesAtlasRef.current);
          fgSkin = buildFgSkin(tilesBlackAtlasRef.current);
        }

        // Sticky-cursor guard
        if (
          s.cursorX === 0 &&
          s.cursorY === 0 &&
          !(lastCursorRef.current.x === 0 && lastCursorRef.current.y === 0)
        ) {
          engineRef.current.setCursorAbsolute(lastCursorRef.current.x, lastCursorRef.current.y);
          const s2 = engineRef.current.getState();
          // Use canvas backing units: cell size in canvas pixels = cssCellSize * dpr
          const dpr = canvasWithMeta._devicePixelRatio || 1;
          const cssCell = canvasWithMeta._cssCellSize || CELL;
          const canvasCellSize = cssCell * dpr;
          const scrollPx = (s2.scrollOffsetPx ?? 0) * dpr;
          drawStateToCanvas(ctx, s2, canvasCellSize, dt, scrollPx, bgSkin, fgSkin);
        } else {
          const dpr = canvasWithMeta._devicePixelRatio || 1;
          const cssCell = canvasWithMeta._cssCellSize || CELL;
          const canvasCellSize = cssCell * dpr;
          const scrollPx = (s.scrollOffsetPx ?? 0) * dpr;
          drawStateToCanvas(ctx, s, canvasCellSize, dt, scrollPx, bgSkin, fgSkin);
        }

        lastCursorRef.current = { x: s.cursorX, y: s.cursorY };

        // Compute win line percent and Y for the DOM WinLine component.
        const engine = engineRef.current;
        const total = Math.max(1, engine.totalLevelLines || 1);
        const rows = Math.max(0, engine.rowsInserted || 0);
        const pct = Math.max(0, Math.min(100, (rows / total) * 100));
        const rawWinY = typeof s.winLineY === 'number' ? s.winLineY - 2.5 : -9999;
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
            fadeOutAndStopMusic(200);
          } catch {
            /* ignore */
          }
        }

        canvas.style.filter = s.hasWon || s.hasLost ? 'blur(3px)' : 'none';

        // Update DOM cursor overlay to sit above WinLine (if present)
        try {
          const overlay = cursorOverlayRef.current;
          if (overlay) {
            const childId = 'dom-cursor-box';
            // Cursor overlay works in CSS pixels; use cssCell size for positioning
            const cssCell = canvasWithMeta._cssCellSize || CELL;
            const cx = s.cursorX * cssCell + 1.5;
            const cy = s.cursorY * cssCell - (s.scrollOffsetPx ?? 0) + 1.5;
            const w = cssCell * 2 - 3;
            const h = cssCell - 3;
            const radius = Math.min(10, Math.max(4, Math.floor(cssCell * 0.12)));
            updateCursorOverlay(overlay, childId, cx, cy, w, h, radius);
          }
        } catch {
          /* ignore overlay positioning errors */
        }
      } else {
        // Title scene: clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f0f12';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
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
      try {
        audioMgrRef.current.stopPlayingClones();
      } catch {
        /* ignore */
      }
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
          audioMgrRef.current.playLevelMusic(lvl.music);
          musicRef.current = audioMgrRef.current.getMusic();
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Start the game with initial settings
  function startGame(levelId?: string, opts?: { preservePlaythrough?: boolean }) {
    const preserve = opts?.preservePlaythrough ?? false;
    // If we're starting a fresh playthrough (not preserving), reset stored scores
    if (!preserve) {
      try {
        setPlaythroughScores([]);
        if (typeof window !== 'undefined') sessionStorage.removeItem('currentPlaythrough');
      } catch {
        /* ignore */
      }
    }
    // Stop previous music when starting/restarting (fade out)
    if (musicRef.current) fadeOutAndStopMusic(200);

    // Determine effective level and inputs (prefer explicit levelId when provided)
    const effectiveLevelId = levelId ?? selectedLevelId;
    const lvlForStart = LEVELS.find((l) => l.id === effectiveLevelId);
    type EffectiveInputs = {
      targetLines: number;
      startingLines: number;
      rate: number;
    };

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

    const e = engineMgrRef.current.start(WIDTH, HEIGHT, 5);
    engineRef.current = e;
    engineRef.current.cellSize = CELL;
    engineRef.current.targetLines = effectiveInputs.targetLines;

    // Determine an effective raise rate. If the level provides a non-positive
    // raiseRate (e.g. 0.0), fall back to the UI input or engine default so the
    // game actually rises instead of being paused.
    // Ensure there's always a small positive raise rate. If both the level
    // and UI inputs are zero/non-positive, fall back to a small safe default
    // so the level still rises during playtests.
    const MIN_RAISE_RATE = 0.05; // rows per second (minimum)
    const MAX_RAISE_RATE = 0.6; // rows per second (maximum for normalized rates)

    const mapNormalized = (v: number) => MIN_RAISE_RATE + v * (MAX_RAISE_RATE - MIN_RAISE_RATE);

    // Normalize fallback from UI input: if input rate is in [0,1] treat as normalized
    let fallbackRate = engineRef.current.autoRiseRateRowsPerSec ?? MAX_RAISE_RATE;
    if (typeof inputs.rate === 'number' && inputs.rate > 0) {
      fallbackRate = inputs.rate <= 1 ? mapNormalized(inputs.rate) : inputs.rate;
    } else {
      fallbackRate = Math.max(fallbackRate, MIN_RAISE_RATE);
    }

    let chosenRate: number;
    if (typeof effectiveInputs.rate === 'number' && effectiveInputs.rate > 0) {
      // If level-provided rate is normalized (<=1) map into usable range.
      chosenRate =
        effectiveInputs.rate <= 1 ? mapNormalized(effectiveInputs.rate) : effectiveInputs.rate;
    } else {
      chosenRate = fallbackRate;
    }
    // Apply chosen rate to the engine (rows/sec) and compute pixel scroll speed
    engineRef.current.autoRiseRateRowsPerSec = chosenRate;
    // remember the base raise rate for the current level
    baseRaiseRateRef.current = chosenRate;
    try {
      engineRef.current.scrollSpeedPxPerSec = chosenRate * engineRef.current.cellSize;
    } catch {
      /* ignore */
    }

    // Prevent swapping while paused by wrapping the instance method
    const origSwap = engineRef.current.swap.bind(engineRef.current);
    engineRef.current.swap = function () {
      if (pausedRef.current) return;
      return origSwap();
    };

    // Wire up sound callbacks and win handler via engine manager
    try {
      engineMgrRef.current.setHandlers({
        onMatch: (chainCount: number) => {
          try {
            if (pausedRef.current) return;
            audioMgrRef.current.playMatch(chainCount);
          } catch {
            void 0;
          }
        },
        onSwap: () => {
          try {
            if (pausedRef.current) return;
            audioMgrRef.current.playSwap();
          } catch {
            void 0;
          }
        },
        onWin: () => {
          if (musicRef.current) fadeOutAndStopMusic(300);
        },
      });
    } catch {
      void 0;
    }

    // Start playing level music if provided (use effective level id)
    if (lvlForStart && lvlForStart.music) {
      try {
        audioMgrRef.current.playLevelMusic(lvlForStart.music);
        musicRef.current = audioMgrRef.current.getMusic();
      } catch {
        /* ignore */
      }
    }

    // Build prebuilt queue: targetLines + 16 overflow rows
    const total = Math.max(
      1,
      // prefer explicit targetLines; fall back to a sane default
      effectiveInputs.targetLines || DEFAULT_TARGET_LINES,
    );
    const queueLen = total + 16;
    const rows: number[][] = [];

    for (let i = 0; i < queueLen; i++) {
      const row: number[] = [];
      for (let x = 0; x < WIDTH; x++) {
        // random color index based on engine palette
        const colorIndex = Math.floor(Math.random() * engineRef.current.colors.length);
        row.push(colorIndex);
      }
      rows.push(row);
    }

    engineRef.current.setLevelQueue(
      rows,
      Math.max(0, Math.min(HEIGHT, effectiveInputs.startingLines)),
    );

    // Set the totalLevelLines so engine computes the rising win line; the
    // engine will add the +16 rows already included above.
    // Set totalLevelLines so engine computes the rising win line; the
    // engine will add the +16 rows already included above. We use the
    // configured targetLines as the total for the engine's win-line math.
    engineRef.current.totalLevelLines = total;

    setScene('play');
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
      // If we just won the current level, record its score into the current playthrough.
      // Prefer the engine state when available to avoid race conditions where HUD lags behind.
      try {
        const engineState = engineRef.current?.getState?.();
        const won = !!(engineState?.hasWon || hud.hasWon);
        if (won) {
          // Use the ref to ensure we record the actual currently-selected level
          // even if this function was called from an older closure.
          const prevId = selectedLevelIdRef.current;
          // Prefer the engine state score when available to avoid HUD lag.
          const scoreToRecord =
            typeof engineState?.score === 'number' ? engineState!.score : hud.score;
          const entry = { levelId: prevId, score: scoreToRecord };
          setPlaythroughScores((p) => {
            const next = [...p, entry];
            try {
              if (typeof window !== 'undefined')
                sessionStorage.setItem('currentPlaythrough', JSON.stringify(next));
            } catch {
              /* ignore */
            }
            return next;
          });
        }
      } catch {
        /* ignore playthrough recording errors */
      }
      if (musicRef.current) fadeOutAndStopMusic(200);
      try {
        audioMgrRef.current.stopPlayingClones();
      } catch {
        /* ignore */
      }
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
      // start the new level, preserving the current playthrough
      startGame(levelId, { preservePlaythrough: true });
    } finally {
      advancingRef.current = false;
    }
  }

  // preset change handler removed — UI no longer exposes rise preset controls

  // game framework

  // When playing on mobile we want no padding/margins around the canvas so
  // the board fills the viewport. Compute a few helper style values.
  const containerPadding = isMobile && scene === 'play' ? 0 : 16;
  const containerWidth =
    isMobile && scene === 'play' ? '100vw' : `min(${WIDTH * CELL + 280}px, 90vw)`;
  const boardCssWidth = isMobile && scene === 'play' ? '100%' : WIDTH * CELL;

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: '#0b0b0e',
        color: '#cbd5e1',
        fontFamily: 'ui-sans-serif, system-ui',
        padding: containerPadding,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        {/* Debug overlay - toggle by setting window.__CSTS_DEBUG_SHOW = true in dev console */}
        <DebugOverlay />
        <div
          style={{
            display: 'grid',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 16,
              alignItems: 'start',
              // Responsive container: don't exceed viewport on small devices
              width: containerWidth,
              maxWidth: '100%',
            }}
          >
            <div>
              {/* Game grid and overlays */}
              <div
                style={{
                  position: 'relative',
                  width: boardCssWidth,
                  border: '2px solid #888',
                  backgroundColor: '#0f0f12',
                  borderRadius: 8,
                  overflow: 'hidden',
                  // If the selected level has a background, apply it.
                  backgroundImage: LEVELS.find((l) => l.id === selectedLevelId)?.background
                    ? `url(${LEVELS.find((l) => l.id === selectedLevelId)?.background})`
                    : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={WIDTH * CELL}
                  height={HEIGHT * CELL}
                  style={{
                    borderRadius: 8,
                    position: 'relative',
                    zIndex: 1000,
                    width: isMobile && scene === 'play' ? '100%' : undefined,
                    height: isMobile && scene === 'play' ? '100%' : undefined,
                  }}
                />
                {/* Cursor overlay: positioned absolutely over the canvas so it can appear above DOM WinLine */}
                <div
                  ref={cursorOverlayRef}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: isMobile && scene === 'play' ? '100%' : WIDTH * CELL,
                    height: isMobile && scene === 'play' ? '100%' : HEIGHT * CELL,
                    pointerEvents: 'none',
                    zIndex: 1400,
                  }}
                />
                {/* Inline Chain Gauge: 8px tall, sits inside the board container at the top */}
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: 11,
                    overflow: 'hidden',
                    pointerEvents: 'none',
                    opacity: 0.8,
                    zIndex: 1100,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          hud.risePauseMaxMs ? (hud.risePauseMs / hud.risePauseMaxMs) * 100 : 0,
                        ),
                      )}%`,
                      background: 'linear-gradient(90deg,#6ee7b7,#34d399)',
                      transition: 'width 120ms linear',
                    }}
                  ></div>
                  {/* STOP label: shows only when the gauge is active (risePauseMaxMs > 0) */}
                  {hud.risePauseMs > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 4,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: 9,
                        fontWeight: 800,
                        lineHeight: 1,
                        color: '#333',
                        textShadow: '0 2px 2px rgba(223, 210, 210, 1)',
                        pointerEvents: 'none',
                        zIndex: 1110,
                        userSelect: 'none',
                      }}
                    >
                      STOP!
                    </div>
                  )}
                </div>
                {/* Soft fade gradients at top and bottom to mask incoming rows */}
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: CELL,
                    pointerEvents: 'none',
                    background: 'linear-gradient(to bottom, rgba(11,11,14,1), rgba(11,11,14,0))',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: CELL,
                    pointerEvents: 'none',
                    background: 'linear-gradient(to top, rgba(11,11,14,1), rgba(11,11,14,0))',
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                  }}
                />
                {/* Win line (DOM) */}
                <WinLine
                  percent={winLine.percent}
                  yPx={winLine.yPx}
                  aria-label="Win threshold"
                  style={{
                    filter: hud.hasWon || hud.hasLost ? 'blur(3px)' : 'none',
                  }}
                />
                {/* Title button at top-right of the board */}(
                <button
                  onMouseEnter={() => setTitleHover(true)}
                  onMouseLeave={() => setTitleHover(false)}
                  onClick={() => {
                    // Stop music and playing clones, reset engine and HUD, go to title
                    if (musicRef.current) fadeOutAndStopMusic(200);
                    try {
                      audioMgrRef.current.stopPlayingClones();
                    } catch {
                      /* ignore */
                    }
                    try {
                      audioMgrRef.current.stopPlayingClones();
                    } catch {
                      /* ignore */
                    }
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
                    navigate('/');
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    zIndex: 1300,
                    padding: '6px 10px',
                    fontSize: 14,
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    cursor: 'pointer',
                    opacity: titleHover ? 1 : 0.25,
                    transition: 'opacity 160ms ease-in-out',
                  }}
                >
                  Title
                </button>
                ){/* Options button, same style as Title, sits to the left of it */}(
                <button
                  onMouseEnter={() => setOptionsHover(true)}
                  onMouseLeave={() => setOptionsHover(false)}
                  onClick={() => {
                    // Stop music and playing clones, reset engine and HUD, then go to Options
                    if (musicRef.current) fadeOutAndStopMusic(200);
                    try {
                      audioMgrRef.current.stopPlayingClones();
                    } catch {
                      /* ignore */
                    }
                    try {
                      audioMgrRef.current.stopPlayingClones();
                    } catch {
                      /* ignore */
                    }
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
                    navigate('/options');
                  }}
                  aria-label="Options"
                  style={{
                    position: 'absolute',
                    right: 124,
                    top: 8,
                    zIndex: 1300,
                    padding: '6px 10px',
                    fontSize: 14,
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    cursor: 'pointer',
                    opacity: optionsHover ? 1 : 0.25,
                    transition: 'opacity 160ms ease-in-out',
                  }}
                >
                  Options
                </button>
                ){/* Levels button between Options and Title */}(
                <button
                  onMouseEnter={() => setLevelsHover(true)}
                  onMouseLeave={() => setLevelsHover(false)}
                  onClick={() => {
                    // Stop music and playing clones, reset engine and HUD, then go to Levels
                    if (musicRef.current) fadeOutAndStopMusic(200);
                    try {
                      audioMgrRef.current.stopPlayingClones();
                    } catch {
                      /* ignore */
                    }
                    try {
                      audioMgrRef.current.stopPlayingClones();
                    } catch {
                      /* ignore */
                    }
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
                    navigate('/levels');
                  }}
                  aria-label="Levels"
                  style={{
                    position: 'absolute',
                    right: 60,
                    top: 8,
                    zIndex: 1300,
                    padding: '6px 10px',
                    fontSize: 14,
                    borderRadius: 6,
                    border: 'none',
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    cursor: 'pointer',
                    opacity: levelsHover ? 1 : 0.25,
                    transition: 'opacity 160ms ease-in-out',
                  }}
                >
                  Levels
                </button>
                )
                {scene === 'play' && (hud.hasWon || hud.hasLost) && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                      fontWeight: 700,
                      fontSize: 32,
                      letterSpacing: 1,
                      zIndex: 1200, // ensure overlay appears above WinLine
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      {hud.hasWon ? 'You win!' : 'Game Over!'}
                      {hud.hasWon && (
                        <button
                          style={{
                            marginTop: 18,
                            fontSize: 20,
                            padding: '8px 24px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#34d399',
                            color: '#222',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          }}
                          onClick={() => {
                            const idx = LEVELS.findIndex((l) => l.id === selectedLevelId);
                            const nextIdx = idx + 1;
                            if (nextIdx >= LEVELS.length) {
                              navigate('/you-beat');
                            } else {
                              const nextId = LEVELS[nextIdx].id;
                              advanceToLevel(nextId);
                            }
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
                            padding: '8px 24px',
                            borderRadius: 6,
                            border: 'none',
                            background: '#f87171',
                            color: '#222',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          }}
                          onClick={() => {
                            // stop music and playing clones, reset engine and HUD, go to title
                            if (musicRef.current) fadeOutAndStopMusic(200);
                            try {
                              audioMgrRef.current.stopPlayingClones();
                            } catch {
                              /* ignore */
                            }
                            try {
                              audioMgrRef.current.stopPlayingClones();
                            } catch {
                              /* ignore */
                            }
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
                            navigate('/');
                          }}
                        >
                          Return to Title
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {/* Continue overlay for focus-caused pause */}
                {scene === 'play' && !isMobile && paused && pausedByFocusRef.current && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'grid',
                      placeItems: 'center',
                      color: '#fff',
                      textShadow: '0 2px 8px rgba(0,0,0,0.6)',
                      fontWeight: 700,
                      fontSize: 32,
                      letterSpacing: 1,
                      zIndex: 1200,
                    }}
                  >
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.5)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                      }}
                    >
                      <div>Paused - Click Continue to resume</div>
                      <button
                        style={{
                          marginTop: 18,
                          fontSize: 20,
                          padding: '8px 24px',
                          borderRadius: 6,
                          border: 'none',
                          background: '#34d399',
                          color: '#222',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
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
                {isMobile && scene === 'play' && (
                  <button
                    onClick={() => {
                      try {
                        engineRef.current?.swap();
                      } catch {
                        // ignore
                      }
                    }}
                    style={{
                      position: 'absolute',
                      right: 12,
                      bottom: 12,
                      zIndex: 30,
                      padding: '12px 16px',
                      fontSize: 18,
                      borderRadius: 8,
                      border: 'none',
                      background: '#34d399',
                      color: '#062017',
                      boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
                    }}
                  >
                    Swap
                  </button>
                )}
              </div>
              {/* Footer under the canvas for play page - hide on mobile play for a pure-canvas view */}
              {!(isMobile && scene === 'play') && (
                <div style={{ marginTop: 12 }}>
                  <Footer />
                </div>
              )}
            </div>

            {/* Right HUD: hide on mobile for a minimal experience */}
            {!isMobile && (
              <div style={{ fontSize: 14 }}>
                {/* Title and small intro moved to the right HUD */}
                <div style={{ marginBottom: 10 }}>
                  <h2 style={{ margin: 0 }}>Can't Stop the Swap</h2>
                  {scene === 'title' ? (
                    <p style={{ marginTop: 4, opacity: 0.9 }}>
                      Press <strong>Enter</strong> or click <strong>Start</strong>.
                    </p>
                  ) : null}
                </div>

                {/* Score HUD moved above settings */}
                {scene === 'play' && (
                  <div style={{ fontSize: 14, opacity: 0.9, marginBottom: 16 }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>
                      {/* rise pause indicator already shown above the grid; keep this space for consistency */}
                    </div>
                    <div>
                      Level Score: <strong>{hud.score}</strong>
                    </div>
                    <div>
                      Total Score: <strong>{totalScore}</strong>
                    </div>
                    <div>
                      Matches (incl. chains): <strong>{hud.matches}</strong>
                    </div>
                    <div>
                      Current chain: <strong>x{Math.max(1, hud.chains)}</strong>
                    </div>
                    <div>
                      Lines cleared (eq): <strong>{hud.linesEq}</strong> /{' '}
                      <strong>{inputs.targetLines}</strong>
                    </div>
                    <div>
                      Tiles above line: <strong>{hud.tilesAbove}</strong>
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'block', marginBottom: 6 }}>
                    Level:{' '}
                    <strong style={{ marginLeft: 8 }}>
                      {LEVELS.find((l) => l.id === selectedLevelId)?.name}
                    </strong>
                  </div>
                  {/* level selection is handled on the LevelSelect page; keep name display only */}
                </div>

                {scene === 'play' ? (
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

            {/* Mobile title overlay removed: on mobile, /play auto-starts and only the canvas is shown */}
          </div>
        </div>
      </div>
    </div>
  );
}
