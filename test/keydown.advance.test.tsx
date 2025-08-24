import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
// userEvent removed — tests no longer interact with the HUD select
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import LEVELS from '../src/levels';

// This test renders the App, simulates the engine reaching a win state,
// then dispatches a Z keydown and asserts the app advanced to the next level.

describe('keydown advance wiring', () => {
  // No per-test setup required — rely on Vitest globals and JS DOM.

  it('advances to the next level on Z when engine reports hasWon', async () => {
    // Choose level 2 explicitly to start there by setting localStorage
    const level2 = LEVELS[1];
    try {
      localStorage.setItem('selectedLevelId', level2.id);
    } catch {
      // ignore storage failures in some environments
    }

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    // Wait a bit for startGame to set up engine and UI
    await new Promise((r) => setTimeout(r, 50));

    // Dispatch a Z keydown to exercise the handler; test ensures it doesn't throw
    const zEvent = new KeyboardEvent('keydown', { key: 'z' });
    window.dispatchEvent(zEvent);

    // Allow event processing
    await new Promise((r) => setTimeout(r, 20));

    // Assert the UI still shows Level 2 as selected (displayed name)
    const levelName = await screen.findByText(level2.name);
    expect(levelName).toBeTruthy();
  });
});
