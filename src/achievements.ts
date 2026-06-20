import { Achievement, GameState, PlayerStats, Rank, LeaderboardEntry, EMPTY_STATS } from './types';

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_win', name: 'First Victory', desc: 'Win your first game', check: (gs) => gs.won },
  { id: 'first_move', name: 'Opening Move', desc: 'Play your first card', check: (gs) => gs.moves >= 1 },
  { id: 'ten_games', name: 'Dedicated Player', desc: 'Play 10 games', check: (_gs, st) => st.gamesPlayed >= 10 },
  { id: 'fifty_games', name: 'Card Shark', desc: 'Play 50 games', check: (_gs, st) => st.gamesPlayed >= 50 },
  { id: 'hundred_games', name: 'Solitaire Master', desc: 'Play 100 games', check: (_gs, st) => st.gamesPlayed >= 100 },
  { id: 'five_wins', name: 'On a Roll', desc: 'Win 5 games', check: (_gs, st) => st.gamesWon >= 5 },
  { id: 'twenty_wins', name: 'Champion', desc: 'Win 20 games', check: (_gs, st) => st.gamesWon >= 20 },
  { id: 'fifty_wins', name: 'Grand Master', desc: 'Win 50 games', check: (_gs, st) => st.gamesWon >= 50 },
  { id: 'win_streak_3', name: 'Hot Streak', desc: 'Win 3 games in a row', check: (_gs, st) => st.winStreak >= 3 },
  { id: 'win_streak_5', name: 'Unstoppable', desc: 'Win 5 games in a row', check: (_gs, st) => st.winStreak >= 5 },
  { id: 'win_streak_10', name: 'Legend', desc: 'Win 10 games in a row', check: (_gs, st) => st.winStreak >= 10 },
  { id: 'fast_win', name: 'Speed Demon', desc: 'Win in under 3 minutes', check: (gs) => gs.won && gs.elapsed < 180 },
  { id: 'very_fast', name: 'Lightning', desc: 'Win in under 2 minutes', check: (gs) => gs.won && gs.elapsed < 120 },
  { id: 'blitz', name: 'Blitz King', desc: 'Win in under 90 seconds', check: (gs) => gs.won && gs.elapsed < 90 },
  { id: 'score_500', name: 'High Roller', desc: 'Score over 500', check: (gs) => gs.score >= 500 },
  { id: 'score_1000', name: 'Point Master', desc: 'Score over 1000', check: (gs) => gs.score >= 1000 },
  { id: 'score_2000', name: 'Legendary Score', desc: 'Score over 2000', check: (gs) => gs.score >= 2000 },
  { id: 'combo_3', name: 'Combo Starter', desc: 'Get a 3x combo', check: (gs) => gs.bestCombo >= 3 },
  { id: 'combo_5', name: 'Combo Master', desc: 'Get a 5x combo', check: (gs) => gs.bestCombo >= 5 },
  { id: 'combo_8', name: 'Combo Legend', desc: 'Get an 8x combo', check: (gs) => gs.bestCombo >= 8 },
  { id: 'combo_10', name: 'Perfect Chain', desc: 'Get a 10x combo', check: (gs) => gs.bestCombo >= 10 },
  { id: 'few_moves', name: 'Efficient', desc: 'Win under 100 moves', check: (gs) => gs.won && gs.moves < 100 },
  { id: 'very_few', name: 'Minimalist', desc: 'Win under 80 moves', check: (gs) => gs.won && gs.moves < 80 },
  { id: 'found_one', name: 'Foundation Started', desc: 'Complete one foundation', check: (gs) => gs.foundations.some(f => f.length === 13) },
  { id: 'found_two', name: 'Half Way', desc: 'Complete two foundations', check: (gs) => gs.foundations.filter(f => f.length === 13).length >= 2 },
  { id: 'found_three', name: 'Almost There', desc: 'Complete three foundations', check: (gs) => gs.foundations.filter(f => f.length === 13).length >= 3 },
  { id: 'ace_rush', name: 'Ace Rush', desc: 'All 4 Aces to foundations in 20 moves', check: (gs) => {
    if (gs.moves > 20) return false;
    let aces = 0; for (const f of gs.foundations) { if (f.length > 0 && f[0].rank === Rank.Ace) aces++; } return aces === 4;
  }},
  { id: 'no_undo', name: 'Purist', desc: 'Win without undo', check: (gs) => gs.won && gs.undoStack.length >= gs.moves },
  { id: 'no_stock', name: 'Tableau Only', desc: 'Win with no stock recycling', check: (gs) => gs.won && gs.recycleCount === 0 },
  { id: 'clear_tableau', name: 'Clean Sweep', desc: 'Empty all tableau columns', check: (gs) => gs.tableau.every(col => col.length === 0) },
  { id: 'total_100', name: 'Card Collector', desc: '100 cards to foundations total', check: (_gs, st) => st.cardsToFoundation >= 100 },
  { id: 'total_500', name: 'Foundation Builder', desc: '500 cards to foundations total', check: (_gs, st) => st.cardsToFoundation >= 500 },
  { id: 'total_1000', name: 'Foundation Expert', desc: '1000 cards to foundations total', check: (_gs, st) => st.cardsToFoundation >= 1000 },
  { id: 'level_5', name: 'Apprentice', desc: 'Reach level 5', check: (_gs, st) => st.playerLevel >= 5 },
  { id: 'level_10', name: 'Journeyman', desc: 'Reach level 10', check: (_gs, st) => st.playerLevel >= 10 },
  { id: 'level_20', name: 'Expert', desc: 'Reach level 20', check: (_gs, st) => st.playerLevel >= 20 },
  { id: 'level_50', name: 'Grandmaster', desc: 'Reach level 50', check: (_gs, st) => st.playerLevel >= 50 },
  { id: 'best_500', name: 'Personal Best 500', desc: 'Best score over 500', check: (_gs, st) => st.bestScore >= 500 },
  { id: 'best_1000', name: 'Personal Best 1000', desc: 'Best score over 1000', check: (_gs, st) => st.bestScore >= 1000 },
  { id: 'best_time_5', name: 'Quick Thinker', desc: 'Best time under 5 min', check: (_gs, st) => st.bestTime > 0 && st.bestTime < 300 },
  // Mode-specific achievements
  { id: 'mode_klondike3', name: 'Three Card Monte', desc: 'Win in Klondike 3-draw', check: (gs) => gs.won && gs.drawCount === 3 },
  { id: 'mode_timed', name: 'Beat the Clock', desc: 'Win a timed game', check: (gs) => gs.won },
  { id: 'mode_vegas_profit', name: 'Casino Winner', desc: 'Finish Vegas with positive score', check: (gs) => gs.won && gs.score > 0 },
  { id: 'recycle_0', name: 'One Pass Wonder', desc: 'Win without recycling waste', check: (gs) => gs.won && gs.recycleCount === 0 },
  { id: 'moves_under_60', name: 'Surgical Precision', desc: 'Win in under 60 moves', check: (gs) => gs.won && gs.moves < 60 },
  { id: 'total_2000', name: 'Foundation Master', desc: '2000 cards to foundations total', check: (_gs, st) => st.cardsToFoundation >= 2000 },
  { id: 'combo_15', name: 'Combo Maniac', desc: 'Get a 15x combo', check: (gs) => gs.bestCombo >= 15 },
  { id: 'score_3000', name: 'Score Titan', desc: 'Score over 3000', check: (gs) => gs.score >= 3000 },
  { id: 'win_streak_7', name: 'Lucky Seven', desc: 'Win 7 games in a row', check: (_gs, st) => st.winStreak >= 7 },
  { id: 'level_100', name: 'Centurion', desc: 'Reach level 100', check: (_gs, st) => st.playerLevel >= 100 },
];

// -- Storage ----------------------------------------------------------
const STATS_KEY = 'neon_solitaire_stats';
const LB_KEY = 'neon_solitaire_leaderboard';
const ACH_KEY = 'neon_solitaire_achievements';
const SETTINGS_KEY = 'neon_solitaire_settings';

export function loadStats(): PlayerStats {
  try { const r = localStorage.getItem(STATS_KEY); if (r) return JSON.parse(r); } catch {}
  return { ...EMPTY_STATS };
}
export function saveStats(s: PlayerStats): void { localStorage.setItem(STATS_KEY, JSON.stringify(s)); }

export function loadLeaderboard(): LeaderboardEntry[] {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; }
}
export function saveLeaderboard(lb: LeaderboardEntry[]): void { localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 10))); }

export function loadUnlocked(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(ACH_KEY) || '[]')); } catch { return new Set(); }
}
export function saveUnlocked(s: Set<string>): void { localStorage.setItem(ACH_KEY, JSON.stringify([...s])); }

export interface GameSettings { themeIndex: number; skinIndex: number; masterVol: number; sfxVol: number; musicVol: number; }

export function loadSettings(): GameSettings {
  try { const r = localStorage.getItem(SETTINGS_KEY); if (r) return JSON.parse(r); } catch {}
  return { themeIndex: 0, skinIndex: 0, masterVol: 100, sfxVol: 100, musicVol: 100 };
}
export function saveSettings(s: GameSettings): void { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
