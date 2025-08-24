import React from 'react';
import { useNavigate } from 'react-router-dom';
import LEVELS from '../levels';
import Footer from '../components/Footer';

const ScorePage: React.FC = () => {
  const navigate = useNavigate();

  // Read playthrough from sessionStorage if present
  let scores: { levelId: string; score: number }[] = [];
  try {
    if (typeof window !== 'undefined') {
      const raw = sessionStorage.getItem('currentPlaythrough');
      if (raw) scores = JSON.parse(raw) as typeof scores;
    }
  } catch {
    /* ignore */
  }

  const total = scores.reduce((s, p) => s + (p?.score ?? 0), 0);

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
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: 664, maxWidth: '90vw', textAlign: 'left' }}>
        <h1 style={{ marginBottom: 8 }}>Playthrough Scores</h1>

        {scores.length === 0 ? (
          <p style={{ opacity: 0.9 }}>No scores recorded for this session.</p>
        ) : (
          <div>
            <ul>
              {scores.map((s, i) => {
                const lvl = LEVELS.find((l) => l.id === s.levelId);
                const label = lvl ? lvl.name : s.levelId;
                return (
                  <li key={i}>
                    {label}: <strong>{s.score}</strong>
                  </li>
                );
              })}
            </ul>
            <div style={{ marginTop: 8 }}>
              Total: <strong>{total}</strong>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button onClick={() => navigate(-1)}>Back</button>
        </div>
        <Footer />
      </div>
    </div>
  );
};

export default ScorePage;
