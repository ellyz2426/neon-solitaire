import {
  createSystem, Raycaster, Vector2, Vector3, Group,
  Mesh, Color, Object3D,
  GridHelper, PlaneGeometry, MeshStandardMaterial,
  AmbientLight, DirectionalLight, PointLight,
} from '@iwsdk/core';
import {
  GameState, GameMode, ModeConfig, getModeConfig, PileType,
  CARD_W, CARD_H, COL_SPACING, CASCADE_DOWN, CASCADE_UP, STACK_Y,
  TABLE_Y, TOP_ROW_Z, TABLEAU_START_Z, THEMES, CARD_SKINS,
  Card,
} from './types';
import {
  deal, drawFromStock, recycleWaste, moveWasteToFoundation,
  moveWasteToTableau, moveTableauToFoundation, moveTableauToTableau,
  moveFoundationToTableau, undo, canAutoComplete, autoCompleteStep,
  findHint, foundationTotal, findAllMoves,
} from './solitaire';
import { CardMesh, createCardMesh, updateCardFace, setCardHighlight, createPilePlaceholder, clearTexCache } from './cards';
import { ACHIEVEMENTS, loadStats, saveStats, loadLeaderboard, saveLeaderboard, loadUnlocked, saveUnlocked, loadSettings } from './achievements';
import { ParticleSystem } from './particles';
import {
  sfxCardPlace, sfxCardSelect, sfxCardFlip, sfxDraw, sfxRecycle,
  sfxFoundation, sfxCombo, sfxInvalid, sfxUndo, sfxHint,
  sfxAutoComplete, sfxWin, sfxLoss, sfxDeal, setVolumes,
  getMusicGain, getMasterGain,
} from './audio';
import { startMusic, stopMusic, setMusicVolume, connectMusicTo } from './music';

interface Selection {
  pileType: PileType;
  pileIndex: number;
  cardIndex: number;
  cardIds: number[];
}

interface CardAnim {
  mesh: Group;
  targetPos: Vector3;
  speed: number;
}

export class GameSystem extends createSystem({}) {
  gs: GameState | null = null;
  mode: GameMode = 'klondike1';
  modeConfig: ModeConfig | null = null;
  phase: 'menu' | 'playing' | 'paused' | 'gameover' | 'autocomplete' = 'menu';
  settings = loadSettings();
  stats = loadStats();
  unlocked = loadUnlocked();

  cardMeshes = new Map<number, CardMesh>();
  cardGroup = new Group();
  pilePlaceholders: Mesh[] = [];
  tableGroup = new Group();
  envBuilt = false;

  raycaster = new Raycaster();
  mouse = new Vector2();
  selection: Selection | null = null;
  hintTimer = 0;

  anims: CardAnim[] = [];
  autoCompleteTimer = 0;
  toastTimer = 0;
  toastMsg = '';

  // New: particle system
  particles: ParticleSystem | null = null;

  // New: hover tracking
  hoveredCardId: number | null = null;

  // New: double-click tracking
  lastClickCardId = -1;
  lastClickTime = 0;

  // New: dealing animation
  dealingCards: { cardId: number; delay: number; elapsed: number; target: Vector3 }[] = [];
  isDealingAnim = false;

  // Ambient particles timer
  ambientTimer = 0;

  // Table edge meshes for animation
  tableEdges: Mesh[] = [];

  // Theme state tracking
  lastThemeIndex = -1;

  // Stalemate detection
  stalemateCheckTimer = 0;
  stalemateWarned = false;

  // Card flip animation
  flippingCards: { cardId: number; progress: number; targetFaceUp: boolean }[] = [];

  // Music started flag
  musicStarted = false;

  init() {
    this.buildEnvironment();
    this.setupInput();
    // Initialize audio volumes
    setVolumes(this.settings.masterVol, this.settings.sfxVol, this.settings.musicVol);
    setMusicVolume(this.settings.musicVol);
  }

  buildEnvironment() {
    if (this.envBuilt) return;
    const theme = THEMES[this.settings.themeIndex];

    this.scene.background = new Color(theme.bg);

    const ambient = new AmbientLight(0x334455, 0.6);
    this.scene.add(ambient);
    const dirLight = new DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(0, 4, 2);
    this.scene.add(dirLight);

    // Table
    const tableGeo = new PlaneGeometry(1.2, 0.9);
    const tableMat = new MeshStandardMaterial({
      color: new Color(theme.table), emissive: new Color(theme.accent),
      emissiveIntensity: 0.02, transparent: true, opacity: 0.8,
    });
    const tableMesh = new Mesh(tableGeo, tableMat);
    tableMesh.rotation.x = -Math.PI / 2;
    tableMesh.position.set(0, TABLE_Y - 0.005, -1.0);
    this.tableGroup.add(tableMesh);

    // Table edge glow
    const edgeGeo = new PlaneGeometry(1.22, 0.005);
    const edgeMat = new MeshStandardMaterial({
      color: new Color(theme.accent), emissive: new Color(theme.accent),
      emissiveIntensity: 0.6, transparent: true, opacity: 0.7,
    });
    const edgeNear = new Mesh(edgeGeo, edgeMat.clone());
    edgeNear.rotation.x = -Math.PI / 2;
    edgeNear.position.set(0, TABLE_Y - 0.004, -0.55);
    this.tableGroup.add(edgeNear);
    this.tableEdges.push(edgeNear);

    const edgeFar = new Mesh(edgeGeo, edgeMat.clone());
    edgeFar.rotation.x = -Math.PI / 2;
    edgeFar.position.set(0, TABLE_Y - 0.004, -1.45);
    this.tableGroup.add(edgeFar);
    this.tableEdges.push(edgeFar);

    const sideGeo = new PlaneGeometry(0.005, 0.92);
    const sideLeft = new Mesh(sideGeo, edgeMat.clone());
    sideLeft.rotation.x = -Math.PI / 2;
    sideLeft.position.set(-0.61, TABLE_Y - 0.004, -1.0);
    this.tableGroup.add(sideLeft);
    this.tableEdges.push(sideLeft);

    const sideRight = new Mesh(sideGeo, edgeMat.clone());
    sideRight.rotation.x = -Math.PI / 2;
    sideRight.position.set(0.61, TABLE_Y - 0.004, -1.0);
    this.tableGroup.add(sideRight);
    this.tableEdges.push(sideRight);

    // Grid floor
    const grid = new GridHelper(20, 40, new Color(theme.grid), new Color(theme.grid));
    const gridMat = grid.material as any;
    if (gridMat.opacity !== undefined) { gridMat.opacity = 0.08; gridMat.transparent = true; }
    grid.position.y = 0;
    this.scene.add(grid);

    // Floor plane
    const floorGeo = new PlaneGeometry(20, 20);
    const floorMat = new MeshStandardMaterial({
      color: new Color(theme.floor), emissive: new Color(theme.accent), emissiveIntensity: 0.005,
    });
    const floor = new Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.scene.add(floor);

    // Accent lights
    for (const pos of [[-0.55, TABLE_Y + 0.1, -0.55], [0.55, TABLE_Y + 0.1, -0.55],
                        [-0.55, TABLE_Y + 0.1, -1.45], [0.55, TABLE_Y + 0.1, -1.45]]) {
      const pl = new PointLight(new Color(theme.accent), 0.15, 2);
      pl.position.set(pos[0], pos[1], pos[2]);
      this.scene.add(pl);
    }

    // Particle system
    this.particles = new ParticleSystem();
    this.scene.add(this.particles.group);

    this.scene.add(this.tableGroup);
    this.scene.add(this.cardGroup);
    this.createPlaceholders();
    this.envBuilt = true;
  }

  /** Rebuild environment when theme changes */
  rebuildEnvironment() {
    const theme = THEMES[this.settings.themeIndex];
    this.scene.background = new Color(theme.bg);

    // Update grid colors
    this.scene.traverse(obj => {
      if (obj instanceof GridHelper) {
        const mat = obj.material as any;
        if (mat.color) mat.color.set(theme.grid);
      }
    });

    // Rebuild placeholders with new theme colors
    this.createPlaceholders();
    this.lastThemeIndex = this.settings.themeIndex;
  }

  createPlaceholders() {
    const theme = THEMES[this.settings.themeIndex];
    for (const p of this.pilePlaceholders) { p.parent?.remove(p); }
    this.pilePlaceholders = [];
    const positions = this.getPilePositions();

    // Stock placeholder
    const stockPh = createPilePlaceholder(theme, false);
    stockPh.position.copy(positions.stock);
    stockPh.userData.pileType = PileType.Stock;
    stockPh.userData.pileIndex = 0;
    this.tableGroup.add(stockPh);
    this.pilePlaceholders.push(stockPh);

    // Waste placeholder
    const wastePh = createPilePlaceholder(theme, false);
    wastePh.position.copy(positions.waste);
    wastePh.userData.pileType = PileType.Waste;
    wastePh.userData.pileIndex = 0;
    this.tableGroup.add(wastePh);
    this.pilePlaceholders.push(wastePh);

    // Foundations
    for (let i = 0; i < 4; i++) {
      const fPh = createPilePlaceholder(theme, true);
      fPh.position.copy(positions.foundations[i]);
      fPh.userData.pileType = PileType.Foundation;
      fPh.userData.pileIndex = i;
      this.tableGroup.add(fPh);
      this.pilePlaceholders.push(fPh);
    }

    // Tableau
    for (let i = 0; i < 7; i++) {
      const tPh = createPilePlaceholder(theme, false);
      tPh.position.copy(positions.tableau[i]);
      tPh.userData.pileType = PileType.Tableau;
      tPh.userData.pileIndex = i;
      this.tableGroup.add(tPh);
      this.pilePlaceholders.push(tPh);
    }
  }

  getPilePositions() {
    const startX = -0.27;
    return {
      stock: new Vector3(startX, TABLE_Y, TOP_ROW_Z),
      waste: new Vector3(startX + COL_SPACING, TABLE_Y, TOP_ROW_Z),
      foundations: [0, 1, 2, 3].map(i => new Vector3(startX + (i + 3) * COL_SPACING, TABLE_Y, TOP_ROW_Z)),
      tableau: [0, 1, 2, 3, 4, 5, 6].map(i => new Vector3(startX + i * COL_SPACING, TABLE_Y, TABLEAU_START_Z)),
    };
  }

  setupInput() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (this.phase !== 'playing' && this.phase !== 'autocomplete') return;
      this.handleClick();
    });
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.phase === 'playing') this.phase = 'paused';
        else if (this.phase === 'paused') this.phase = 'playing';
      }
      if (e.key === 'z' || e.key === 'Z') { if (this.phase === 'playing') this.doUndo(); }
      if (e.key === 'h' || e.key === 'H') { if (this.phase === 'playing') this.doHint(); }
      if (e.key === 'r' || e.key === 'R') {
        if (this.phase === 'playing' || this.phase === 'gameover') this.startGame(this.mode);
      }
    });
  }

  handleClick() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const cardObjects: Object3D[] = [];
    this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
    const cardHits = this.raycaster.intersectObjects(cardObjects, false);
    const phHits = this.raycaster.intersectObjects(this.pilePlaceholders, false);

    if (cardHits.length > 0) {
      const cardId = cardHits[0].object.parent?.userData.cardId as number | undefined;
      if (cardId !== undefined) {
        // Double-click detection
        const now = performance.now();
        if (cardId === this.lastClickCardId && now - this.lastClickTime < 400) {
          this.handleDoubleClick(cardId);
          this.lastClickCardId = -1;
          this.lastClickTime = 0;
          return;
        }
        this.lastClickCardId = cardId;
        this.lastClickTime = now;
        this.handleCardClick(cardId);
      }
    } else if (phHits.length > 0) {
      const ph = phHits[0].object;
      this.handlePileClick(ph.userData.pileType as PileType, ph.userData.pileIndex as number);
    } else {
      this.clearSelection();
    }
  }

  /** Double-click: auto-move single card to foundation */
  handleDoubleClick(cardId: number) {
    const gs = this.gs!;
    const loc = this.findCard(cardId);
    if (!loc) return;

    // Only for single cards (waste top, tableau top, foundation top)
    let card: Card | null = null;
    if (loc.pileType === PileType.Waste && loc.cardIndex === gs.waste.length - 1) {
      card = gs.waste[gs.waste.length - 1];
    } else if (loc.pileType === PileType.Tableau) {
      const col = gs.tableau[loc.pileIndex];
      if (loc.cardIndex === col.length - 1 && col[loc.cardIndex].faceUp) {
        card = col[loc.cardIndex];
      }
    }
    if (!card) return;

    // Try foundations first
    for (let fi = 0; fi < 4; fi++) {
      let success = false;
      if (loc.pileType === PileType.Waste) {
        if (moveWasteToFoundation(gs, fi)) success = true;
      } else if (loc.pileType === PileType.Tableau) {
        if (moveTableauToFoundation(gs, loc.pileIndex, fi)) success = true;
      }
      if (success) {
        this.clearSelection();
        sfxFoundation(gs.combo);
        const positions = this.getPilePositions();
        this.particles?.emitSparkle(positions.foundations[fi], THEMES[this.settings.themeIndex].accent);
        this.refreshCardPositions();
        this.checkAchievements();
        if (gs.won) this.handleWin();
        else if (canAutoComplete(gs)) { this.phase = 'autocomplete'; this.autoCompleteTimer = 0; }
        return;
      }
    }

    // Try tableau
    for (let ti = 0; ti < 7; ti++) {
      let success = false;
      if (loc.pileType === PileType.Waste) {
        if (moveWasteToTableau(gs, ti)) success = true;
      } else if (loc.pileType === PileType.Tableau && ti !== loc.pileIndex) {
        if (moveTableauToTableau(gs, loc.pileIndex, loc.cardIndex, ti)) success = true;
      }
      if (success) {
        this.clearSelection();
        sfxCardPlace();
        this.refreshCardPositions();
        this.checkAchievements();
        return;
      }
    }

    // No valid move - select instead
    sfxInvalid();
  }

  handleCardClick(cardId: number) {
    const gs = this.gs!;
    const loc = this.findCard(cardId);
    if (!loc) return;

    if (this.selection) {
      if (loc.pileType === PileType.Tableau || loc.pileType === PileType.Foundation) {
        this.tryMoveTo(loc.pileType, loc.pileIndex);
        return;
      }
      if (this.selection.cardIds.includes(cardId)) {
        this.tryAutoMove(this.selection);
        return;
      }
    }

    if (loc.pileType === PileType.Stock) {
      if (gs.stock.length > 0) {
        drawFromStock(gs);
        sfxDraw();
      } else if (gs.waste.length > 0) {
        recycleWaste(gs);
        sfxRecycle();
      }
      this.refreshCardPositions();
      return;
    }
    if (loc.pileType === PileType.Waste) {
      if (loc.cardIndex !== gs.waste.length - 1) return;
      sfxCardSelect();
      this.selectCards(PileType.Waste, 0, loc.cardIndex, [cardId]);
      return;
    }
    if (loc.pileType === PileType.Foundation) {
      const fPile = gs.foundations[loc.pileIndex];
      if (loc.cardIndex !== fPile.length - 1) return;
      sfxCardSelect();
      this.selectCards(PileType.Foundation, loc.pileIndex, loc.cardIndex, [cardId]);
      return;
    }
    if (loc.pileType === PileType.Tableau) {
      const col = gs.tableau[loc.pileIndex];
      if (!col[loc.cardIndex].faceUp) return;
      sfxCardSelect();
      const ids = col.slice(loc.cardIndex).map(c => c.id);
      this.selectCards(PileType.Tableau, loc.pileIndex, loc.cardIndex, ids);
    }
  }

  handlePileClick(pileType: PileType, pileIndex: number) {
    const gs = this.gs!;
    if (pileType === PileType.Stock) {
      if (gs.stock.length > 0) {
        drawFromStock(gs);
        sfxDraw();
      } else if (gs.waste.length > 0) {
        recycleWaste(gs);
        sfxRecycle();
      }
      this.refreshCardPositions();
      return;
    }
    if (this.selection) this.tryMoveTo(pileType, pileIndex);
  }

  tryMoveTo(destType: PileType, destIndex: number) {
    const gs = this.gs!;
    const sel = this.selection!;
    let success = false;
    let toFoundation = false;

    if (sel.pileType === PileType.Waste) {
      if (destType === PileType.Foundation) { success = moveWasteToFoundation(gs, destIndex) !== null; toFoundation = true; }
      else if (destType === PileType.Tableau) success = moveWasteToTableau(gs, destIndex) !== null;
    } else if (sel.pileType === PileType.Tableau) {
      if (destType === PileType.Foundation) { success = moveTableauToFoundation(gs, sel.pileIndex, destIndex) !== null; toFoundation = true; }
      else if (destType === PileType.Tableau) success = moveTableauToTableau(gs, sel.pileIndex, sel.cardIndex, destIndex) !== null;
    } else if (sel.pileType === PileType.Foundation) {
      if (destType === PileType.Tableau) success = moveFoundationToTableau(gs, sel.pileIndex, destIndex) !== null;
    }

    this.clearSelection();
    if (success) {
      if (toFoundation) {
        sfxFoundation(gs.combo);
        if (gs.combo > 1) {
          sfxCombo(gs.combo);
          const positions = this.getPilePositions();
          this.particles?.emitCombo(positions.foundations[destIndex], gs.combo);
        } else {
          const positions = this.getPilePositions();
          this.particles?.emitSparkle(positions.foundations[destIndex], THEMES[this.settings.themeIndex].accent, 5);
        }
        // Check if foundation just completed
        if (gs.foundations[destIndex].length === 13) {
          const positions = this.getPilePositions();
          this.particles?.emitFoundationComplete(positions.foundations[destIndex]);
        }
      } else {
        sfxCardPlace();
      }
      this.refreshCardPositions();
      this.checkAchievements();
      if (gs.won) this.handleWin();
      else if (canAutoComplete(gs)) { this.phase = 'autocomplete'; this.autoCompleteTimer = 0; }
    } else {
      sfxInvalid();
    }
  }

  tryAutoMove(sel: Selection) {
    const gs = this.gs!;
    let success = false;
    if (sel.cardIds.length === 1) {
      for (let fi = 0; fi < 4; fi++) {
        if (sel.pileType === PileType.Waste) { if (moveWasteToFoundation(gs, fi)) { success = true; break; } }
        else if (sel.pileType === PileType.Tableau) { if (moveTableauToFoundation(gs, sel.pileIndex, fi)) { success = true; break; } }
      }
    }
    this.clearSelection();
    if (success) {
      sfxFoundation(gs.combo);
      this.refreshCardPositions();
      this.checkAchievements();
      if (gs.won) this.handleWin();
      else if (canAutoComplete(gs)) { this.phase = 'autocomplete'; this.autoCompleteTimer = 0; }
    } else {
      sfxInvalid();
    }
  }

  selectCards(pileType: PileType, pileIndex: number, cardIndex: number, cardIds: number[]) {
    this.clearSelection();
    this.selection = { pileType, pileIndex, cardIndex, cardIds };
    for (const id of cardIds) {
      const cm = this.cardMeshes.get(id);
      if (cm) setCardHighlight(cm, true, '#ffff00');
    }
  }

  clearSelection() {
    if (this.selection) {
      for (const id of this.selection.cardIds) {
        const cm = this.cardMeshes.get(id);
        if (cm) setCardHighlight(cm, false);
      }
      this.selection = null;
    }
    this.clearHint();
  }

  findCard(cardId: number): { pileType: PileType; pileIndex: number; cardIndex: number } | null {
    const gs = this.gs!;
    for (let i = 0; i < gs.stock.length; i++) if (gs.stock[i].id === cardId) return { pileType: PileType.Stock, pileIndex: 0, cardIndex: i };
    for (let i = 0; i < gs.waste.length; i++) if (gs.waste[i].id === cardId) return { pileType: PileType.Waste, pileIndex: 0, cardIndex: i };
    for (let fi = 0; fi < 4; fi++) for (let i = 0; i < gs.foundations[fi].length; i++) if (gs.foundations[fi][i].id === cardId) return { pileType: PileType.Foundation, pileIndex: fi, cardIndex: i };
    for (let ti = 0; ti < 7; ti++) for (let i = 0; i < gs.tableau[ti].length; i++) if (gs.tableau[ti][i].id === cardId) return { pileType: PileType.Tableau, pileIndex: ti, cardIndex: i };
    return null;
  }

  startGame(mode: GameMode) {
    this.mode = mode;
    this.modeConfig = getModeConfig(mode);
    this.gs = deal(this.modeConfig);
    this.phase = 'playing';
    this.selection = null;
    this.stalemateWarned = false;
    this.stalemateCheckTimer = 3; // Wait 3 seconds before first stalemate check
    this.rebuildCardMeshes();
    this.startDealingAnimation();
    // Start ambient music on first game
    if (!this.musicStarted) {
      this.musicStarted = true;
      startMusic();
    }
  }

  /** Staggered dealing animation */
  startDealingAnimation() {
    const gs = this.gs!;
    this.dealingCards = [];
    this.isDealingAnim = true;

    // Start all cards off-screen at stock position
    const positions = this.getPilePositions();
    const stockPos = positions.stock.clone();
    stockPos.y += 0.1;
    for (const [, cm] of this.cardMeshes) {
      cm.group.position.copy(stockPos);
    }

    // Queue tableau cards with staggered delays
    let delay = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = gs.tableau[col][row];
        const target = positions.tableau[col].clone();
        target.y += row * STACK_Y;
        target.z += row * (card.faceUp ? CASCADE_UP : CASCADE_DOWN);
        this.dealingCards.push({ cardId: card.id, delay, elapsed: 0, target });
        delay += 0.04;
      }
    }

    // Queue stock cards
    for (let i = 0; i < gs.stock.length; i++) {
      const card = gs.stock[i];
      const target = positions.stock.clone();
      target.y += i * STACK_Y;
      this.dealingCards.push({ cardId: card.id, delay, elapsed: 0, target });
      delay += 0.01;
    }
  }

  rebuildCardMeshes() {
    const gs = this.gs!;
    const theme = THEMES[this.settings.themeIndex];
    const skin = CARD_SKINS[this.settings.skinIndex];
    for (const [, cm] of this.cardMeshes) { cm.group.parent?.remove(cm.group); }
    this.cardMeshes.clear();
    clearTexCache();
    const allCards = [...gs.stock, ...gs.waste, ...gs.foundations.flat(), ...gs.tableau.flat()];
    for (const card of allCards) {
      const cm = createCardMesh(card, theme, skin);
      updateCardFace(cm, card, card.faceUp, theme, skin);
      this.cardGroup.add(cm.group);
      this.cardMeshes.set(card.id, cm);
    }
  }

  refreshCardPositions() {
    const gs = this.gs!;
    const positions = this.getPilePositions();
    const theme = THEMES[this.settings.themeIndex];
    const skin = CARD_SKINS[this.settings.skinIndex];

    for (let i = 0; i < gs.stock.length; i++) {
      const card = gs.stock[i]; const cm = this.cardMeshes.get(card.id); if (!cm) continue;
      updateCardFace(cm, card, false, theme, skin);
      const t = positions.stock.clone(); t.y += i * STACK_Y;
      this.animateCard(cm.group, t);
    }
    for (let i = 0; i < gs.waste.length; i++) {
      const card = gs.waste[i]; const cm = this.cardMeshes.get(card.id); if (!cm) continue;
      updateCardFace(cm, card, true, theme, skin);
      const t = positions.waste.clone(); t.y += i * STACK_Y;
      if (i >= gs.waste.length - 3 && gs.waste.length > 1) {
        t.z += (i - (gs.waste.length - Math.min(3, gs.waste.length))) * 0.015;
      }
      this.animateCard(cm.group, t);
    }
    for (let fi = 0; fi < 4; fi++) {
      for (let i = 0; i < gs.foundations[fi].length; i++) {
        const card = gs.foundations[fi][i]; const cm = this.cardMeshes.get(card.id); if (!cm) continue;
        updateCardFace(cm, card, true, theme, skin);
        const t = positions.foundations[fi].clone(); t.y += i * STACK_Y;
        this.animateCard(cm.group, t);
      }
    }
    for (let ti = 0; ti < 7; ti++) {
      for (let i = 0; i < gs.tableau[ti].length; i++) {
        const card = gs.tableau[ti][i]; const cm = this.cardMeshes.get(card.id); if (!cm) continue;
        updateCardFace(cm, card, card.faceUp, theme, skin);
        const t = positions.tableau[ti].clone(); t.y += i * STACK_Y;
        t.z += i * (card.faceUp ? CASCADE_UP : CASCADE_DOWN);
        this.animateCard(cm.group, t);
      }
    }
  }

  animateCard(group: Group, target: Vector3) {
    this.anims = this.anims.filter(a => a.mesh !== group);
    this.anims.push({ mesh: group, targetPos: target, speed: 8 });
  }

  doUndo() {
    if (this.gs && undo(this.gs)) {
      sfxUndo();
      this.clearSelection();
      this.refreshCardPositions();
    }
  }

  doHint() {
    const gs = this.gs!;
    this.clearHint();
    const hint = findHint(gs);
    if (!hint) { this.showToast('No moves available!'); sfxInvalid(); return; }
    sfxHint();
    this.hintTimer = 2;
    let sourceCards: Card[] = [];
    if (hint.from.type === PileType.Waste && gs.waste.length > 0) sourceCards = [gs.waste[gs.waste.length - 1]];
    else if (hint.from.type === PileType.Tableau) { const col = gs.tableau[hint.from.index]; sourceCards = col.slice(col.length - hint.count); }
    for (const c of sourceCards) {
      const cm = this.cardMeshes.get(c.id);
      if (cm) {
        setCardHighlight(cm, true, '#00ff88');
        // Sparkle on hinted cards
        this.particles?.emitSparkle(cm.group.position, '#00ff88', 4);
      }
    }
  }

  clearHint() {
    if (this.hintTimer > 0) {
      this.cardMeshes.forEach(cm => {
        if (!this.selection || !this.selection.cardIds.includes(cm.cardId)) setCardHighlight(cm, false);
      });
      this.hintTimer = 0;
    }
  }

  handleWin() {
    this.phase = 'gameover';
    const gs = this.gs!;
    sfxWin();
    this.stats.gamesPlayed++;
    this.stats.gamesWon++;
    this.stats.winStreak++;
    if (this.stats.winStreak > this.stats.bestStreak) this.stats.bestStreak = this.stats.winStreak;
    this.stats.totalMoves += gs.moves;
    this.stats.cardsToFoundation += foundationTotal(gs);
    if (gs.score > this.stats.bestScore) this.stats.bestScore = gs.score;
    if (this.stats.bestTime === 0 || gs.elapsed < this.stats.bestTime) this.stats.bestTime = gs.elapsed;
    if (this.stats.fewestMoves === 0 || gs.moves < this.stats.fewestMoves) this.stats.fewestMoves = gs.moves;
    this.stats.xp += Math.floor(gs.score / 10) + 50;
    this.stats.playerLevel = Math.floor(this.stats.xp / 200) + 1;
    saveStats(this.stats);
    const lb = loadLeaderboard();
    lb.push({ score: gs.score, moves: gs.moves, time: gs.elapsed, mode: this.mode });
    lb.sort((a, b) => b.score - a.score);
    saveLeaderboard(lb.slice(0, 10));
    this.checkAchievements();

    // Win celebration particles
    const center = new Vector3(0, TABLE_Y + 0.2, -1.0);
    this.particles?.emitWinCelebration(center);
  }

  handleLoss() {
    this.phase = 'gameover';
    const gs = this.gs!;
    sfxLoss();
    this.stats.gamesPlayed++;
    this.stats.winStreak = 0;
    this.stats.totalMoves += gs.moves;
    this.stats.cardsToFoundation += foundationTotal(gs);
    saveStats(this.stats);
  }

  checkAchievements() {
    const gs = this.gs!;
    let newCount = 0;
    for (const ach of ACHIEVEMENTS) {
      if (!this.unlocked.has(ach.id) && ach.check(gs, this.stats)) {
        this.unlocked.add(ach.id);
        newCount++;
        this.showToast(`Achievement: ${ach.name}!`);
        // Achievement sparkle
        this.particles?.emitAchievement(new Vector3(0, TABLE_Y + 0.3, -1.0));
      }
    }
    if (newCount > 0) {
      this.stats.achievementsUnlocked = this.unlocked.size;
      saveStats(this.stats);
      saveUnlocked(this.unlocked);
    }
  }

  showToast(msg: string) {
    this.toastTimer = 3;
    this.toastMsg = msg;
  }

  /** Hover detection - highlight card under cursor */
  updateHover() {
    if (this.phase !== 'playing') return;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const cardObjects: Object3D[] = [];
    this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
    const hits = this.raycaster.intersectObjects(cardObjects, false);

    let newHover: number | null = null;
    if (hits.length > 0) {
      newHover = hits[0].object.parent?.userData.cardId ?? null;
    }

    if (newHover !== this.hoveredCardId) {
      // Remove old hover
      if (this.hoveredCardId !== null && (!this.selection || !this.selection.cardIds.includes(this.hoveredCardId))) {
        const cm = this.cardMeshes.get(this.hoveredCardId);
        if (cm) setCardHighlight(cm, false);
      }
      // Apply new hover
      if (newHover !== null && (!this.selection || !this.selection.cardIds.includes(newHover))) {
        const cm = this.cardMeshes.get(newHover);
        if (cm) {
          // Check if card is face up and interactable
          const loc = this.findCard(newHover);
          if (loc) {
            let interactable = false;
            if (loc.pileType === PileType.Stock) interactable = true;
            else if (loc.pileType === PileType.Waste && loc.cardIndex === (this.gs?.waste.length ?? 0) - 1) interactable = true;
            else if (loc.pileType === PileType.Foundation) {
              const fPile = this.gs?.foundations[loc.pileIndex];
              if (fPile && loc.cardIndex === fPile.length - 1) interactable = true;
            }
            else if (loc.pileType === PileType.Tableau) {
              const col = this.gs?.tableau[loc.pileIndex];
              if (col && col[loc.cardIndex]?.faceUp) interactable = true;
            }
            if (interactable) setCardHighlight(cm, true, '#00aacc');
          }
        }
      }
      this.hoveredCardId = newHover;
    }
  }

  update(delta: number) {
    // Dealing animation
    if (this.isDealingAnim && this.dealingCards.length > 0) {
      let allDone = true;
      for (const dc of this.dealingCards) {
        dc.elapsed += delta;
        if (dc.elapsed < dc.delay) { allDone = false; continue; }
        const cm = this.cardMeshes.get(dc.cardId);
        if (!cm) continue;
        const diff = dc.target.clone().sub(cm.group.position);
        const dist = diff.length();
        if (dist > 0.002) {
          allDone = false;
          cm.group.position.add(diff.normalize().multiplyScalar(Math.min(delta * 10, dist)));
        } else {
          cm.group.position.copy(dc.target);
        }
        // Play deal sound when card first starts moving
        if (dc.elapsed >= dc.delay && dc.elapsed - delta < dc.delay) {
          sfxDeal(this.dealingCards.indexOf(dc));
        }
      }
      if (allDone) {
        this.isDealingAnim = false;
        this.dealingCards = [];
      }
    }

    // Animate cards
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      const diff = a.targetPos.clone().sub(a.mesh.position);
      const dist = diff.length();
      if (dist < 0.001) { a.mesh.position.copy(a.targetPos); this.anims.splice(i, 1); }
      else { a.mesh.position.add(diff.normalize().multiplyScalar(Math.min(delta * a.speed, dist))); }
    }

    // Timer
    if (this.phase === 'playing' && this.gs?.started) {
      this.gs.elapsed += delta;
      if (this.modeConfig?.timeLimit && this.modeConfig.timeLimit > 0 && this.gs.elapsed >= this.modeConfig.timeLimit) {
        this.handleLoss();
      }
    }

    // Hint timer
    if (this.hintTimer > 0) { this.hintTimer -= delta; if (this.hintTimer <= 0) this.clearHint(); }

    // Toast timer
    if (this.toastTimer > 0) this.toastTimer -= delta;

    // Auto-complete
    if (this.phase === 'autocomplete' && this.gs) {
      this.autoCompleteTimer -= delta;
      if (this.autoCompleteTimer <= 0) {
        const result = autoCompleteStep(this.gs);
        if (result) {
          sfxAutoComplete();
          const positions = this.getPilePositions();
          this.particles?.emitSparkle(positions.foundations[result.fi], '#00ffff', 3);
          this.refreshCardPositions();
          this.autoCompleteTimer = 0.12;
          if (this.gs.won) this.handleWin();
        } else {
          this.phase = 'playing';
        }
      }
    }

    // Hover effect (check every 3 frames)
    this.updateHover();

    // Particle system update
    this.particles?.update(delta);

    // Ambient floating particles
    this.ambientTimer -= delta;
    if (this.ambientTimer <= 0 && this.particles) {
      this.ambientTimer = 0.3 + Math.random() * 0.5;
      const theme = THEMES[this.settings.themeIndex];
      const x = (Math.random() - 0.5) * 2;
      const z = -0.5 - Math.random() * 1.5;
      const pos = new Vector3(x, 0.1, z);
      const vel = new Vector3((Math.random() - 0.5) * 0.02, 0.05 + Math.random() * 0.05, (Math.random() - 0.5) * 0.02);
      this.particles.emitCardTrail(pos, theme.accent);
    }

    // Theme change detection
    if (this.settings.themeIndex !== this.lastThemeIndex && this.lastThemeIndex >= 0) {
      this.rebuildEnvironment();
      if (this.gs) { this.rebuildCardMeshes(); this.refreshCardPositions(); }
    }
    if (this.lastThemeIndex < 0) this.lastThemeIndex = this.settings.themeIndex;

    // Table edge pulse animation
    const edgePulse = 0.4 + Math.sin(performance.now() * 0.002) * 0.3;
    for (const edge of this.tableEdges) {
      const mat = edge.material as MeshStandardMaterial;
      mat.emissiveIntensity = edgePulse;
    }

    // Stalemate detection - check every few seconds
    if (this.phase === 'playing' && this.gs && this.gs.started) {
      this.stalemateCheckTimer -= delta;
      if (this.stalemateCheckTimer <= 0 && !this.stalemateWarned) {
        this.stalemateCheckTimer = 5; // Check every 5 seconds
        const moves = findAllMoves(this.gs);
        // Filter out pointless draws (stock->waste when we've been through the deck)
        const meaningful = moves.filter(m => {
          // Stock draws are always valid moves
          if (m.from.type === PileType.Stock) return true;
          // Recycle is valid unless stock+waste would just cycle
          if (m.from.type === PileType.Waste && m.to.type === PileType.Stock) return true;
          return true;
        });
        if (meaningful.length === 0) {
          this.stalemateWarned = true;
          this.showToast('No more moves! Game over.');
          // Auto-end after short delay
          setTimeout(() => {
            if (this.phase === 'playing') this.handleLoss();
          }, 2000);
        }
      }
    }

    // Card flip animation
    for (let i = this.flippingCards.length - 1; i >= 0; i--) {
      const flip = this.flippingCards[i];
      flip.progress += delta * 4; // Complete flip in ~0.25s
      const cm = this.cardMeshes.get(flip.cardId);
      if (cm) {
        // Scale X to simulate flip: 1 -> 0 -> 1
        if (flip.progress < 0.5) {
          const scale = 1 - flip.progress * 2;
          cm.group.scale.set(Math.max(0.01, scale), 1, 1);
        } else {
          const scale = (flip.progress - 0.5) * 2;
          cm.group.scale.set(Math.min(1, scale), 1, 1);
        }
      }
      if (flip.progress >= 1) {
        if (cm) cm.group.scale.set(1, 1, 1);
        this.flippingCards.splice(i, 1);
      }
    }
  }
}
