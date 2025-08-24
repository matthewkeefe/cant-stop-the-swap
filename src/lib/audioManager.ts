export type AudioManager = ReturnType<typeof createAudioManager>;

export function createAudioManager() {
  let sounds: HTMLAudioElement[] | null = null;
  let swap: HTMLAudioElement | null = null;
  let music: HTMLAudioElement | null = null;
  const musicSet = new Set<HTMLAudioElement>();
  const sfxSet = new Set<HTMLAudioElement>();
  const playingClones: HTMLAudioElement[] = [];
  let musicVolume = 0.25;
  let sfxVolume = 1.0;

  function init(sndUrls: string[], swapUrl: string) {
    if (!sounds) {
      sounds = sndUrls.map((u) => {
        const a = new Audio(u);
        a.preload = 'auto';
        try {
          sfxSet.add(a);
        } catch {
          void 0;
        }
        return a;
      });
    }
    if (!swap) {
      swap = new Audio(swapUrl);
      swap.preload = 'auto';
      try {
        sfxSet.add(swap);
      } catch {
        void 0;
      }
    }
  }

  function setVolumes(mVol: number, sVol: number) {
    musicVolume = mVol;
    sfxVolume = sVol;
    try {
      if (music) music.volume = musicVolume;
    } catch {
      void 0;
    }
    try {
      if (sounds) for (const s of sounds) s.volume = sfxVolume;
    } catch {
      void 0;
    }
    try {
      if (swap) swap.volume = sfxVolume;
    } catch {
      void 0;
    }
    for (const c of playingClones) {
      try {
        c.volume = sfxVolume;
      } catch {
        void 0;
      }
    }
  }

  function fadeOutAndStopMusic(durationMs = 300) {
    const m = music;
    if (!m) return;
    try {
      const startVol = typeof m.volume === 'number' ? m.volume : musicVolume;
      const start = performance.now();
      const step = 30;
      const tick = () => {
        const t = performance.now() - start;
        const p = Math.min(1, t / durationMs);
        try {
          m.volume = Math.max(0, startVol * (1 - p));
        } catch {
          void 0;
        }
          if (p >= 1) {
          try {
            m.pause();
            m.currentTime = 0;
            musicSet.delete(m);
          } catch {
            void 0;
          }
          if (music === m) music = null;
        } else {
          setTimeout(tick, step);
        }
      };
      tick();
    } catch {
      try {
        m.pause();
        m.currentTime = 0;
        musicSet.delete(m);
      } catch {
        void 0;
      }
      if (music === m) music = null;
    }
  }

  function forceStopAllAudioImmediate() {
    try {
      for (const m of Array.from(musicSet)) {
        try {
          m.pause();
          m.currentTime = 0;
        } catch {
          void 0;
        }
        musicSet.delete(m);
      }
    } catch {
      void 0;
    }
    try {
      for (const s of Array.from(sfxSet)) {
        try {
          s.pause();
          s.currentTime = 0;
        } catch {
          void 0;
        }
        sfxSet.delete(s);
      }
    } catch {
      void 0;
    }
    try {
      if (music) music = null;
    } catch {
      void 0;
    }
  }

  function playLevelMusic(url?: string | undefined) {
    if (!url) return;
    try {
      if (music) {
        try {
          music.pause();
          music.currentTime = 0;
        } catch {
          void 0;
        }
      }
    } catch {
      void 0;
    }
    try {
      const m = new Audio(url);
      m.loop = true;
      m.preload = 'auto';
      m.volume = musicVolume;
      m.play().catch(() => {});
      try {
        musicSet.add(m);
      } catch {
        void 0;
      }
      music = m;
    } catch {
      void 0;
    }
  }

  function pauseMusic() {
    try {
      if (music) music.pause();
    } catch {
      void 0;
    }
  }

  function playMatch(chainCount: number) {
    try {
      if (!sounds) return;
      let idx = 0;
      if (chainCount <= 1) idx = 0;
      else if (chainCount === 2) idx = 1;
      else if (chainCount === 3) idx = 2;
      else if (chainCount === 4) idx = 3;
      else idx = 4;
      const audio = sounds[idx] as HTMLAudioElement;
      const clone = audio.cloneNode(true) as HTMLAudioElement;
      try {
        clone.volume = sfxVolume;
      } catch {
        void 0;
      }
      clone.play().catch(() => {});
      playingClones.push(clone);
    } catch {
      void 0;
    }
  }

  function playSwap() {
    try {
      if (!swap) return;
      const clone = swap.cloneNode(true) as HTMLAudioElement;
      try {
        clone.volume = sfxVolume;
      } catch {
        void 0;
      }
      clone.play().catch(() => {});
      playingClones.push(clone);
    } catch {
      void 0;
    }
  }

  function stopPlayingClones() {
    try {
      for (const a of playingClones) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          void 0;
        }
      }
    } catch {
      void 0;
    }
    playingClones.length = 0;
  }

  return {
    init,
    setVolumes,
    fadeOutAndStopMusic,
    forceStopAllAudioImmediate,
    playLevelMusic,
    pauseMusic,
    playMatch,
    playSwap,
    stopPlayingClones,
    // for interoperability with existing code that may inspect the music
    getMusic: () => music,
  };
}
