# Neon Solitaire VR

A holodeck-style Klondike solitaire card game built with [IWSDK](https://iwsdk.dev) (Immersive Web SDK). Play in your browser or in VR on Meta Quest.

**[Play Now](https://ellyz2426.github.io/neon-solitaire/)**

## Features

- **Full Klondike Engine** — Draw, move, undo, redo, auto-complete, hints, stalemate detection
- **8 Game Modes** — Klondike 1-draw, Klondike 3-draw, Timed, Vegas, Daily Challenge, Speed, Zen, Practice
- **90 Achievements** — Track milestones across all modes with dynamic pagination
- **3D Card Meshes** — Canvas-textured cards with flip animations, hover glow, arc motion, and placement bounce
- **16 PanelUI Panels** — Title, mode select, HUD, pause, settings, achievements, leaderboard, stats, mode stats, help, skins, game over, countdown, toast, toolbar, tutorial
- **8 Holodeck Themes** — Neon Grid, Deep Space, Cyber City, Forest Glade, Digital Ocean, Ember Glow, Midnight Rose, Quantum Void
- **8 Card Back Skins** — Customize your deck with unique designs
- **Drag & Drop** — Click, double-click, right-click auto-move, or drag cards to move them
- **Procedural Audio** — SFX for all interactions plus ambient generative music with 3 chord progressions
- **Particle Effects** — Combo sparkles, foundation fireworks, win cascades, ambient floating particles, card trails
- **XR Controller Support** — Trigger=select, A=undo, B=hint, Y=redo, thumbstick click=pause
- **Per-Mode Statistics** — Track wins, losses, best times, and streaks per game mode
- **Tutorial Panel** — On-screen guide for browser and VR controls (first-launch)
- **XP & Leveling** — Earn experience and level up across all game modes with win streak bonuses
- **Daily Challenge Streaks** — Track consecutive daily completions
- **Leaderboard** — Per-mode scoring with localStorage persistence
- **Efficiency Grading** — A+ through F rating based on moves and time
- **Auto-Save/Resume** — Game state saved every 10 seconds, resume from title screen
- **Score Popups** — Floating score text with combo color scaling
- **Auto-Hint** — Idle timer subtly pulses movable cards after 15 seconds
- **Keyboard Shortcuts** — 1-8 for modes, U=undo, Y=redo, H=hint, Esc=pause
- **Combo System** — Chain moves for score multipliers with camera shake and flash effects
- **Time Bonus** — Up to 500 bonus points for fast wins

## Controls

### Browser
| Key | Action |
|-----|--------|
| Click / Drag | Select and move cards |
| Double-click | Auto-move to foundation |
| Right-click | Auto-move to foundation |
| U | Undo |
| Y | Redo |
| H | Hint |
| Esc | Pause |
| 1-8 | Quick-start game mode |

### VR Controller
| Input | Action |
|-------|--------|
| Trigger | Select/move cards |
| A Button | Undo |
| B Button | Hint |
| Y Button | Redo |
| Thumbstick Click | Pause |

## Tech Stack

- IWSDK v0.4.1
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
