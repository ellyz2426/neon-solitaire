import { Card, Suit, Rank, GameState, PileType, MoveDesc, isRed, ModeConfig } from './types';

// -- Seeded RNG -------------------------------------------------------
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// -- Deck creation & shuffle ------------------------------------------
function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (let s = 0; s < 4; s++) {
    for (let r = 0; r <= 12; r++) {
      cards.push({ suit: s as Suit, rank: r as Rank, faceUp: false, id: id++ });
    }
  }
  return cards;
}

function shuffle(cards: Card[], seed: number | null): Card[] {
  const arr = [...cards];
  const rng = seed !== null ? mulberry32(seed) : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// -- Deal -------------------------------------------------------------
export function deal(config: ModeConfig): GameState {
  const deck = shuffle(createDeck(), config.seed);
  const tableau: Card[][] = [];
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    const pile: Card[] = [];
    for (let row = 0; row <= col; row++) {
      const c = { ...deck[idx++] };
      c.faceUp = row === col;
      pile.push(c);
    }
    tableau.push(pile);
  }
  const stock = deck.slice(idx).map(c => ({ ...c, faceUp: false }));
  return {
    stock, waste: [], foundations: [[], [], [], []], tableau,
    drawCount: config.drawCount, moves: 0, score: config.scoring === 'vegas' ? -52 : 0,
    combo: 0, bestCombo: 0, elapsed: 0, lastMoveTime: 0,
    won: false, started: false, undoStack: [], redoStack: [], recycleCount: 0,
  };
}

// -- Snapshot for undo ------------------------------------------------
export function snapshot(gs: GameState): string {
  const { undoStack, redoStack, ...rest } = gs;
  return JSON.stringify(rest);
}

export function restoreSnapshot(json: string, undoStack: string[], redoStack: string[]): GameState {
  const obj = JSON.parse(json);
  obj.undoStack = undoStack;
  obj.redoStack = redoStack;
  return obj as GameState;
}

// -- Move validation --------------------------------------------------
export function canMoveToFoundation(card: Card, foundation: Card[]): boolean {
  if (foundation.length === 0) return card.rank === Rank.Ace;
  const top = foundation[foundation.length - 1];
  return card.suit === top.suit && card.rank === top.rank + 1;
}

export function canMoveToTableau(card: Card, column: Card[]): boolean {
  if (column.length === 0) return card.rank === Rank.King;
  const top = column[column.length - 1];
  if (!top.faceUp) return false;
  return isRed(card.suit) !== isRed(top.suit) && card.rank === top.rank - 1;
}

// -- Find all valid moves ---------------------------------------------
export function findAllMoves(gs: GameState): MoveDesc[] {
  const moves: MoveDesc[] = [];

  // Waste -> Foundation
  if (gs.waste.length > 0) {
    const wCard = gs.waste[gs.waste.length - 1];
    for (let fi = 0; fi < 4; fi++) {
      if (canMoveToFoundation(wCard, gs.foundations[fi])) {
        moves.push({ from: { type: PileType.Waste, index: 0 }, to: { type: PileType.Foundation, index: fi }, count: 1 });
      }
    }
  }

  // Waste -> Tableau
  if (gs.waste.length > 0) {
    const wCard = gs.waste[gs.waste.length - 1];
    for (let ti = 0; ti < 7; ti++) {
      if (canMoveToTableau(wCard, gs.tableau[ti])) {
        moves.push({ from: { type: PileType.Waste, index: 0 }, to: { type: PileType.Tableau, index: ti }, count: 1 });
      }
    }
  }

  // Tableau -> Foundation
  for (let ti = 0; ti < 7; ti++) {
    const col = gs.tableau[ti];
    if (col.length === 0) continue;
    const top = col[col.length - 1];
    if (!top.faceUp) continue;
    for (let fi = 0; fi < 4; fi++) {
      if (canMoveToFoundation(top, gs.foundations[fi])) {
        moves.push({ from: { type: PileType.Tableau, index: ti }, to: { type: PileType.Foundation, index: fi }, count: 1 });
      }
    }
  }

  // Tableau -> Tableau
  for (let fromCol = 0; fromCol < 7; fromCol++) {
    const col = gs.tableau[fromCol];
    // Find the first face-up card
    let firstUp = -1;
    for (let i = 0; i < col.length; i++) {
      if (col[i].faceUp) { firstUp = i; break; }
    }
    if (firstUp < 0) continue;

    for (let startIdx = firstUp; startIdx < col.length; startIdx++) {
      const card = col[startIdx];
      const count = col.length - startIdx;
      for (let toCol = 0; toCol < 7; toCol++) {
        if (toCol === fromCol) continue;
        if (canMoveToTableau(card, gs.tableau[toCol])) {
          // Skip moving a King from an otherwise empty column (pointless)
          if (card.rank === Rank.King && startIdx === 0 && gs.tableau[toCol].length === 0) continue;
          moves.push({ from: { type: PileType.Tableau, index: fromCol }, to: { type: PileType.Tableau, index: toCol }, count });
        }
      }
    }
  }

  // Stock -> draw
  if (gs.stock.length > 0) {
    moves.push({ from: { type: PileType.Stock, index: 0 }, to: { type: PileType.Waste, index: 0 }, count: gs.drawCount });
  } else if (gs.waste.length > 0) {
    // Recycle
    moves.push({ from: { type: PileType.Waste, index: 0 }, to: { type: PileType.Stock, index: 0 }, count: gs.waste.length });
  }

  return moves;
}

// -- Execute moves ----------------------------------------------------
export function drawFromStock(gs: GameState): { flipped: Card[] } {
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  const count = Math.min(gs.drawCount, gs.stock.length);
  const flipped: Card[] = [];
  for (let i = 0; i < count; i++) {
    const c = gs.stock.pop()!;
    c.faceUp = true;
    gs.waste.push(c);
    flipped.push(c);
  }
  gs.moves++;
  gs.started = true;
  gs.combo = 0;
  return { flipped };
}

export function recycleWaste(gs: GameState): void {
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  while (gs.waste.length > 0) {
    const c = gs.waste.pop()!;
    c.faceUp = false;
    gs.stock.push(c);
  }
  gs.recycleCount++;
  gs.moves++;
  if (gs.score > 0 && gs.drawCount === 1 && gs.recycleCount > 1) {
    // Penalty for recycling in draw-1 mode after first pass
  }
}

export function moveWasteToFoundation(gs: GameState, fi: number): { card: Card; points: number } | null {
  if (gs.waste.length === 0) return null;
  const card = gs.waste[gs.waste.length - 1];
  if (!canMoveToFoundation(card, gs.foundations[fi])) return null;
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  gs.waste.pop();
  gs.foundations[fi].push(card);
  gs.combo++;
  if (gs.combo > gs.bestCombo) gs.bestCombo = gs.combo;
  const points = 10 * Math.min(gs.combo, 10);
  gs.score += points;
  gs.moves++;
  gs.started = true;
  checkWin(gs);
  return { card, points };
}

export function moveWasteToTableau(gs: GameState, ti: number): { card: Card; points: number } | null {
  if (gs.waste.length === 0) return null;
  const card = gs.waste[gs.waste.length - 1];
  if (!canMoveToTableau(card, gs.tableau[ti])) return null;
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  gs.waste.pop();
  gs.tableau[ti].push(card);
  gs.combo++;
  if (gs.combo > gs.bestCombo) gs.bestCombo = gs.combo;
  const points = 5 * Math.min(gs.combo, 10);
  gs.score += points;
  gs.moves++;
  gs.started = true;
  return { card, points };
}

export function moveTableauToFoundation(gs: GameState, fromCol: number, fi: number): { card: Card; flipped: Card | null; points: number } | null {
  const col = gs.tableau[fromCol];
  if (col.length === 0) return null;
  const card = col[col.length - 1];
  if (!card.faceUp) return null;
  if (!canMoveToFoundation(card, gs.foundations[fi])) return null;
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  col.pop();
  gs.foundations[fi].push(card);
  let flipped: Card | null = null;
  if (col.length > 0 && !col[col.length - 1].faceUp) {
    col[col.length - 1].faceUp = true;
    flipped = col[col.length - 1];
    gs.score += 5;
  }
  gs.combo++;
  if (gs.combo > gs.bestCombo) gs.bestCombo = gs.combo;
  const points = 10 * Math.min(gs.combo, 10);
  gs.score += points;
  gs.moves++;
  gs.started = true;
  checkWin(gs);
  return { card, flipped, points };
}

export function moveTableauToTableau(gs: GameState, fromCol: number, startIdx: number, toCol: number): { cards: Card[]; flipped: Card | null; points: number } | null {
  const srcCol = gs.tableau[fromCol];
  if (startIdx < 0 || startIdx >= srcCol.length) return null;
  const card = srcCol[startIdx];
  if (!card.faceUp) return null;
  if (!canMoveToTableau(card, gs.tableau[toCol])) return null;
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  const moved = srcCol.splice(startIdx);
  gs.tableau[toCol].push(...moved);
  let flipped: Card | null = null;
  if (srcCol.length > 0 && !srcCol[srcCol.length - 1].faceUp) {
    srcCol[srcCol.length - 1].faceUp = true;
    flipped = srcCol[srcCol.length - 1];
    gs.score += 5;
  }
  gs.combo++;
  if (gs.combo > gs.bestCombo) gs.bestCombo = gs.combo;
  const points = 0; // Tableau-to-tableau gives no base points, just combo
  gs.moves++;
  gs.started = true;
  return { cards: moved, flipped, points };
}

export function moveFoundationToTableau(gs: GameState, fi: number, ti: number): { card: Card } | null {
  const found = gs.foundations[fi];
  if (found.length === 0) return null;
  const card = found[found.length - 1];
  if (!canMoveToTableau(card, gs.tableau[ti])) return null;
  gs.undoStack.push(snapshot(gs));
  gs.redoStack = [];
  found.pop();
  gs.tableau[ti].push(card);
  gs.score -= 15;
  gs.combo = 0;
  gs.moves++;
  return { card };
}

export function undo(gs: GameState): boolean {
  if (gs.undoStack.length === 0) return false;
  // Save current state to redo stack before undoing
  gs.redoStack.push(snapshot(gs));
  const prev = gs.undoStack.pop()!;
  const restored = restoreSnapshot(prev, gs.undoStack, gs.redoStack);
  Object.assign(gs, restored);
  return true;
}

export function redo(gs: GameState): boolean {
  if (gs.redoStack.length === 0) return false;
  gs.undoStack.push(snapshot(gs));
  const next = gs.redoStack.pop()!;
  const restored = restoreSnapshot(next, gs.undoStack, gs.redoStack);
  Object.assign(gs, restored);
  return true;
}

// -- Auto-complete check ----------------------------------------------
export function canAutoComplete(gs: GameState): boolean {
  if (gs.stock.length > 0 || gs.waste.length > 0) return false;
  // All tableau cards must be face up
  for (const col of gs.tableau) {
    for (const c of col) {
      if (!c.faceUp) return false;
    }
  }
  return true;
}

export function autoCompleteStep(gs: GameState): { card: Card; fromCol: number; fi: number } | null {
  for (let ti = 0; ti < 7; ti++) {
    const col = gs.tableau[ti];
    if (col.length === 0) continue;
    const card = col[col.length - 1];
    for (let fi = 0; fi < 4; fi++) {
      if (canMoveToFoundation(card, gs.foundations[fi])) {
        col.pop();
        gs.foundations[fi].push(card);
        gs.score += 10;
        gs.moves++;
        return { card, fromCol: ti, fi };
      }
    }
  }
  return null;
}

// -- Win check --------------------------------------------------------
function checkWin(gs: GameState): void {
  let total = 0;
  for (const f of gs.foundations) total += f.length;
  if (total === 52) gs.won = true;
}

export function foundationTotal(gs: GameState): number {
  let total = 0;
  for (const f of gs.foundations) total += f.length;
  return total;
}

// -- Hint -------------------------------------------------------------
export function findHint(gs: GameState): MoveDesc | null {
  const moves = findAllMoves(gs);
  // Prefer foundation moves, then tableau-to-tableau that reveals a card, then others
  const toFound = moves.filter(m => m.to.type === PileType.Foundation);
  if (toFound.length > 0) return toFound[0];
  const revealing = moves.filter(m => {
    if (m.from.type !== PileType.Tableau) return false;
    const col = gs.tableau[m.from.index];
    const startIdx = col.length - m.count;
    return startIdx > 0 && !col[startIdx - 1].faceUp;
  });
  if (revealing.length > 0) return revealing[0];
  const others = moves.filter(m => m.to.type === PileType.Tableau && m.from.type !== PileType.Stock);
  if (others.length > 0) return others[0];
  return moves[0] || null;
}

// -- Vegas scoring ----------------------------------------------------
export function vegasScore(gs: GameState): number {
  let total = -52;
  for (const f of gs.foundations) total += f.length * 5;
  return total;
}
