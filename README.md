# Can't Stop the Swap

Visit: https://matthewkeefe.github.io/cant-stop-the-swap/

A small browser-based match-and-rise puzzle game built with React + TypeScript + Vite.

Overview
- You control a 2-tile cursor and swap adjacent gems to form matches.
- Matching tiles clear, cause cascades, and can trigger a win when enough lines are cleared.
- Incoming rows rise from the bottom; don't let tiles reach the top.

Controls
- Arrow keys: move cursor
- Z or Space: swap the two tiles under the cursor
- X: manually raise one row
- P: pause/unpause
- R: reset current level

Title page
- Shows a centered title image and lets you start the game or open Options.
- Press Space or Z (on the title page) to start quickly.

Project structure (key files)
- `src/App.tsx` — Play screen and main game wiring (engine, audio, HUD)
- `src/main.tsx` — App entry (router + GameProvider)
- `src/AppRoutes.tsx` — Router configuration (Title, Play, Options)
- `src/pages/TitlePage.tsx` — Title screen component
- `src/game-core/engine.ts` — Game logic and state (Engine class)
- `src/renderer/canvasRenderer.ts` — Canvas rendering of the game
- `src/levels` — Level definitions and background images
- `src/assets` — Images, sprites, music, and sound effects

Notes
- The project uses a `GameProvider` to share pause/state between routes.
- If you add a title image, place it at `src/assets/background/csts-title.png` and the title page will display it.

License
- See `LICENSE` in the repo root.
