import {
  Mesh, BoxGeometry, MeshStandardMaterial, CanvasTexture, Group,
  DoubleSide, Color, type Object3D,
  SpriteMaterial, Sprite,
} from '@iwsdk/core';
import {
  Card, Suit, Rank, RANK_NAMES, SUIT_SYMBOLS, isRed,
  CARD_W, CARD_H, CARD_D, Theme, CardSkin,
} from './types';

const CARD_TEX_W = 256;
const CARD_TEX_H = 358;

// -- Card face texture ------------------------------------------------
/** Pip layout positions for each rank (normalized 0-1 within card area) */
const PIP_LAYOUTS: Record<number, [number, number][]> = {
  0: [[0.5, 0.5]], // Ace: one large center
  1: [[0.5, 0.28], [0.5, 0.72]], // 2
  2: [[0.5, 0.22], [0.5, 0.5], [0.5, 0.78]], // 3
  3: [[0.32, 0.22], [0.68, 0.22], [0.32, 0.78], [0.68, 0.78]], // 4
  4: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.5], [0.32, 0.78], [0.68, 0.78]], // 5
  5: [[0.32, 0.22], [0.68, 0.22], [0.32, 0.5], [0.68, 0.5], [0.32, 0.78], [0.68, 0.78]], // 6
  6: [[0.32, 0.22], [0.68, 0.22], [0.5, 0.35], [0.32, 0.5], [0.68, 0.5], [0.32, 0.78], [0.68, 0.78]], // 7
  7: [[0.32, 0.2], [0.68, 0.2], [0.5, 0.32], [0.32, 0.44], [0.68, 0.44], [0.5, 0.58], [0.32, 0.76], [0.68, 0.76]], // 8
  8: [[0.32, 0.18], [0.68, 0.18], [0.32, 0.38], [0.68, 0.38], [0.5, 0.5], [0.32, 0.62], [0.68, 0.62], [0.32, 0.82], [0.68, 0.82]], // 9
  9: [[0.32, 0.18], [0.68, 0.18], [0.5, 0.28], [0.32, 0.38], [0.68, 0.38], [0.32, 0.62], [0.68, 0.62], [0.5, 0.72], [0.32, 0.82], [0.68, 0.82]], // 10
};

function drawCardFace(suit: Suit, rank: Rank, theme: Theme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_TEX_W; c.height = CARD_TEX_H;
  const ctx = c.getContext('2d')!;

  // Background with subtle gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, c.height);
  bgGrad.addColorStop(0, theme.cardFace);
  const bgColor = new Color(theme.cardFace);
  bgGrad.addColorStop(1, `rgb(${Math.max(0, bgColor.r * 255 - 8)},${Math.max(0, bgColor.g * 255 - 8)},${Math.max(0, bgColor.b * 255 - 8)})`);
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 16);
  ctx.fill();

  // Border with glow
  ctx.shadowColor = theme.cardBorder;
  ctx.shadowBlur = 4;
  ctx.strokeStyle = theme.cardBorder;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(2, 2, c.width - 4, c.height - 4, 14);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner subtle border
  ctx.strokeStyle = theme.cardBorder + '33';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(8, 8, c.width - 16, c.height - 16, 10);
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

  // Center area for pips or face card decoration
  const pipLayout = PIP_LAYOUTS[rank];
  if (pipLayout && rank <= Rank.Ten) {
    // Number cards: draw pip layout
    const areaX = 30; const areaW = c.width - 60;
    const areaY = 85; const areaH = c.height - 170;
    const pipSize = rank === Rank.Ace ? 50 : 26;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const [px, py] of pipLayout) {
      const x = areaX + px * areaW;
      const y = areaY + py * areaH;
      // Pips in the bottom half are drawn upside down (traditional layout)
      ctx.save();
      if (py > 0.55 && rank !== Rank.Ace) {
        ctx.translate(x, y);
        ctx.rotate(Math.PI);
        ctx.translate(-x, -y);
      }
      ctx.shadowColor = suitColor;
      ctx.shadowBlur = rank === Rank.Ace ? 16 : 4;
      ctx.font = `${pipSize}px monospace`;
      ctx.fillStyle = suitColor;
      ctx.fillText(SUIT_SYMBOLS[suit], x, y);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  } else {
    // Face cards (J/Q/K) -- large center suit symbol with glow + decoration
    ctx.shadowColor = suitColor;
    ctx.shadowBlur = 12;
    ctx.font = '80px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = suitColor;
    ctx.fillText(SUIT_SYMBOLS[suit], c.width / 2, c.height / 2);
    ctx.shadowBlur = 0;

    // Face card crown decoration
    ctx.fillStyle = suitColor + '44';
    ctx.font = '14px monospace';
    const label = rank === Rank.Jack ? 'JACK' : rank === Rank.Queen ? 'QUEEN' : 'KING';
    ctx.fillText(label, c.width / 2, c.height / 2 + 52);
    // Decorative corners for face cards
    ctx.strokeStyle = suitColor + '55';
    ctx.lineWidth = 1;
    const cornerR = 6;
    for (const [cx2, cy2] of [[40, 100], [c.width - 40, 100], [40, c.height - 100], [c.width - 40, c.height - 100]]) {
      ctx.beginPath();
      ctx.arc(cx2, cy2, cornerR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crown/decorative lines for face cards
    ctx.strokeStyle = suitColor + '33';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(c.width * 0.25, c.height * 0.28);
    ctx.lineTo(c.width * 0.75, c.height * 0.28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.width * 0.25, c.height * 0.72);
    ctx.lineTo(c.width * 0.75, c.height * 0.72);
    ctx.stroke();
  }

  // Bottom-right (rotated)
  ctx.save();
  ctx.translate(c.width - 16, c.height - 12);
  ctx.rotate(Math.PI);
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = suitColor;
  ctx.fillText(RANK_NAMES[rank], 0, 32);
  ctx.font = '28px monospace';
  ctx.fillText(SUIT_SYMBOLS[suit], 2, 62);
  ctx.restore();

  return c;
}

// -- Card back texture ------------------------------------------------
function drawCardBack(skin: CardSkin, theme: Theme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CARD_TEX_W; c.height = CARD_TEX_H;
  const ctx = c.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, 16);
  ctx.fill();

  // Outer border
  ctx.strokeStyle = skin.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, c.width - 8, c.height - 8, 12);
  ctx.stroke();

  // Inner border
  ctx.strokeStyle = skin.color + '66';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(14, 14, c.width - 28, c.height - 28, 8);
  ctx.stroke();

  // Diamond pattern background
  ctx.strokeStyle = skin.color + '22';
  ctx.lineWidth = 0.5;
  const step = 20;
  for (let x = 20; x < c.width - 20; x += step) {
    for (let y = 20; y < c.height - 20; y += step) {
      ctx.beginPath();
      ctx.moveTo(x, y - step / 2);
      ctx.lineTo(x + step / 2, y);
      ctx.lineTo(x, y + step / 2);
      ctx.lineTo(x - step / 2, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Radial glow in center
  const grad = ctx.createRadialGradient(c.width / 2, c.height / 2, 0, c.width / 2, c.height / 2, 80);
  grad.addColorStop(0, skin.color + '30');
  grad.addColorStop(1, skin.color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(20, 20, c.width - 40, c.height - 40);

  // Center diamond emblem
  ctx.fillStyle = skin.color;
  ctx.globalAlpha = 0.8;
  const cx = c.width / 2;
  const cy = c.height / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 30);
  ctx.lineTo(cx + 20, cy);
  ctx.lineTo(cx, cy + 30);
  ctx.lineTo(cx - 20, cy);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Inner diamond
  ctx.fillStyle = '#0a0a1a';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 15);
  ctx.lineTo(cx + 10, cy);
  ctx.lineTo(cx, cy + 15);
  ctx.lineTo(cx - 10, cy);
  ctx.closePath();
  ctx.fill();

  // Corner accents
  ctx.fillStyle = skin.color + '88';
  const cornerSize = 6;
  for (const [ox, oy] of [[24, 24], [c.width - 24, 24], [24, c.height - 24], [c.width - 24, c.height - 24]]) {
    ctx.beginPath();
    ctx.moveTo(ox, oy - cornerSize);
    ctx.lineTo(ox + cornerSize, oy);
    ctx.lineTo(ox, oy + cornerSize);
    ctx.lineTo(ox - cornerSize, oy);
    ctx.closePath();
    ctx.fill();
  }

  return c;
}

// -- Texture caching --------------------------------------------------
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

// -- Card mesh creation -----------------------------------------------
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
    // Face up: face on top (+Y), back on bottom (-Y) - default
    (cm.mesh.material as MeshStandardMaterial[])[2] = cm.faceMat;
    (cm.mesh.material as MeshStandardMaterial[])[3] = cm.backMat;
  } else {
    // Face down: back on top (+Y), face hidden
    (cm.mesh.material as MeshStandardMaterial[])[2] = cm.backMat;
    (cm.mesh.material as MeshStandardMaterial[])[3] = cm.faceMat;
  }
}

// -- Highlight / selection glow ---------------------------------------
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

// -- Empty pile placeholder -------------------------------------------
export function createPilePlaceholder(theme: Theme, isFoundation: boolean, suitIndex?: number): Mesh {
  const geo = new BoxGeometry(CARD_W, 0.001, CARD_H);
  const mat = new MeshStandardMaterial({
    color: new Color(theme.table),
    emissive: new Color(isFoundation ? '#004444' : '#222222'),
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.6,
  });
  const m = new Mesh(geo, mat);

  // Add suit symbol texture to foundation placeholders
  if (isFoundation && suitIndex !== undefined && suitIndex >= 0 && suitIndex < 4) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    const symbols = ['\u2663', '\u2666', '\u2665', '\u2660'];
    const colors = [theme.blackSuit + '44', theme.redSuit + '44', theme.redSuit + '44', theme.blackSuit + '44'];
    ctx.font = '36px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors[suitIndex];
    ctx.fillText(symbols[suitIndex], 32, 32);

    const tex = new CanvasTexture(canvas);
    const labelMat = new SpriteMaterial({ map: tex, transparent: true, opacity: 0.5 });
    const label = new Sprite(labelMat);
    label.scale.set(0.03, 0.03, 1);
    label.position.set(0, 0.005, 0);
    label.rotation.x = -Math.PI / 2;
    m.add(label);
  }

  return m;
}
