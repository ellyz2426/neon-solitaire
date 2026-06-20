# Neon Solitaire VR

A holodeck-style Klondike solitaire card game built with [IWSDK](https://iwsdk.dev) (Immersive Web SDK). Play in your browser or in VR on Meta Quest.

**[Play Now](https://ellyz2426.github.io/neon-solitaire/)**

## Features

- **Full Klondike Engine** — Draw, move, undo, auto-complete, hints, stalemate detection
- **8 Game Modes** — Klondike 1-draw, Klondike 3-draw, Timed, Vegas, Daily Challenge, Speed, Zen, Practice
- **57 Achievements** — Track milestones across all modes with dynamic pagination
- **3D Card Meshes** — Canvas-textured cards with flip animations, hover glow, and placement bounce
- **16 PanelUI Panels** — Title, mode select, HUD, pause, settings, achievements, leaderboard, stats, mode stats, help, skins, game over, countdown, toast, toolbar, tutorial
- **5 Holodeck Themes** — Switch visual environments on the fly
- **8 Card Back Skins** — Customize your deck with unique designs
- **Procedural Audio** — SFX for all interactions plus ambient generative music
- **Particle Effects** — Combo sparkles, foundation fireworks, ambient floating particles
- **XR Controller Support** — Trigger=select, A=undo, B=hint, thumbstick click=pause
- **Per-Mode Statistics** — Track wins, losses, best times, and streaks per game mode
- **Tutorial Panel** — On-screen guide for browser and VR controls
- **XP & Leveling** — Earn experience and level up across all game modes
- **Daily Challenge Streaks** — Track consecutive daily completions
- **Leaderboard** — Per-mode scoring with localStorage persistence

## Controls

### Browser
- **Click** — Select/move cards
- **Double-click** — Auto-move to foundation
- **U** — Undo
- **H** — Hint
- **Esc** — Pause

### VR Controller
- **Trigger** — Select/move cards
- **A Button** — Undo
- **B Button** — Hint
- **Thumbstick Click** — Pause

## Tech Stack

- IWSDK v0.3.1
- Three.js r181
- EliCS v3.4.2
- TypeScript
- Vite

## Development

```bash
npm install
npx iwsdk dev up
```

## License

MIT
