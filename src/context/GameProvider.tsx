import React, { useMemo, useRef, useState } from 'react';
import { GameContext } from './GameContext';

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);

  const togglePause = () => {
    setPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      return next;
    });
  };

  const value = useMemo(() => ({ paused, togglePause }), [paused]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};
