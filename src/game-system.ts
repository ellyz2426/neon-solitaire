import {
  createSystem, Raycaster, Vector2, Vector3, Group,
  Mesh, Color, Object3D, Quaternion,
  GridHelper, PlaneGeometry, MeshStandardMaterial,
  AmbientLight, DirectionalLight, PointLight,
  InputComponent,
  SpriteMaterial, Sprite, CanvasTexture,
} from '@iwsdk/core';
import {
  GameState, GameMode, ModeConfig, getModeConfig, PileType,
  CARD_W, CARD_H, COL_SPACING, CASCADE_DOWN, CASCADE_UP, STACK_Y,
  TABLE_Y, TOP_ROW_Z, TABLEAU_START_Z, THEMES, CARD_SKINS,
  Card, getEfficiencyGrade,
} from './types';
import {
  deal, drawFromStock, recycleWaste, moveWasteToFoundation,
  moveWasteToTableau, moveTableauToFoundation, moveTableauToTableau,
  moveFoundationToTableau, undo, redo, canAutoComplete, autoCompleteStep,
  findHint, foundationTotal, findAllMoves,
  canMoveToFoundation, canMoveToTableau,
} from './solitaire';
import { CardMesh, createCardMesh, updateCardFace, setCardHighlight, createPilePlaceholder, clearTexCache } from './cards';
import { ACHIEVEMENTS, loadStats, saveStats, loadLeaderboard, saveLeaderboard, loadUnlocked, saveUnlocked, loadSettings, loadDailyProgress, saveDailyProgress, getTodayString, getYesterdayString, loadModeStats, saveModeStats, loadTutorialSeen, saveTutorialSeen, saveGameState, loadGameState, clearGameState } from './achievements';
import { ParticleSystem } from './particles';
import {
  sfxCardPlace, sfxCardSelect, sfxCardFlip, sfxDraw, sfxRecycle,
  sfxFoundation, sfxCombo, sfxInvalid, sfxUndo, sfxRedo, sfxHint,
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
  arc: boolean;
  arcPeak: number;
  arcProgress: number;
}

interface ScorePopup {
  mesh: Mesh;
  pos: Vector3;
  vel: Vector3;
  life: number;
  maxLife: number;
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

  // XR controller state
  xrTriggerWasDown = false;
  xrRaycaster = new Raycaster();
  xrRayOrigin = new Vector3();
  xrRayDir = new Vector3();
  xrHoveredCardId: number | null = null;

  // Card placement bounce
  bounceAnims: { mesh: Group; startTime: number; originalY: number }[] = [];

  // Per-mode stats
  modeStats: Record<string, { played: number; won: number; bestScore: number; bestTime: number }> = {};

  // Tutorial state
  tutorialShown = false;
  tutorialStep = 0;

  // Score popup system
  scorePopups: ScorePopup[] = [];

  // Auto-hint idle timer
  idleTimer = 0;
  idleHintActive = false;
  idleHintCardId = -1;

  // Auto-save timer
  autoSaveTimer = 0;

  // Resume state
  hasResumeData = false;

  // Camera shake
  cameraShakeIntensity = 0;
  cameraShakeDecay = 0;
  cameraOriginalPos = new Vector3();
  cameraShakeActive = false;

  // Grid animation
  gridTime = 0;

  // Move history (last 5 moves for display)
  moveHistory: string[] = [];
  lastMoveDesc = '';

  // Drag-and-drop state
  isDragging = false;
  dragCardIds: number[] = [];
  dragPileType: PileType = PileType.Stock;
  dragPileIndex = 0;
  dragCardIndex = 0;
  dragStartMouse = new Vector2();
  dragPlane = new Vector3(); // Y-plane intersection point
  dragOffsets: Map<number, Vector3> = new Map(); // Original offsets from drag origin
  dragThreshold = 0.008; // Min distance before drag starts
  dragPending = false; // True between mousedown and drag-start/click
  dragStartTime = 0;

  // Win cascade animation
  winCascadeCards: { mesh: Group; vel: Vector3; rotVel: Vector3; active: boolean }[] = [];
  winCascadeTimer = 0;
  winCascadeIndex = 0;
  isWinCascade = false;

  // Time bonus
  timeBonus = 0;

  init() {
    this.buildEnvironment();
    this.setupInput();
    // Initialize audio volumes
    setVolumes(this.settings.masterVol, this.settings.sfxVol, this.settings.musicVol);
    setMusicVolume(this.settings.musicVol);
    // Load per-mode stats
    this.modeStats = loadModeStats();
    // Load tutorial state
    this.tutorialShown = loadTutorialSeen();
    // Check for resume data
    this.hasResumeData = loadGameState() !== null;
    // Setup keyboard mode shortcuts
    this.setupModeShortcuts();
  }

  /** Create a floating score popup at a position */
  spawnScorePopup(text: string, position: Vector3, color: string = '#00ffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Glow
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    ctx.shadowBlur = 0;

    const tex = new CanvasTexture(canvas);
    const mat = new SpriteMaterial({ map: tex, transparent: true, opacity: 1 });
    const sprite = new Sprite(mat);
    sprite.scale.set(0.08, 0.04, 1);
    sprite.position.copy(position);
    sprite.position.y += 0.04;
    this.scene.add(sprite);

    this.scorePopups.push({
      mesh: sprite as unknown as Mesh,
      pos: sprite.position.clone(),
      vel: new Vector3(0, 0.15, 0),
      life: 1.2,
      maxLife: 1.2,
    });
  }

  /** Auto-save current game state */
  doAutoSave() {
    if (!this.gs || this.phase !== 'playing') return;
    saveGameState({
      gameState: JSON.parse(JSON.stringify({ ...this.gs, undoStack: this.gs.undoStack.slice(-5), redoStack: this.gs.redoStack.slice(-5) })),
      mode: this.mode,
      phase: this.phase,
      savedAt: Date.now(),
      settingsSnapshot: this.settings,
    });
  }

  /** Resume a saved game */
  resumeGame(): boolean {
    const data = loadGameState();
    if (!data) return false;
    this.mode = data.mode as GameMode;
    this.modeConfig = getModeConfig(this.mode);
    this.gs = data.gameState;
    this.phase = 'playing';
    this.selection = null;
    this.stalemateWarned = false;
    this.stalemateCheckTimer = 3;
    this.rebuildCardMeshes();
    this.refreshCardPositions();
    clearGameState();
    this.hasResumeData = false;
    if (!this.musicStarted) {
      this.musicStarted = true;
      startMusic();
    }
    this.showToast('Game resumed!');
    return true;
  }

  /** Setup keyboard shortcuts for mode select */
  setupModeShortcuts() {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.phase !== 'menu') return;
      const modeMap: Record<string, GameMode> = {
        '1': 'klondike1', '2': 'klondike3', '3': 'timed', '4': 'vegas',
        '5': 'daily', '6': 'speed', '7': 'zen', '8': 'practice',
      };
      const mode = modeMap[e.key];
      if (mode) {
        this.startGame(mode);
      }
    });
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
      const fPh = createPilePlaceholder(theme, true, i);
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

      // Handle drag
      if (this.dragPending && this.phase === 'playing') {
        const dx = this.mouse.x - this.dragStartMouse.x;
        const dy = this.mouse.y - this.dragStartMouse.y;
        if (Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
          this.startDrag();
        }
      }
      if (this.isDragging) {
        this.updateDrag();
      }
    });
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button === 2) return; // Right-click handled separately
      if (e.button !== 0) return;
      if (this.phase !== 'playing' && this.phase !== 'autocomplete') return;

      // Initiate potential drag
      this.dragStartMouse.copy(this.mouse);
      this.dragStartTime = performance.now();

      // Check what we clicked on
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const cardObjects: Object3D[] = [];
      this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
      const cardHits = this.raycaster.intersectObjects(cardObjects, false);

      if (cardHits.length > 0) {
        const cardId = cardHits[0].object.parent?.userData.cardId as number | undefined;
        if (cardId !== undefined) {
          const loc = this.findCard(cardId);
          if (loc && this.canDragCard(loc)) {
            // Prepare for potential drag
            this.dragPending = true;
            this.dragPileType = loc.pileType;
            this.dragPileIndex = loc.pileIndex;
            this.dragCardIndex = loc.cardIndex;

            // Build the list of card IDs to drag
            if (loc.pileType === PileType.Tableau) {
              const col = this.gs!.tableau[loc.pileIndex];
              this.dragCardIds = col.slice(loc.cardIndex).map(c => c.id);
            } else {
              this.dragCardIds = [cardId];
            }
          }
        }
      }
    });
    canvas.addEventListener('pointerup', (e: PointerEvent) => {
      if (e.button === 2) return;
      if (e.button !== 0) return;

      if (this.isDragging) {
        this.endDrag();
      } else if (this.dragPending) {
        // Didn't drag far enough -- treat as click
        this.dragPending = false;
        this.dragCardIds = [];
        if (this.phase === 'playing' || this.phase === 'autocomplete') {
          this.handleClick();
        }
      }
    });
    // Right-click auto-move to foundation
    canvas.addEventListener('contextmenu', (e: Event) => {
      e.preventDefault();
      if (this.phase !== 'playing') return;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const cardObjects: Object3D[] = [];
      this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
      const hits = this.raycaster.intersectObjects(cardObjects, false);
      if (hits.length > 0) {
        const cardId = hits[0].object.parent?.userData.cardId as number | undefined;
        if (cardId !== undefined) {
          this.autoMoveToFoundation(cardId);
        }
      }
    });
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.isDragging) { this.cancelDrag(); return; }
        if (this.phase === 'playing') this.phase = 'paused';
        else if (this.phase === 'paused') this.phase = 'playing';
      }
      if (e.key === 'z' || e.key === 'Z') { if (this.phase === 'playing') this.doUndo(); }
      if (e.key === 'y' || e.key === 'Y') { if (this.phase === 'playing') this.doRedo(); }
      if (e.key === 'h' || e.key === 'H') { if (this.phase === 'playing') this.doHint(); }
      if (e.key === 'r' || e.key === 'R') {
        if (this.phase === 'playing' || this.phase === 'gameover') this.startGame(this.mode);
      }
    });
  }

  /** Check if a card at the given location can be dragged */
  canDragCard(loc: { pileType: PileType; pileIndex: number; cardIndex: number }): boolean {
    const gs = this.gs!;
    if (loc.pileType === PileType.Waste) {
      return loc.cardIndex === gs.waste.length - 1;
    }
    if (loc.pileType === PileType.Foundation) {
      return loc.cardIndex === gs.foundations[loc.pileIndex].length - 1;
    }
    if (loc.pileType === PileType.Tableau) {
      return gs.tableau[loc.pileIndex][loc.cardIndex]?.faceUp === true;
    }
    return false;
  }

  /** Start a drag operation */
  startDrag() {
    if (!this.dragPending || this.dragCardIds.length === 0) return;
    this.dragPending = false;
    this.isDragging = true;
    this.clearSelection();

    // Compute initial world positions of dragged cards
    this.dragOffsets.clear();
    const firstCm = this.cardMeshes.get(this.dragCardIds[0]);
    if (!firstCm) { this.isDragging = false; return; }

    const origin = firstCm.group.position.clone();
    for (const id of this.dragCardIds) {
      const cm = this.cardMeshes.get(id);
      if (cm) {
        const offset = cm.group.position.clone().sub(origin);
        this.dragOffsets.set(id, offset);
        // Highlight dragged cards
        setCardHighlight(cm, true, '#ffff00');
        // Lift cards above table
        cm.group.position.y += 0.03;
      }
    }

    // Cancel any existing animations for dragged cards
    this.anims = this.anims.filter(a => {
      const cardId = a.mesh.userData.cardId;
      return !this.dragCardIds.includes(cardId);
    });

    // Highlight valid drop targets
    this.highlightDragTargets();
  }

  /** Update drag positions based on mouse */
  updateDrag() {
    if (!this.isDragging || this.dragCardIds.length === 0) return;

    // Raycast to get world position on the table plane
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const planeY = TABLE_Y + 0.03;
    const ray = this.raycaster.ray;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    if (t <= 0) return;

    const worldPos = new Vector3();
    ray.at(t, worldPos);

    // Move all dragged cards relative to worldPos
    for (const id of this.dragCardIds) {
      const cm = this.cardMeshes.get(id);
      const offset = this.dragOffsets.get(id);
      if (cm && offset) {
        cm.group.position.set(
          worldPos.x + offset.x,
          planeY + offset.y,
          worldPos.z + offset.z,
        );
      }
    }
  }

  /** End drag - try to place cards */
  endDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;

    // Find the closest valid drop target
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const phHits = this.raycaster.intersectObjects(this.pilePlaceholders, false);

    // Also check for card drops (drop on top of a tableau column)
    const cardObjects: Object3D[] = [];
    this.cardMeshes.forEach(cm => {
      if (!this.dragCardIds.includes(cm.cardId)) {
        cardObjects.push(cm.mesh);
      }
    });
    const cardHits = this.raycaster.intersectObjects(cardObjects, false);

    let dropTarget: { pileType: PileType; pileIndex: number } | null = null;

    // Check placeholder hits
    if (phHits.length > 0) {
      const ph = phHits[0].object;
      dropTarget = { pileType: ph.userData.pileType as PileType, pileIndex: ph.userData.pileIndex as number };
    }
    // Check card-on-card hits (for tableau columns with cards)
    if (!dropTarget && cardHits.length > 0) {
      const hitCardId = cardHits[0].object.parent?.userData.cardId as number | undefined;
      if (hitCardId !== undefined) {
        const loc = this.findCard(hitCardId);
        if (loc && (loc.pileType === PileType.Tableau || loc.pileType === PileType.Foundation)) {
          dropTarget = { pileType: loc.pileType, pileIndex: loc.pileIndex };
        }
      }
    }

    // Try to execute the move
    let moved = false;
    if (dropTarget) {
      const gs = this.gs!;
      if (this.dragPileType === PileType.Waste) {
        if (dropTarget.pileType === PileType.Foundation) {
          if (moveWasteToFoundation(gs, dropTarget.pileIndex)) {
            moved = true;
            sfxFoundation(gs.combo);
            const positions = this.getPilePositions();
            this.particles?.emitSparkle(positions.foundations[dropTarget.pileIndex], THEMES[this.settings.themeIndex].accent);
            const pts = 10 * Math.min(gs.combo, 10);
            this.spawnScorePopup(`+${pts}`, positions.foundations[dropTarget.pileIndex], gs.combo > 1 ? '#ffff00' : '#00ffff');
          }
        } else if (dropTarget.pileType === PileType.Tableau) {
          if (moveWasteToTableau(gs, dropTarget.pileIndex)) {
            moved = true;
            sfxCardPlace();
          }
        }
      } else if (this.dragPileType === PileType.Tableau) {
        if (dropTarget.pileType === PileType.Foundation) {
          if (moveTableauToFoundation(gs, this.dragPileIndex, dropTarget.pileIndex)) {
            moved = true;
            sfxFoundation(gs.combo);
            const positions = this.getPilePositions();
            this.particles?.emitSparkle(positions.foundations[dropTarget.pileIndex], THEMES[this.settings.themeIndex].accent);
            const pts = 10 * Math.min(gs.combo, 10);
            this.spawnScorePopup(`+${pts}`, positions.foundations[dropTarget.pileIndex], gs.combo > 1 ? '#ffff00' : '#00ffff');
            if (gs.foundations[dropTarget.pileIndex].length === 13) {
              this.particles?.emitFoundationComplete(positions.foundations[dropTarget.pileIndex]);
              this.spawnScorePopup('COMPLETE!', positions.foundations[dropTarget.pileIndex], '#00ff88');
            }
          }
        } else if (dropTarget.pileType === PileType.Tableau && dropTarget.pileIndex !== this.dragPileIndex) {
          if (moveTableauToTableau(gs, this.dragPileIndex, this.dragCardIndex, dropTarget.pileIndex)) {
            moved = true;
            sfxCardPlace();
          }
        }
      } else if (this.dragPileType === PileType.Foundation) {
        if (dropTarget.pileType === PileType.Tableau) {
          if (moveFoundationToTableau(gs, this.dragPileIndex, dropTarget.pileIndex)) {
            moved = true;
            sfxCardPlace();
          }
        }
      }

      if (moved) {
        this.checkAchievements();
        if (gs.won) this.handleWin();
        else if (canAutoComplete(gs)) { this.phase = 'autocomplete'; this.autoCompleteTimer = 0; }
      }
    }

    // Reset drag highlight
    for (const id of this.dragCardIds) {
      const cm = this.cardMeshes.get(id);
      if (cm) setCardHighlight(cm, false);
    }

    if (!moved) sfxInvalid();

    // Refresh card positions (snaps cards back or to new position)
    this.refreshCardPositions();
    this.resetPlaceholderHighlights();
    this.dragCardIds = [];
    this.dragOffsets.clear();
  }

  /** Cancel drag - return cards to original positions */
  cancelDrag() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.dragPending = false;
    for (const id of this.dragCardIds) {
      const cm = this.cardMeshes.get(id);
      if (cm) setCardHighlight(cm, false);
    }
    this.refreshCardPositions();
    this.resetPlaceholderHighlights();
    this.dragCardIds = [];
    this.dragOffsets.clear();
  }

  /** Highlight valid drop targets during drag */
  highlightDragTargets() {
    this.resetPlaceholderHighlights();
    const gs = this.gs!;
    if (this.dragCardIds.length === 0) return;

    // Get the lead card
    let card: Card | null = null;
    if (this.dragPileType === PileType.Waste && gs.waste.length > 0) {
      card = gs.waste[gs.waste.length - 1];
    } else if (this.dragPileType === PileType.Tableau) {
      const col = gs.tableau[this.dragPileIndex];
      if (this.dragCardIndex < col.length) card = col[this.dragCardIndex];
    } else if (this.dragPileType === PileType.Foundation) {
      const fPile = gs.foundations[this.dragPileIndex];
      if (fPile.length > 0) card = fPile[fPile.length - 1];
    }
    if (!card) return;

    // Highlight valid foundation targets (single card only)
    if (this.dragCardIds.length === 1 && this.dragPileType !== PileType.Foundation) {
      for (let fi = 0; fi < 4; fi++) {
        if (canMoveToFoundation(card, gs.foundations[fi])) {
          const ph = this.pilePlaceholders[fi + 2];
          const mat = ph.material as MeshStandardMaterial;
          mat.emissive.set('#00ff88');
          mat.emissiveIntensity = 0.8;
          mat.opacity = 0.9;
        }
      }
    }

    // Highlight valid tableau targets
    for (let ti = 0; ti < 7; ti++) {
      if (this.dragPileType === PileType.Tableau && this.dragPileIndex === ti) continue;
      if (canMoveToTableau(card, gs.tableau[ti])) {
        const ph = this.pilePlaceholders[ti + 6];
        const mat = ph.material as MeshStandardMaterial;
        mat.emissive.set('#00ff88');
        mat.emissiveIntensity = 0.6;
        mat.opacity = 0.8;
      }
    }
  }

  /** Right-click auto-move a card to foundation */
  autoMoveToFoundation(cardId: number) {
    const gs = this.gs!;
    const loc = this.findCard(cardId);
    if (!loc) return;

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
        if (gs.foundations[fi].length === 13) {
          this.particles?.emitFoundationComplete(positions.foundations[fi]);
        }
        this.refreshCardPositions();
        this.checkAchievements();
        if (gs.won) this.handleWin();
        else if (canAutoComplete(gs)) { this.phase = 'autocomplete'; this.autoCompleteTimer = 0; }
        return;
      }
    }
    sfxInvalid();
  }

  handleClick() {
    // Reset idle hint
    this.resetIdleHint();
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
        this.recordMove(`-> Foundation ${destIndex + 1}`);
        if (gs.combo > 1) {
          sfxCombo(gs.combo);
          const positions = this.getPilePositions();
          this.particles?.emitCombo(positions.foundations[destIndex], gs.combo);
          // Score popup with combo multiplier
          const pts = 10 * Math.min(gs.combo, 10);
          this.spawnScorePopup(`+${pts}`, positions.foundations[destIndex], '#ffff00');
          // Camera shake on big combos
          if (gs.combo >= 5) {
            this.triggerCameraShake(0.003 + (gs.combo - 5) * 0.001);
          }
        } else {
          const positions = this.getPilePositions();
          this.particles?.emitSparkle(positions.foundations[destIndex], THEMES[this.settings.themeIndex].accent, 5);
          this.spawnScorePopup('+10', positions.foundations[destIndex]);
        }
        // Check if foundation just completed
        if (gs.foundations[destIndex].length === 13) {
          const positions = this.getPilePositions();
          this.particles?.emitFoundationComplete(positions.foundations[destIndex]);
          this.spawnScorePopup('COMPLETE!', positions.foundations[destIndex], '#00ff88');
        }
      } else {
        sfxCardPlace();
        this.recordMove(`-> Tableau ${destIndex + 1}`);
        // Score popup for tableau placements
        if (gs.combo > 0) {
          const pts = 5 * Math.min(gs.combo, 10);
          const positions = this.getPilePositions();
          const dest = destType === PileType.Tableau ? positions.tableau[destIndex] : positions.foundations[destIndex];
          this.spawnScorePopup(`+${pts}`, dest, '#00ccff');
        }
      }
      this.refreshCardPositions(true);
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
    // Highlight valid destinations
    this.highlightValidTargets();
  }

  /** Highlight pile placeholders that are valid move destinations */
  highlightValidTargets() {
    // Reset all placeholders first
    this.resetPlaceholderHighlights();
    if (!this.selection || !this.gs) return;

    const sel = this.selection;
    const gs = this.gs;

    // Determine the card being moved
    let card: Card | null = null;
    if (sel.pileType === PileType.Waste && gs.waste.length > 0) {
      card = gs.waste[gs.waste.length - 1];
    } else if (sel.pileType === PileType.Tableau) {
      const col = gs.tableau[sel.pileIndex];
      if (sel.cardIndex < col.length) card = col[sel.cardIndex];
    } else if (sel.pileType === PileType.Foundation) {
      const fPile = gs.foundations[sel.pileIndex];
      if (fPile.length > 0) card = fPile[fPile.length - 1];
    }
    if (!card) return;

    const theme = THEMES[this.settings.themeIndex];

    // Check foundations
    if (sel.cardIds.length === 1) {
      for (let fi = 0; fi < 4; fi++) {
        if (canMoveToFoundation(card, gs.foundations[fi])) {
          const ph = this.pilePlaceholders[fi + 2]; // stock + waste offset
          const mat = ph.material as MeshStandardMaterial;
          mat.emissive.set('#00ff88');
          mat.emissiveIntensity = 0.8;
          mat.opacity = 0.9;
        }
      }
    }

    // Check tableau
    for (let ti = 0; ti < 7; ti++) {
      if (sel.pileType === PileType.Tableau && sel.pileIndex === ti) continue;
      if (canMoveToTableau(card, gs.tableau[ti])) {
        const ph = this.pilePlaceholders[ti + 6]; // stock + waste + 4 foundations
        const mat = ph.material as MeshStandardMaterial;
        mat.emissive.set('#00ff88');
        mat.emissiveIntensity = 0.6;
        mat.opacity = 0.8;
      }
    }
  }

  resetPlaceholderHighlights() {
    const theme = THEMES[this.settings.themeIndex];
    for (const ph of this.pilePlaceholders) {
      const mat = ph.material as MeshStandardMaterial;
      const isFoundation = ph.userData.pileType === PileType.Foundation;
      mat.emissive.set(isFoundation ? '#004444' : '#222222');
      mat.emissiveIntensity = 0.3;
      mat.opacity = 0.6;
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
    this.resetPlaceholderHighlights();
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

  refreshCardPositions(withBounce = false) {
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

  animateCard(group: Group, target: Vector3, bounce = false) {
    this.anims = this.anims.filter(a => a.mesh !== group);
    // Calculate if this is a long-distance move (use arc) vs short
    const dist = group.position.distanceTo(target);
    const useArc = dist > 0.1;
    this.anims.push({ mesh: group, targetPos: target, speed: useArc ? 6 : 8, arc: useArc, arcPeak: useArc ? 0.06 : 0, arcProgress: 0 });
    if (bounce) {
      this.bounceAnims.push({ mesh: group, startTime: performance.now(), originalY: target.y });
    }
  }

  doUndo() {
    this.resetIdleHint();
    if (this.gs && undo(this.gs)) {
      sfxUndo();
      this.clearSelection();
      this.refreshCardPositions();
    }
  }

  doRedo() {
    this.resetIdleHint();
    if (this.gs && redo(this.gs)) {
      sfxRedo();
      this.clearSelection();
      this.refreshCardPositions();
    }
  }

  doHint() {
    this.resetIdleHint();
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
    clearGameState(); // Clear autosave on win

    // Calculate time bonus: faster = more points, max 500 for under 60s
    const maxBonus = 500;
    if (gs.elapsed < 300) {
      this.timeBonus = Math.floor(maxBonus * Math.max(0, 1 - gs.elapsed / 300));
      gs.score += this.timeBonus;
    } else {
      this.timeBonus = 0;
    }

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
    // Win streak bonus XP: +10 per consecutive win
    const streakBonus = Math.min(this.stats.winStreak, 20) * 10;
    this.stats.xp += streakBonus;
    this.stats.playerLevel = Math.floor(this.stats.xp / 200) + 1;
    saveStats(this.stats);
    const lb = loadLeaderboard();
    lb.push({ score: gs.score, moves: gs.moves, time: gs.elapsed, mode: this.mode });
    lb.sort((a, b) => b.score - a.score);
    saveLeaderboard(lb.slice(0, 10));
    this.checkAchievements();

    // Daily challenge tracking
    if (this.mode === 'daily') {
      const today = getTodayString();
      const daily = loadDailyProgress();
      if (daily.lastDate !== today) {
        if (daily.lastDate === getYesterdayString()) {
          daily.streak++;
        } else {
          daily.streak = 1;
        }
        daily.lastDate = today;
        daily.totalCompleted++;
        if (gs.score > daily.bestScore) daily.bestScore = gs.score;
        saveDailyProgress(daily);
        this.showToast(`Daily streak: ${daily.streak} day${daily.streak > 1 ? 's' : ''}!`);
        // Check daily streak achievements
        if (daily.streak >= 3) { this.unlocked.add('daily_streak_3'); saveUnlocked(this.unlocked); }
        if (daily.streak >= 7) { this.unlocked.add('daily_streak_7'); saveUnlocked(this.unlocked); }
        if (daily.streak >= 30) { this.unlocked.add('daily_streak_30'); saveUnlocked(this.unlocked); }
      }
    }

    // Win celebration particles
    const center = new Vector3(0, TABLE_Y + 0.2, -1.0);
    this.particles?.emitWinCelebration(center);

    // Start card cascade win animation
    this.startWinCascade();

    // Per-mode stats
    if (!this.modeStats[this.mode]) {
      this.modeStats[this.mode] = { played: 0, won: 0, bestScore: 0, bestTime: 0 };
    }
    this.modeStats[this.mode].played++;
    this.modeStats[this.mode].won++;
    if (gs.score > this.modeStats[this.mode].bestScore) this.modeStats[this.mode].bestScore = gs.score;
    if (this.modeStats[this.mode].bestTime === 0 || gs.elapsed < this.modeStats[this.mode].bestTime) {
      this.modeStats[this.mode].bestTime = gs.elapsed;
    }
    saveModeStats(this.modeStats);
  }

  /** Start the card cascade/waterfall win animation */
  startWinCascade() {
    this.winCascadeCards = [];
    this.winCascadeTimer = 0;
    this.winCascadeIndex = 0;
    this.isWinCascade = true;
  }

  /** Update win cascade - launch cards one by one in an arc */
  updateWinCascade(delta: number) {
    if (!this.isWinCascade) return;

    // Launch new cards at intervals
    this.winCascadeTimer -= delta;
    if (this.winCascadeTimer <= 0 && this.winCascadeIndex < 52) {
      this.winCascadeTimer = 0.04;

      // Find a card mesh from foundations
      const gs = this.gs!;
      const fi = this.winCascadeIndex % 4;
      const ci = Math.floor(this.winCascadeIndex / 4);
      if (fi < gs.foundations.length && ci < gs.foundations[fi].length) {
        const card = gs.foundations[fi][ci];
        const cm = this.cardMeshes.get(card.id);
        if (cm) {
          // Launch in a random arc direction
          const angle = (this.winCascadeIndex / 52) * Math.PI * 4 + (Math.random() - 0.5) * 0.5;
          const speed = 0.8 + Math.random() * 0.5;
          const vel = new Vector3(
            Math.cos(angle) * speed,
            1.5 + Math.random() * 0.8,
            Math.sin(angle) * speed * 0.5 - 0.3,
          );
          const rotVel = new Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
          );
          this.winCascadeCards.push({ mesh: cm.group, vel, rotVel, active: true });
        }
      }
      this.winCascadeIndex++;
    }

    // Animate active cascade cards
    const gravity = -3.0;
    for (const c of this.winCascadeCards) {
      if (!c.active) continue;
      c.vel.y += gravity * delta;
      c.mesh.position.x += c.vel.x * delta;
      c.mesh.position.y += c.vel.y * delta;
      c.mesh.position.z += c.vel.z * delta;
      c.mesh.rotation.x += c.rotVel.x * delta;
      c.mesh.rotation.y += c.rotVel.y * delta;
      c.mesh.rotation.z += c.rotVel.z * delta;

      // Bounce off floor
      if (c.mesh.position.y < 0.01) {
        c.mesh.position.y = 0.01;
        c.vel.y = Math.abs(c.vel.y) * 0.5;
        c.vel.x *= 0.8;
        c.vel.z *= 0.8;
        c.rotVel.multiplyScalar(0.7);
        if (Math.abs(c.vel.y) < 0.05) {
          c.active = false;
        }
      }

      // Trail particles
      if (Math.random() > 0.7 && this.particles) {
        const hue = (this.winCascadeIndex * 7 + Math.random() * 50) % 360;
        const color = new Color().setHSL(hue / 360, 1.0, 0.6);
        this.particles.emitCardTrail(c.mesh.position.clone(), '#' + color.getHexString());
      }
    }

    // End cascade when all done
    if (this.winCascadeIndex >= 52 && this.winCascadeCards.every(c => !c.active)) {
      this.isWinCascade = false;
    }
  }

  handleLoss() {
    this.phase = 'gameover';
    const gs = this.gs!;
    sfxLoss();
    clearGameState(); // Clear autosave on loss
    this.stats.gamesPlayed++;
    this.stats.winStreak = 0;
    this.stats.totalMoves += gs.moves;
    this.stats.cardsToFoundation += foundationTotal(gs);
    saveStats(this.stats);

    // Per-mode stats
    if (!this.modeStats[this.mode]) {
      this.modeStats[this.mode] = { played: 0, won: 0, bestScore: 0, bestTime: 0 };
    }
    this.modeStats[this.mode].played++;
    saveModeStats(this.modeStats);
  }

  checkAchievements() {
    const gs = this.gs!;
    let newCount = 0;
    for (const ach of ACHIEVEMENTS) {
      if (this.unlocked.has(ach.id)) continue;
      // Special achievements that need extra context
      let unlocked = false;
      if (ach.id === 'time_bonus_100') unlocked = this.timeBonus >= 100;
      else if (ach.id === 'time_bonus_300') unlocked = this.timeBonus >= 300;
      else if (ach.id === 'time_bonus_max') unlocked = this.timeBonus >= 400;
      else if (ach.id === 'all_modes') {
        const modes = ['klondike1', 'klondike3', 'timed', 'vegas', 'daily', 'speed', 'zen', 'practice'];
        unlocked = modes.every(m => this.modeStats[m]?.won > 0);
      }
      else unlocked = ach.check(gs, this.stats);

      if (unlocked) {
        this.unlocked.add(ach.id);
        newCount++;
        this.showToast(`Achievement: ${ach.name}!`);
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

  /** Trigger camera shake effect for big combos */
  triggerCameraShake(intensity: number) {
    if (!this.cameraShakeActive) {
      this.cameraOriginalPos.copy(this.camera.position);
      this.cameraShakeActive = true;
    }
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
    this.cameraShakeDecay = 0.4; // Duration in seconds
  }

  /** Record a move description for history display */
  recordMove(desc: string) {
    this.moveHistory.push(desc);
    if (this.moveHistory.length > 5) this.moveHistory.shift();
    this.lastMoveDesc = desc;
  }

  /** Reset the idle hint when user takes action */
  resetIdleHint() {
    this.idleTimer = 0;
    if (this.idleHintActive) {
      this.idleHintActive = false;
      if (this.idleHintCardId >= 0) {
        const cm = this.cardMeshes.get(this.idleHintCardId);
        if (cm && (!this.selection || !this.selection.cardIds.includes(this.idleHintCardId))) {
          setCardHighlight(cm, false);
        }
        this.idleHintCardId = -1;
      }
    }
  }

  /** Hover detection - highlight card under cursor */
  updateHover() {
    if (this.phase !== 'playing') return;

    // Use XR ray if available, otherwise mouse
    let hits: ReturnType<Raycaster['intersectObjects']>;
    const inXR = !!(this.world as any).input?.xr?.gamepads?.right;

    if (inXR) {
      this.updateXRRay();
      const cardObjects: Object3D[] = [];
      this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
      hits = this.xrRaycaster.intersectObjects(cardObjects, false);
    } else {
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const cardObjects: Object3D[] = [];
      this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
      hits = this.raycaster.intersectObjects(cardObjects, false);
    }

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

  /** Update XR raycaster from right controller ray space */
  updateXRRay() {
    const raySpace = (this.world as any).playerSpaceEntities?.raySpaces?.right?.object3D;
    if (!raySpace) return;
    raySpace.getWorldPosition(this.xrRayOrigin);
    const forward = new Vector3(0, 0, -1);
    forward.applyQuaternion(raySpace.getWorldQuaternion(new Quaternion()));
    this.xrRayDir.copy(forward);
    this.xrRaycaster.set(this.xrRayOrigin, this.xrRayDir);
  }

  /** Handle XR controller input each frame */
  handleXRInput() {
    const right = (this.world as any).input?.xr?.gamepads?.right;
    if (!right) return;

    const triggerDown = right.getButtonDown(InputComponent.Trigger);
    const triggerPressed = right.getButtonPressed(InputComponent.Trigger);

    // Trigger press -> click
    if (triggerDown && (this.phase === 'playing' || this.phase === 'autocomplete')) {
      this.handleXRClick();
    }

    // A button -> undo
    if (right.getButtonDown(InputComponent.A_Button)) {
      if (this.phase === 'playing') this.doUndo();
    }

    // B button -> hint
    if (right.getButtonDown(InputComponent.B_Button)) {
      if (this.phase === 'playing') this.doHint();
    }

    // Thumbstick press -> pause
    const thumbDown = right.getButtonDown(InputComponent.Thumbstick);
    if (thumbDown) {
      if (this.phase === 'playing') this.phase = 'paused';
      else if (this.phase === 'paused') this.phase = 'playing';
    }
  }

  /** Handle XR trigger click - raycast from controller */
  handleXRClick() {
    this.updateXRRay();
    const cardObjects: Object3D[] = [];
    this.cardMeshes.forEach(cm => cardObjects.push(cm.mesh));
    const cardHits = this.xrRaycaster.intersectObjects(cardObjects, false);
    const phHits = this.xrRaycaster.intersectObjects(this.pilePlaceholders, false);

    if (cardHits.length > 0) {
      const cardId = cardHits[0].object.parent?.userData.cardId as number | undefined;
      if (cardId !== undefined) {
        // Double-click detection for XR
        const now = performance.now();
        if (cardId === this.lastClickCardId && now - this.lastClickTime < 500) {
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
      else {
        const step = Math.min(delta * a.speed, dist);
        a.mesh.position.add(diff.normalize().multiplyScalar(step));
        // Arc: add Y offset based on progress through the animation
        if (a.arc && a.arcPeak > 0) {
          a.arcProgress += step / (dist + step);
          const arcY = Math.sin(a.arcProgress * Math.PI) * a.arcPeak;
          a.mesh.position.y += arcY;
        }
      }
    }

    // Bounce animations (card placement feedback)
    for (let i = this.bounceAnims.length - 1; i >= 0; i--) {
      const b = this.bounceAnims[i];
      const elapsed = (performance.now() - b.startTime) / 1000;
      if (elapsed > 0.3) {
        b.mesh.position.y = b.originalY;
        this.bounceAnims.splice(i, 1);
      } else {
        const bounce = Math.sin(elapsed * Math.PI / 0.15) * 0.008 * (1 - elapsed / 0.3);
        b.mesh.position.y = b.originalY + Math.max(0, bounce);
      }
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

    // XR controller input
    this.handleXRInput();

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

    // Foundation progress glow - piles pulse brighter as they fill
    if (this.gs) {
      const positions = this.getPilePositions();
      for (let fi = 0; fi < 4; fi++) {
        const foundLen = this.gs.foundations[fi].length;
        if (foundLen > 0 && this.pilePlaceholders[fi + 2]) {
          const ph = this.pilePlaceholders[fi + 2]; // offset by stock+waste
          const mat = ph.material as MeshStandardMaterial;
          const progress = foundLen / 13;
          const pulse = 0.3 + progress * 0.6 + Math.sin(performance.now() * 0.003 + fi) * 0.1;
          mat.emissiveIntensity = pulse;
          const theme = THEMES[this.settings.themeIndex];
          mat.emissive.set(theme.accent);
          mat.opacity = 0.4 + progress * 0.4;
        }
      }
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

    // Score popup animation
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const sp = this.scorePopups[i];
      sp.life -= delta;
      if (sp.life <= 0) {
        this.scene.remove(sp.mesh);
        (sp.mesh as unknown as Sprite).material.map?.dispose();
        (sp.mesh as unknown as Sprite).material.dispose();
        this.scorePopups.splice(i, 1);
        continue;
      }
      const fade = sp.life / sp.maxLife;
      sp.mesh.position.y += sp.vel.y * delta;
      (sp.mesh as unknown as Sprite).material.opacity = fade;
      const scale = 0.08 + (1 - fade) * 0.02;
      sp.mesh.scale.set(scale, scale / 2, 1);
    }

    // Auto-hint: after 15s idle, subtly highlight a movable card
    if (this.phase === 'playing' && this.gs && this.gs.started) {
      this.idleTimer += delta;
      if (this.idleTimer > 15 && !this.idleHintActive) {
        const hint = findHint(this.gs);
        if (hint) {
          this.idleHintActive = true;
          let sourceCards: Card[] = [];
          if (hint.from.type === PileType.Waste && this.gs.waste.length > 0) {
            sourceCards = [this.gs.waste[this.gs.waste.length - 1]];
          } else if (hint.from.type === PileType.Tableau) {
            const col = this.gs.tableau[hint.from.index];
            sourceCards = col.slice(col.length - hint.count);
          }
          if (sourceCards.length > 0) {
            this.idleHintCardId = sourceCards[0].id;
            for (const c of sourceCards) {
              const cm = this.cardMeshes.get(c.id);
              if (cm) setCardHighlight(cm, true, '#00ff8855');
            }
          }
        }
      }
    }

    // Auto-save every 10 seconds during play
    if (this.phase === 'playing' && this.gs && this.gs.started) {
      this.autoSaveTimer += delta;
      if (this.autoSaveTimer >= 10) {
        this.autoSaveTimer = 0;
        this.doAutoSave();
      }
    }

    // Foundation placeholder pulse when empty (attract attention)
    if (this.gs && this.phase === 'playing') {
      for (let fi = 0; fi < 4; fi++) {
        if (this.gs.foundations[fi].length === 0 && this.pilePlaceholders[fi + 2]) {
          const ph = this.pilePlaceholders[fi + 2];
          const mat = ph.material as MeshStandardMaterial;
          const pulse = 0.2 + Math.sin(performance.now() * 0.002 + fi * 1.5) * 0.15;
          mat.emissiveIntensity = pulse;
        }
      }
    }

    // Win cascade animation
    this.updateWinCascade(delta);

    // Camera shake animation
    if (this.cameraShakeActive) {
      this.cameraShakeDecay -= delta;
      if (this.cameraShakeDecay <= 0) {
        this.camera.position.copy(this.cameraOriginalPos);
        this.cameraShakeActive = false;
        this.cameraShakeIntensity = 0;
      } else {
        const fade = this.cameraShakeDecay / 0.4;
        const shake = this.cameraShakeIntensity * fade;
        this.camera.position.set(
          this.cameraOriginalPos.x + (Math.random() - 0.5) * shake * 2,
          this.cameraOriginalPos.y + (Math.random() - 0.5) * shake,
          this.cameraOriginalPos.z + (Math.random() - 0.5) * shake,
        );
      }
    }

    // Animated grid pulsing
    this.gridTime += delta;
    this.scene.traverse(obj => {
      if (obj instanceof GridHelper) {
        const mat = obj.material as any;
        if (mat.opacity !== undefined) {
          mat.opacity = 0.06 + Math.sin(this.gridTime * 0.5) * 0.03;
        }
      }
    });
  }
}
