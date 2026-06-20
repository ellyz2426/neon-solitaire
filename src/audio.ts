// -- Procedural Audio System ------------------------------------------
// All sounds are synthesized - no external audio files needed.

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicGain: GainNode | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    sfxGain = audioCtx.createGain();
    sfxGain.connect(masterGain);
    musicGain = audioCtx.createGain();
    musicGain.connect(masterGain);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function setVolumes(master: number, sfx: number, music: number): void {
  const m = master / 100;
  if (masterGain) masterGain.gain.value = m;
  if (sfxGain) sfxGain.gain.value = (sfx / 100);
  if (musicGain) musicGain.gain.value = (music / 100);
}

// -- Sound effects ----------------------------------------------------

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.15, detune = 0): void {
  const ctx = getCtx();
  if (!sfxGain) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(sfxGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

function playNoise(duration: number, volume = 0.05): void {
  const ctx = getCtx();
  if (!sfxGain) return;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  // High-pass filter for card-shuffle sound
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  source.start();
}

/** Card placed on pile - soft thud + click */
export function sfxCardPlace(): void {
  playTone(120, 0.08, 'sine', 0.12);
  playNoise(0.04, 0.03);
}

/** Card picked up / selected */
export function sfxCardSelect(): void {
  playTone(440, 0.06, 'sine', 0.08);
  playTone(660, 0.04, 'sine', 0.05);
}

/** Card flipped over */
export function sfxCardFlip(): void {
  playNoise(0.06, 0.04);
  playTone(800, 0.05, 'sine', 0.06);
}

/** Draw from stock */
export function sfxDraw(): void {
  playNoise(0.05, 0.03);
  playTone(330, 0.08, 'triangle', 0.08);
}

/** Recycle waste pile */
export function sfxRecycle(): void {
  playNoise(0.12, 0.04);
  playTone(220, 0.15, 'sine', 0.08);
  setTimeout(() => playTone(330, 0.1, 'sine', 0.06), 60);
}

/** Card moved to foundation - ascending tone */
export function sfxFoundation(combo: number): void {
  const baseFreq = 440 + combo * 40;
  playTone(baseFreq, 0.15, 'sine', 0.12);
  setTimeout(() => playTone(baseFreq * 1.5, 0.12, 'sine', 0.08), 50);
}

/** Combo notification - bright ascending arpeggio */
export function sfxCombo(level: number): void {
  const base = 400 + level * 50;
  for (let i = 0; i < Math.min(level, 5); i++) {
    setTimeout(() => playTone(base + i * 80, 0.1, 'triangle', 0.06), i * 40);
  }
}

/** Invalid move - low buzz */
export function sfxInvalid(): void {
  playTone(150, 0.12, 'sawtooth', 0.06);
}

/** Undo */
export function sfxUndo(): void {
  playTone(440, 0.06, 'sine', 0.06);
  setTimeout(() => playTone(330, 0.08, 'sine', 0.06), 40);
}

/** Hint shown */
export function sfxHint(): void {
  playTone(660, 0.08, 'sine', 0.06);
  setTimeout(() => playTone(880, 0.06, 'sine', 0.04), 60);
}

/** Auto-complete step */
export function sfxAutoComplete(): void {
  playTone(660 + Math.random() * 200, 0.06, 'sine', 0.06);
}

/** Win fanfare - major chord arpeggio */
export function sfxWin(): void {
  const notes = [523, 659, 784, 1047, 1319, 1568]; // C5 major arpeggio
  for (let i = 0; i < notes.length; i++) {
    setTimeout(() => {
      playTone(notes[i], 0.4 - i * 0.03, 'sine', 0.1 - i * 0.01);
      playTone(notes[i], 0.4 - i * 0.03, 'triangle', 0.05);
    }, i * 120);
  }
  // Final sustained chord
  setTimeout(() => {
    playTone(523, 0.8, 'sine', 0.08);
    playTone(659, 0.8, 'sine', 0.06);
    playTone(784, 0.8, 'sine', 0.06);
    playTone(1047, 0.8, 'sine', 0.04);
  }, 750);
}

/** Loss - descending minor */
export function sfxLoss(): void {
  const notes = [440, 415, 392, 330];
  for (let i = 0; i < notes.length; i++) {
    setTimeout(() => playTone(notes[i], 0.25, 'sine', 0.08 - i * 0.01), i * 150);
  }
}

/** Menu click */
export function sfxMenuClick(): void {
  playTone(550, 0.05, 'sine', 0.08);
}

/** Toast notification */
export function sfxToast(): void {
  playTone(880, 0.04, 'sine', 0.06);
  setTimeout(() => playTone(1100, 0.06, 'sine', 0.04), 30);
}

/** Theme change */
export function sfxThemeChange(): void {
  playTone(440, 0.08, 'triangle', 0.06);
  setTimeout(() => playTone(660, 0.06, 'triangle', 0.05), 60);
  setTimeout(() => playTone(880, 0.06, 'triangle', 0.04), 120);
}

/** Redo sound */
export function sfxRedo(): void {
  playTone(330, 0.06, 'sine', 0.06);
  setTimeout(() => playTone(440, 0.08, 'sine', 0.06), 40);
}

/** Game start dealing */
export function sfxDeal(index: number): void {
  playNoise(0.03, 0.02);
  playTone(300 + index * 15, 0.04, 'sine', 0.04);
}

/** Get the internal sfx gain node for music routing */
export function getMusicGain(): GainNode | null { return musicGain; }
export function getMasterGain(): GainNode | null { return masterGain; }
