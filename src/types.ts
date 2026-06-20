// -- Card data --------------------------------------------------------
export enum Suit { Clubs, Diamonds, Hearts, Spades }
export enum Rank { Ace, Two, Three, Four, Five, Six, Seven, Eight, Nine, Ten, Jack, Queen, King }

export const SUIT_NAMES = ['Clubs', 'Diamonds', 'Hearts', 'Spades'] as const;
export const RANK_NAMES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const SUIT_SYMBOLS = ['\u2663', '\u2666', '\u2665', '\u2660'] as const;

export function isRed(s: Suit): boolean { return s === Suit.Diamonds || s === Suit.Hearts; }

export interface Card { suit: Suit; rank: Rank; faceUp: boolean; id: number; }

// -- Pile types -------------------------------------------------------
export enum PileType { Stock, Waste, Foundation, Tableau }

export interface Pile { type: PileType; index: number; cards: Card[]; }

// -- Game state -------------------------------------------------------
export interface GameState {
  stock: Card[];
  waste: Card[];
  foundations: Card[][]; // 4
  tableau: Card[][];     // 7
  drawCount: 1 | 3;
  moves: number;
  score: number;
  combo: number;
  bestCombo: number;
  elapsed: number;       // seconds
  lastMoveTime: number;
  won: boolean;
  started: boolean;
  undoStack: string[];   // JSON snapshots
  redoStack: string[];   // Redo snapshots
  recycleCount: number;
}

// -- Efficiency grading -----------------------------------------------
export function getEfficiencyGrade(moves: number, elapsed: number, won: boolean): { grade: string; color: string } {
  if (!won) return { grade: 'F', color: '#ff3333' };
  // Score based on moves (lower = better) and time (faster = better)
  const moveScore = Math.max(0, 100 - (moves - 50) * 0.8);
  const timeScore = Math.max(0, 100 - (elapsed - 60) * 0.25);
  const total = moveScore * 0.6 + timeScore * 0.4;
  if (total >= 95) return { grade: 'A+', color: '#00ffcc' };
  if (total >= 85) return { grade: 'A', color: '#00ff88' };
  if (total >= 75) return { grade: 'B+', color: '#44ff44' };
  if (total >= 65) return { grade: 'B', color: '#88ff00' };
  if (total >= 55) return { grade: 'C+', color: '#ffff00' };
  if (total >= 45) return { grade: 'C', color: '#ffcc00' };
  if (total >= 35) return { grade: 'D', color: '#ff8800' };
  return { grade: 'D-', color: '#ff4400' };
}

// -- Game mode --------------------------------------------------------
export type GameMode =
  | 'klondike1' | 'klondike3' | 'timed' | 'vegas'
  | 'daily' | 'speed' | 'zen' | 'practice';

export interface ModeConfig {
  drawCount: 1 | 3;
  timeLimit: number;   // 0 = none
  scoring: 'standard' | 'vegas' | 'none';
  unlimitedUndo: boolean;
  hintsAlwaysOn: boolean;
  seed: number | null;  // null = random
}

export function getModeConfig(mode: GameMode): ModeConfig {
  switch (mode) {
    case 'klondike1': return { drawCount: 1, timeLimit: 0, scoring: 'standard', unlimitedUndo: false, hintsAlwaysOn: false, seed: null };
    case 'klondike3': return { drawCount: 3, timeLimit: 0, scoring: 'standard', unlimitedUndo: false, hintsAlwaysOn: false, seed: null };
    case 'timed':     return { drawCount: 1, timeLimit: 300, scoring: 'standard', unlimitedUndo: false, hintsAlwaysOn: false, seed: null };
    case 'vegas':     return { drawCount: 1, timeLimit: 0, scoring: 'vegas', unlimitedUndo: false, hintsAlwaysOn: false, seed: null };
    case 'daily': {
      const d = new Date(); const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
      return { drawCount: 1, timeLimit: 0, scoring: 'standard', unlimitedUndo: false, hintsAlwaysOn: false, seed };
    }
    case 'speed':     return { drawCount: 1, timeLimit: 120, scoring: 'standard', unlimitedUndo: false, hintsAlwaysOn: false, seed: null };
    case 'zen':       return { drawCount: 1, timeLimit: 0, scoring: 'none', unlimitedUndo: true, hintsAlwaysOn: false, seed: null };
    case 'practice':  return { drawCount: 1, timeLimit: 0, scoring: 'standard', unlimitedUndo: true, hintsAlwaysOn: true, seed: null };
  }
}

// -- Move description (for hints / undo labeling) ---------------------
export interface MoveDesc {
  from: { type: PileType; index: number };
  to: { type: PileType; index: number };
  count: number;
}

// -- Layout constants -------------------------------------------------
export const CARD_W = 0.07;
export const CARD_H = 0.098;
export const CARD_D = 0.002;
export const COL_SPACING = 0.09;
export const CASCADE_DOWN = 0.02;
export const CASCADE_UP = 0.032;
export const STACK_Y = 0.001;
export const TABLE_Y = 0.8;
export const TABLE_Z = -1.0;
export const TOP_ROW_Z = TABLE_Z - 0.3;
export const TABLEAU_START_Z = TABLE_Z - 0.05;

// -- Themes -----------------------------------------------------------
export interface Theme {
  name: string;
  bg: string;
  floor: string;
  grid: string;
  table: string;
  accent: string;
  cardFace: string;
  cardBorder: string;
  redSuit: string;
  blackSuit: string;
}

export const THEMES: Theme[] = [
  { name: 'Neon Holodeck', bg: '#050510', floor: '#0a0a1a', grid: '#00ffff', table: '#0d1525', accent: '#00ffff', cardFace: '#0c1320', cardBorder: '#00cccc', redSuit: '#ff3355', blackSuit: '#ffffff' },
  { name: 'Solar Midnight', bg: '#100808', floor: '#1a0a0a', grid: '#ff4400', table: '#1a0d0d', accent: '#ff6600', cardFace: '#1a0f0f', cardBorder: '#cc4400', redSuit: '#ff6644', blackSuit: '#ffddcc' },
  { name: 'Matrix Green', bg: '#050f05', floor: '#0a1a0a', grid: '#00ff44', table: '#0d1a0d', accent: '#00ff44', cardFace: '#0a150a', cardBorder: '#00cc33', redSuit: '#ff4444', blackSuit: '#ccffcc' },
  { name: 'Void Purple', bg: '#0a050f', floor: '#140a1a', grid: '#8800ff', table: '#120a1a', accent: '#aa44ff', cardFace: '#0f0a15', cardBorder: '#7700cc', redSuit: '#ff44aa', blackSuit: '#ddccff' },
  { name: 'Frost Blue', bg: '#050a10', floor: '#0a1420', grid: '#4488ff', table: '#0a1222', accent: '#4488ff', cardFace: '#0a1020', cardBorder: '#3366cc', redSuit: '#ff4466', blackSuit: '#ccddff' },
  { name: 'Digital Ocean', bg: '#020f14', floor: '#041a22', grid: '#00ccaa', table: '#061820', accent: '#00ddbb', cardFace: '#071520', cardBorder: '#00aa88', redSuit: '#ff5566', blackSuit: '#bbffee' },
  { name: 'Ember Glow', bg: '#120804', floor: '#1e0e06', grid: '#ff8833', table: '#1a0e08', accent: '#ffaa44', cardFace: '#160c06', cardBorder: '#cc7722', redSuit: '#ff6633', blackSuit: '#ffe8cc' },
  { name: 'Midnight Rose', bg: '#0c040a', floor: '#18080f', grid: '#ff4488', table: '#140810', accent: '#ff6699', cardFace: '#120610', cardBorder: '#cc3366', redSuit: '#ff6699', blackSuit: '#ffccdd' },
];

// -- Card back skins --------------------------------------------------
export interface CardSkin { name: string; color: string; }
export const CARD_SKINS: CardSkin[] = [
  { name: 'Neon Cyan', color: '#00ffff' },
  { name: 'Solar Flare', color: '#ff4400' },
  { name: 'Plasma Pink', color: '#ff00ff' },
  { name: 'Frost Blue', color: '#4488ff' },
  { name: 'Toxic Green', color: '#44ff44' },
  { name: 'Royal Gold', color: '#ffcc00' },
  { name: 'Void Purple', color: '#8800ff' },
  { name: 'Inferno', color: '#ff2200' },
];

// -- Storage types ----------------------------------------------------
export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  bestScore: number;
  bestTime: number;      // seconds, 0 = none
  fewestMoves: number;   // 0 = none
  totalMoves: number;
  cardsToFoundation: number;
  winStreak: number;
  bestStreak: number;
  achievementsUnlocked: number;
  playerLevel: number;
  xp: number;
}

export interface LeaderboardEntry {
  score: number;
  moves: number;
  time: number;
  mode: string;
}

export const EMPTY_STATS: PlayerStats = {
  gamesPlayed: 0, gamesWon: 0, bestScore: 0, bestTime: 0, fewestMoves: 0,
  totalMoves: 0, cardsToFoundation: 0, winStreak: 0, bestStreak: 0,
  achievementsUnlocked: 0, playerLevel: 1, xp: 0,
};

// -- Achievement ------------------------------------------------------
export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (state: GameState, stats: PlayerStats) => boolean;
}
