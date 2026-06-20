import {
  Mesh, BoxGeometry, MeshStandardMaterial, CanvasTexture, Group,
  DoubleSide, Color, type Object3D
} from '@iwsdk/core';
import {
  Card, Suit, Rank, RANK_NAMES, SUIT_SYMBOLS, isRed,
  CARD_W, CARD_H, CARD_D, Theme, CardSkin,
} from './types';

const CARD_TEX_W = 256;
const CARD_TEX_H = 358;

// ── Card face texture ────────────────────────────────────────────────
function drawCardFace(suit: Suit, rank: Rank, theme: Theme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_TEX_W; c.height = CARD_TEX_H;
  const ctx = c.getContext('2d')!;

  // Background
  ctx.fillStyle = theme.cardFace;
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = theme.cardBorder;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, c.width - 4, c.height - 4, 14);
  ctx.stroke();

  // Color
  const suitColor = isRed(suit) ? theme.redSuit : theme.blackSuit;

  // Rank + suit in top-left
  ctx.fillStyle = suitColor;
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(RANK_NAMES[rank], 16, 44);
  ctx.font = '28px monospace';
  ctx.fillText(SUIT_SYMBOLS[suit], 18, 74);

  // Center suit symbol large
  ctx.font = '80px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SUIT_SYMBOLS[suit], c.width / 2, c.height / 2);

  // Bottom-right (rotated)
  ctx.save();
  ctx.translate(c.width - 16, c.height - 12);
  ctx.rotate(Math.PI);
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(RANK_NAMES[rank], 0, 32);
  ctx.font = '28px monospace';
  ctx.fillText(SUIT_SYMBOLS[suit], 2, 62);
  ctx.restore();

  return c;
}

// ── Card back texture ────────────────────────────────────────────────
function drawCardBack(skin: CardSkin, theme: Theme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_TEX_W; c.height = CARD_TEX_H;
  const ctx = c.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = skin.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, c.width - 8, c.height - 8, 12);
  ctx.stroke();

  // Inner pattern - diamond grid
  ctx.strokeStyle = skin.color + '44';
  ctx.lineWidth = 1;
  const step = 24;
  for (let x = step; x < c.width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, c.height - 20);
    ctx.stroke();
  }
  for (let y = step; y < c.height; y += step) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(c.width - 20, y);
    ctx.stroke();
  }

  // Center symbol
  ctx.fillStyle = skin.color;
  ctx.font = 'bold 48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('*', c.width / 2, c.height / 2);

  return c;
}

// ── Texture caching ──────────────────────────────────────────────────
const faceTexCache = new Map<string, CanvasTexture>();
let backTexCache: CanvasTexture | null = null;

export function clearTexCache(): void {
  faceTexCache.forEach(t => t.dispose());
  faceTexCache.clear();
  backTexCache?.dispose();
  backTexCache = null;
}

function getFaceTex(suit: Suit, rank: Rank, theme: Theme): CanvasTexture {
  const key = `${suit}_${rank}_${theme.name}`;
  let tex = faceTexCache.get(key);
  if (!tex) {
    tex = new CanvasTexture(drawCardFace(suit, rank, theme));
    faceTexCache.set(key, tex);
  }
  return tex;
}

function getBackTex(skin: CardSkin, theme: Theme): CanvasTexture {
  if (!backTexCache) {
    backTexCache = new CanvasTexture(drawCardBack(skin, theme));
  }
  return backTexCache;
}

// ── Card mesh creation ───────────────────────────────────────────────
const cardGeo = new BoxGeometry(CARD_W, CARD_D, CARD_H);

export interface CardMesh {
  group: Group;
  mesh: Mesh;
  cardId: number;
  faceMat: MeshStandardMaterial;
  backMat: MeshStandardMaterial;
}

export function createCardMesh(card: Card, theme: Theme, skin: CardSkin): CardMesh {
  const faceTex = getFaceTex(card.suit, card.rank, theme);
  const backTex = getBackTex(skin, theme);

  const faceMat = new MeshStandardMaterial({
    map: faceTex, emissive: new Color(theme.cardBorder), emissiveIntensity: 0.08,
    side: DoubleSide, transparent: false,
  });
  const backMat = new MeshStandardMaterial({
    map: backTex, emissive: new Color(skin.color), emissiveIntensity: 0.1,
    side: DoubleSide, transparent: false,
  });

  // Card lies flat: face up means face texture visible from +Y
  // We use an array of 6 materials (one per box face)
  // Box faces: +x, -x, +y, -y, +z, -z
  const edgeMat = new MeshStandardMaterial({
    color: new Color('#111111'),
    emissive: new Color(theme.cardBorder),
    emissiveIntensity: 0.15,
  });

  const materials = [edgeMat, edgeMat, faceMat, backMat, edgeMat, edgeMat];
  const mesh = new Mesh(cardGeo, materials);

  const group = new Group();
  group.add(mesh);
  group.userData.cardId = card.id;

  return { group, mesh, cardId: card.id, faceMat, backMat };
}

export function updateCardFace(cm: CardMesh, card: Card, faceUp: boolean, theme: Theme, skin: CardSkin): void {
  const faceTex = getFaceTex(card.suit, card.rank, theme);
  const backTex = getBackTex(skin, theme);
  cm.faceMat.map = faceTex;
  cm.faceMat.needsUpdate = true;
  cm.backMat.map = backTex;
  cm.backMat.needsUpdate = true;

  if (faceUp) {
    // Face up: face on top (+Y), back on bottom (-Y) — default
    (cm.mesh.material as MeshStandardMaterial[])[2] = cm.faceMat;
    (cm.mesh.material as MeshStandardMaterial[])[3] = cm.backMat;
  } else {
    // Face down: back on top (+Y), face hidden
    (cm.mesh.material as MeshStandardMaterial[])[2] = cm.backMat;
    (cm.mesh.material as MeshStandardMaterial[])[3] = cm.faceMat;
  }
}

// ── Highlight / selection glow ───────────────────────────────────────
export function setCardHighlight(cm: CardMesh, highlight: boolean, color: string = '#ffff00'): void {
  const edgeMat = (cm.mesh.material as MeshStandardMaterial[])[0];
  if (highlight) {
    edgeMat.emissive.set(color);
    edgeMat.emissiveIntensity = 0.8;
  } else {
    edgeMat.emissive.set('#111111');
    edgeMat.emissiveIntensity = 0.15;
  }
}

// ── Empty pile placeholder ───────────────────────────────────────────
export function createPilePlaceholder(theme: Theme, isFoundation: boolean): Mesh {
  const geo = new BoxGeometry(CARD_W, 0.001, CARD_H);
  const mat = new MeshStandardMaterial({
    color: new Color(theme.table),
    emissive: new Color(isFoundation ? '#004444' : '#222222'),
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  const m = new Mesh(geo, mat);
  return m;
}
