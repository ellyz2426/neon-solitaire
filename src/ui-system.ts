import {
  createSystem, PanelUI, PanelDocument, UIKitDocument, Follower, eq,
  Entity,
} from '@iwsdk/core';
import { GameMode, THEMES, CARD_SKINS, TABLE_Y } from './types';
import { GameSystem } from './game-system';
import { ACHIEVEMENTS, loadSettings, saveSettings, loadLeaderboard, loadStats } from './achievements';
import { foundationTotal, canAutoComplete } from './solitaire';
import { sfxMenuClick, sfxThemeChange, setVolumes } from './audio';
import { setMusicVolume } from './music';

const getDoc = (e: Entity) =>
  (e as any).getValue(PanelDocument, 'document') as UIKitDocument | undefined;

function setText(doc: UIKitDocument, id: string, text: string): void {
  const el = doc.getElementById(id);
  if (el) (el as any).setProperties({ text: String(text) });
}
function onClick(doc: UIKitDocument, id: string, fn: () => void): void {
  const el = doc.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

const HIDDEN_Y = 100;

const panelPos: Record<string, [number, number, number]> = {
  title: [0, 1.5, -1.8], modeselect: [0, 1.5, -1.8], leaderboard: [0, 1.5, -1.8],
  achievements: [0, 1.5, -1.8], stats: [0, 1.5, -1.8], skins: [0, 1.5, -1.8],
  settings: [0, 1.5, -1.8], help: [0, 1.5, -1.8], gameover: [0, 1.5, -1.8],
  pause: [0, 1.5, -1.8], countdown: [0, 1.5, -1.8],
};

export class UISystem extends createSystem({
  title: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
  modeselect: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modeselect.json')] },
  leaderboard: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
  achievements: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achvlist.json')] },
  stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  skins: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/skins.json')] },
  settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  help: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
  gameover: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
  pause: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  countdown: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/countdown.json')] },
  hud: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  toolbar: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toolbar.json')] },
  toast: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
}) {
  panels: Record<string, Entity> = {};
  activePanel = 'title';
  achievementPage = 0;
  lastPhase = '';
  lastScore = -1;
  lastMoves = -1;
  lastTime = '';
  lastToast = '';
  counter = 0;

  init() {
    const bindPanel = (name: string, query: any, setup: (entity: Entity) => void) => {
      query.subscribe('qualify', (entity: Entity) => {
        this.panels[name] = entity;
        setup(entity);
        this.syncVis();
      });
    };

    const g = (): GameSystem => (this.world as any).getSystem(GameSystem) as GameSystem;

    // TITLE
    bindPanel('title', this.queries.title, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      // Show player stats on title
      const stats = loadStats();
      setText(doc, 'level-display', `Level ${stats.playerLevel}`);
      setText(doc, 'wins-display', `${stats.gamesWon} Wins`);
      setText(doc, 'streak-display', `${stats.bestStreak} Best Streak`);
      onClick(doc, 'btn-play', () => { sfxMenuClick(); this.show('modeselect'); });
      onClick(doc, 'btn-scores', () => { sfxMenuClick(); this.refreshLB(); this.show('leaderboard'); });
      onClick(doc, 'btn-achievements', () => { sfxMenuClick(); this.refreshAch(); this.show('achievements'); });
      onClick(doc, 'btn-stats', () => { sfxMenuClick(); this.refreshStats(); this.show('stats'); });
      onClick(doc, 'btn-card-backs', () => { sfxMenuClick(); this.show('skins'); });
      onClick(doc, 'btn-settings', () => { sfxMenuClick(); this.show('settings'); });
      onClick(doc, 'btn-help', () => { sfxMenuClick(); this.show('help'); });
    });

    // MODE SELECT
    bindPanel('modeselect', this.queries.modeselect, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      const modes: [string, GameMode][] = [
        ['btn-klondike1', 'klondike1'], ['btn-klondike3', 'klondike3'],
        ['btn-timed', 'timed'], ['btn-vegas', 'vegas'],
        ['btn-daily', 'daily'], ['btn-speed', 'speed'],
        ['btn-zen', 'zen'], ['btn-practice', 'practice'],
      ];
      for (const [btn, mode] of modes) onClick(doc, btn, () => { sfxMenuClick(); g().startGame(mode); this.show('_playing'); });
      onClick(doc, 'btn-back', () => { sfxMenuClick(); this.show('title'); });
    });

    // GAMEOVER
    bindPanel('gameover', this.queries.gameover, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      onClick(doc, 'btn-rematch', () => { sfxMenuClick(); g().startGame(g().mode); this.show('_playing'); });
      onClick(doc, 'btn-menu', () => { sfxMenuClick(); g().phase = 'menu'; this.show('title'); });
    });

    // PAUSE
    bindPanel('pause', this.queries.pause, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      onClick(doc, 'btn-resume', () => { sfxMenuClick(); g().phase = 'playing'; this.show('_playing'); });
      onClick(doc, 'btn-quit', () => { sfxMenuClick(); g().handleLoss(); g().phase = 'menu'; this.show('title'); });
    });

    // TOOLBAR
    bindPanel('toolbar', this.queries.toolbar, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      onClick(doc, 'btn-undo', () => g().doUndo());
      onClick(doc, 'btn-hint', () => g().doHint());
      onClick(doc, 'btn-autocomplete', () => {
        const gs = g().gs;
        if (gs && g().phase === 'playing' && canAutoComplete(gs)) { g().phase = 'autocomplete'; g().autoCompleteTimer = 0; }
        else g().showToast('Cannot auto-complete yet');
      });
      onClick(doc, 'btn-newgame', () => { sfxMenuClick(); g().startGame(g().mode); });
    });

    // SETTINGS
    bindPanel('settings', this.queries.settings, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      const s = loadSettings();
      this.refreshSettingsUI(doc, s);
      onClick(doc, 'btn-master-up', () => { sfxMenuClick(); this.adjVol('masterVol', 10); });
      onClick(doc, 'btn-master-down', () => { sfxMenuClick(); this.adjVol('masterVol', -10); });
      onClick(doc, 'btn-sfx-up', () => { sfxMenuClick(); this.adjVol('sfxVol', 10); });
      onClick(doc, 'btn-sfx-down', () => { sfxMenuClick(); this.adjVol('sfxVol', -10); });
      onClick(doc, 'btn-music-up', () => { sfxMenuClick(); this.adjVol('musicVol', 10); });
      onClick(doc, 'btn-music-down', () => { sfxMenuClick(); this.adjVol('musicVol', -10); });
      onClick(doc, 'btn-theme-next', () => { sfxThemeChange(); this.cycleTheme(1); });
      onClick(doc, 'btn-theme-prev', () => { sfxThemeChange(); this.cycleTheme(-1); });
      onClick(doc, 'btn-back', () => { sfxMenuClick(); this.show('title'); });
    });

    // ACHIEVEMENTS
    bindPanel('achievements', this.queries.achievements, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      onClick(doc, 'btn-prev', () => { sfxMenuClick(); this.achievementPage = Math.max(0, this.achievementPage - 1); this.refreshAch(); });
      onClick(doc, 'btn-next', () => { sfxMenuClick(); this.achievementPage = Math.min(Math.ceil(ACHIEVEMENTS.length / 15) - 1, this.achievementPage + 1); this.refreshAch(); });
      onClick(doc, 'btn-back', () => { sfxMenuClick(); this.show('title'); });
    });

    // SKINS
    bindPanel('skins', this.queries.skins, (e: Entity) => {
      const doc = getDoc(e); if (!doc) return;
      for (let i = 0; i < CARD_SKINS.length; i++) {
        const idx = i;
        const handler = () => {
          sfxMenuClick();
          const gs = g();
          gs.settings.skinIndex = idx;
          saveSettings(gs.settings);
          if (gs.gs) { gs.rebuildCardMeshes(); gs.refreshCardPositions(); }
          gs.showToast(`Card back: ${CARD_SKINS[idx].name}`);
        };
        onClick(doc, `skin${i}`, handler);
        onClick(doc, `skin${i}-color`, handler);
      }
      onClick(doc, 'btn-back', () => { sfxMenuClick(); this.show('title'); });
    });

    // LEADERBOARD / STATS / HELP - just back buttons
    for (const name of ['leaderboard', 'stats', 'help'] as const) {
      bindPanel(name, (this.queries as any)[name], (e: Entity) => {
        const doc = getDoc(e); if (!doc) return;
        onClick(doc, 'btn-back', () => { sfxMenuClick(); this.show('title'); });
      });
    }

    // HUD, TOAST, COUNTDOWN - no special wiring needed
    bindPanel('hud', this.queries.hud, () => {});
    bindPanel('toast', this.queries.toast, () => {});
    bindPanel('countdown', this.queries.countdown, () => {});
  }

  show(name: string) { this.activePanel = name; this.syncVis(); }

  syncVis() {
    const gs = (this.world as any).getSystem(GameSystem) as GameSystem | undefined;
    const phase = gs?.phase || 'menu';
    const menuPanels = ['title', 'modeselect', 'leaderboard', 'achievements', 'stats', 'skins', 'settings', 'help'];

    for (const [name, entity] of Object.entries(this.panels)) {
      if (!entity || !(entity as any).object3D) continue;
      const obj = (entity as any).object3D;
      const pos = panelPos[name];

      const isFollower = name === 'hud' || name === 'toast';
      const isToolbar = name === 'toolbar';

      let visible = false;
      if (menuPanels.includes(name)) visible = phase === 'menu' && name === this.activePanel;
      if (name === 'hud') visible = ['playing', 'paused', 'gameover', 'autocomplete'].includes(phase);
      if (isToolbar) visible = phase === 'playing' || phase === 'autocomplete';
      if (name === 'toast') visible = (gs?.toastTimer ?? 0) > 0;
      if (name === 'pause') visible = phase === 'paused';
      if (name === 'gameover') visible = phase === 'gameover';
      if (name === 'countdown') visible = false;

      try {
        if (isFollower) {
          const offset = (entity as any).getVectorView(Follower, 'offsetPosition');
          if (visible) {
            if (name === 'hud') { offset[0] = 0; offset[1] = 0.22; offset[2] = -0.5; }
            else if (name === 'toast') { offset[0] = 0; offset[1] = 0.1; offset[2] = -0.5; }
          } else {
            offset[0] = 0; offset[1] = HIDDEN_Y; offset[2] = 0;
          }
        } else if (isToolbar) {
          if (visible) {
            obj.position.set(0.55, TABLE_Y + 0.05, -1.0);
            obj.scale.set(1, 1, 1);
          } else {
            obj.position.set(0, HIDDEN_Y, 0);
          }
        } else if (pos) {
          if (visible) {
            obj.position.set(pos[0], pos[1], pos[2]);
            obj.scale.set(1, 1, 1);
          } else {
            obj.position.set(0, HIDDEN_Y, 0);
          }
        }
      } catch {}
    }
  }

  adjVol(key: 'masterVol' | 'sfxVol' | 'musicVol', delta: number) {
    const gs = (this.world as any).getSystem(GameSystem) as GameSystem;
    if (!gs) return;
    gs.settings[key] = Math.max(0, Math.min(100, gs.settings[key] + delta));
    saveSettings(gs.settings);
    // Apply volume changes immediately
    setVolumes(gs.settings.masterVol, gs.settings.sfxVol, gs.settings.musicVol);
    setMusicVolume(gs.settings.musicVol);
    const e = this.panels.settings;
    if (e) { const doc = getDoc(e); if (doc) this.refreshSettingsUI(doc, gs.settings); }
  }

  cycleTheme(dir: number) {
    const gs = (this.world as any).getSystem(GameSystem) as GameSystem;
    if (!gs) return;
    gs.settings.themeIndex = (gs.settings.themeIndex + dir + THEMES.length) % THEMES.length;
    saveSettings(gs.settings);
    const e = this.panels.settings;
    if (e) { const doc = getDoc(e); if (doc) this.refreshSettingsUI(doc, gs.settings); }
    gs.showToast(`Theme: ${THEMES[gs.settings.themeIndex].name}`);
  }

  refreshSettingsUI(doc: UIKitDocument, s: ReturnType<typeof loadSettings>) {
    setText(doc, 'master-vol', String(s.masterVol));
    setText(doc, 'sfx-vol', String(s.sfxVol));
    setText(doc, 'music-vol', String(s.musicVol));
    setText(doc, 'theme-name', THEMES[s.themeIndex].name);
  }

  refreshLB() {
    const e = this.panels.leaderboard; if (!e) return;
    const doc = getDoc(e); if (!doc) return;
    const lb = loadLeaderboard();
    for (let i = 0; i < 10; i++) {
      if (i < lb.length) {
        const entry = lb[i];
        const t = `${Math.floor(entry.time / 60)}:${Math.floor(entry.time % 60).toString().padStart(2, '0')}`;
        setText(doc, `row${i}`, `${i + 1}. ${entry.score}pts ${entry.moves}mv ${t} ${entry.mode}`);
      } else setText(doc, `row${i}`, '-');
    }
  }

  refreshAch() {
    const e = this.panels.achievements; if (!e) return;
    const doc = getDoc(e); if (!doc) return;
    const gs = (this.world as any).getSystem(GameSystem) as GameSystem | undefined;
    const unlocked = gs?.unlocked || new Set<string>();
    const page = this.achievementPage; const perPage = 15; const start = page * perPage;
    setText(doc, 'count', `${unlocked.size} / ${ACHIEVEMENTS.length}`);
    setText(doc, 'page', `${page + 1}/${Math.ceil(ACHIEVEMENTS.length / perPage)}`);
    for (let i = 0; i < perPage; i++) {
      const idx = start + i;
      if (idx < ACHIEVEMENTS.length) {
        const ach = ACHIEVEMENTS[idx];
        setText(doc, `a${i}`, `${unlocked.has(ach.id) ? '[*]' : '[ ]'} ${ach.name} - ${ach.desc}`);
      } else setText(doc, `a${i}`, '-');
    }
  }

  refreshStats() {
    const e = this.panels.stats; if (!e) return;
    const doc = getDoc(e); if (!doc) return;
    const s = loadStats();
    setText(doc, 's-games', String(s.gamesPlayed));
    setText(doc, 's-wins', String(s.gamesWon));
    setText(doc, 's-winrate', s.gamesPlayed > 0 ? `${Math.round(s.gamesWon / s.gamesPlayed * 100)}%` : '0%');
    setText(doc, 's-best', String(s.bestScore));
    setText(doc, 's-time', s.bestTime > 0 ? `${Math.floor(s.bestTime / 60)}:${Math.floor(s.bestTime % 60).toString().padStart(2, '0')}` : '-');
    setText(doc, 's-moves', s.fewestMoves > 0 ? String(s.fewestMoves) : '-');
    setText(doc, 's-totalmoves', String(s.totalMoves));
    setText(doc, 's-foundation', String(s.cardsToFoundation));
    setText(doc, 's-streak', String(s.winStreak));
    setText(doc, 's-beststreak', String(s.bestStreak));
    setText(doc, 's-achievements', `${s.achievementsUnlocked}/${ACHIEVEMENTS.length}`);
    setText(doc, 's-level', String(s.playerLevel));
  }

  update(delta: number) {
    const gs = (this.world as any).getSystem(GameSystem) as GameSystem | undefined;
    if (!gs) return;
    this.counter++;

    // HUD updates
    if (this.counter % 6 === 0 && gs.gs) {
      const g = gs.gs;
      const hudE = this.panels.hud;
      if (hudE) {
        const hud = getDoc(hudE);
        if (hud) {
          if (g.score !== this.lastScore) { setText(hud, 'score', String(g.score)); this.lastScore = g.score; }
          if (g.moves !== this.lastMoves) { setText(hud, 'moves', String(g.moves)); this.lastMoves = g.moves; }
          const t = `${Math.floor(g.elapsed / 60)}:${Math.floor(g.elapsed % 60).toString().padStart(2, '0')}`;
          if (t !== this.lastTime) { setText(hud, 'time', t); this.lastTime = t; }
          setText(hud, 'mode', gs.mode);
          setText(hud, 'combo', g.combo > 1 ? `${g.combo}x combo` : '-');
          setText(hud, 'level', `Lv.${gs.stats.playerLevel}`);
          setText(hud, 'stock-count', `Stock: ${g.stock.length}`);
        }
      }
    }

    // Toast
    const toastE = this.panels.toast;
    if (toastE && gs.toastMsg && gs.toastMsg !== this.lastToast) {
      const toastDoc = getDoc(toastE);
      if (toastDoc) { setText(toastDoc, 'msg', gs.toastMsg); this.lastToast = gs.toastMsg; }
    }

    // Phase transitions
    if (gs.phase !== this.lastPhase) {
      this.lastPhase = gs.phase;
      if (gs.phase === 'menu') this.show('title');
      else if (gs.phase === 'playing' || gs.phase === 'autocomplete') this.show('_playing');
      else if (gs.phase === 'paused') this.show('pause');
      else if (gs.phase === 'gameover') { this.refreshGameOver(gs); this.show('gameover'); }
    }

    if (this.counter % 30 === 0) this.syncVis();
  }

  refreshGameOver(gs: GameSystem) {
    const e = this.panels.gameover; if (!e || !gs.gs) return;
    const doc = getDoc(e); if (!doc) return;
    const g = gs.gs;
    setText(doc, 'result-title', g.won ? 'YOU WIN!' : 'GAME OVER');
    setText(doc, 'r-mode', gs.mode);
    setText(doc, 'r-score', String(g.score));
    setText(doc, 'r-moves', String(g.moves));
    setText(doc, 'r-time', `${Math.floor(g.elapsed / 60)}:${Math.floor(g.elapsed % 60).toString().padStart(2, '0')}`);
    setText(doc, 'r-combo', String(g.bestCombo));
    setText(doc, 'r-foundations', `${foundationTotal(g)}/52`);
    setText(doc, 'r-streak', String(gs.stats.winStreak));
    const xpGained = g.won ? Math.floor(g.score / 10) + 50 : 0;
    setText(doc, 'r-xp', g.won ? `+${xpGained}` : '-');
  }
}
