// -- Ambient Procedural Music System ----------------------------------
// Generates evolving, looping ambient music using Web Audio API.
// No external files needed - everything is synthesized.

let audioCtx: AudioContext | null = null;
let musicGainNode: GainNode | null = null;
let isPlaying = false;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;
let currentChordIndex = 0;
let beatCount = 0;

// Chord progressions (frequencies in Hz) - ambient/chill
const CHORD_PROGRESSIONS = [
  // Am - F - C - G (classic ambient)
  [
    [220, 277.18, 329.63], // Am
    [174.61, 220, 261.63], // F
    [261.63, 329.63, 392],  // C
    [196, 246.94, 293.66],  // G
  ],
  // Dm - Bb - F - C (darker, contemplative)
  [
    [146.83, 174.61, 220],   // Dm
    [116.54, 146.83, 174.61], // Bb
    [174.61, 220, 261.63],   // F
    [130.81, 164.81, 196],   // C
  ],
  // Em - C - G - D (uplifting)
  [
    [164.81, 196, 246.94],   // Em
    [130.81, 164.81, 196],   // C
    [196, 246.94, 293.66],   // G
    [146.83, 185, 220],      // D
  ],
];

let currentProgression = 0;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    musicGainNode = audioCtx.createGain();
    musicGainNode.gain.value = 0.08;
    musicGainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Connect the music output to an existing gain node chain */
export function connectMusicTo(masterGain: GainNode, musicGain: GainNode): void {
  if (musicGainNode) {
    musicGainNode.disconnect();
    musicGainNode.connect(musicGain);
  }
}

export function setMusicVolume(vol: number): void {
  // vol 0-100
  if (musicGainNode) musicGainNode.gain.value = (vol / 100) * 0.12;
}

function playPad(ctx: AudioContext, freqs: number[], startTime: number, duration: number): void {
  if (!musicGainNode) return;
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Slight detune for warmth
    osc.detune.value = (Math.random() - 0.5) * 8;

    // ADSR envelope
    const attack = 0.6;
    const decay = 0.3;
    const sustain = 0.5;
    const release = 0.8;

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.06, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.06 * sustain, startTime + attack + decay);
    gain.gain.setValueAtTime(0.06 * sustain, startTime + duration - release);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(musicGainNode);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  }
}

function playArpNote(ctx: AudioContext, freq: number, startTime: number, duration: number): void {
  if (!musicGainNode) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq * 2; // One octave up
  osc.detune.value = (Math.random() - 0.5) * 5;

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.03, startTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(musicGainNode);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.1);
}

function playBassNote(ctx: AudioContext, freq: number, startTime: number, duration: number): void {
  if (!musicGainNode) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq / 2; // One octave down for bass

  gain.gain.setValueAtTime(0.001, startTime);
  gain.gain.exponentialRampToValueAtTime(0.04, startTime + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.025, startTime + duration * 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.connect(gain);
  gain.connect(musicGainNode);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.1);
}

function scheduleNotes(): void {
  const ctx = getCtx();
  const lookahead = 0.2; // seconds
  const tempo = 55; // BPM - slow ambient
  const beatDuration = 60 / tempo;

  while (nextNoteTime < ctx.currentTime + lookahead) {
    const prog = CHORD_PROGRESSIONS[currentProgression];
    const chord = prog[currentChordIndex];
    const beatInChord = beatCount % 8; // 8 beats per chord (2 bars of 4/4)

    // Pad: play on beat 0 of each chord, sustain for 8 beats
    if (beatInChord === 0) {
      playPad(ctx, chord, nextNoteTime, beatDuration * 8);
      playBassNote(ctx, chord[0], nextNoteTime, beatDuration * 4);
    }

    // Bass on beat 4
    if (beatInChord === 4) {
      playBassNote(ctx, chord[0], nextNoteTime, beatDuration * 3.5);
    }

    // Arp pattern - sparse and gentle
    if (beatInChord === 2 || beatInChord === 5) {
      const noteIdx = Math.floor(Math.random() * chord.length);
      playArpNote(ctx, chord[noteIdx], nextNoteTime, beatDuration * 1.5);
    }

    // Occasional extra arp note for variation
    if (beatInChord === 7 && Math.random() > 0.5) {
      const noteIdx = Math.floor(Math.random() * chord.length);
      playArpNote(ctx, chord[noteIdx], nextNoteTime, beatDuration * 0.8);
    }

    beatCount++;
    if (beatCount % 8 === 0) {
      currentChordIndex = (currentChordIndex + 1) % prog.length;
      // Occasionally switch progression
      if (currentChordIndex === 0 && Math.random() > 0.7) {
        currentProgression = (currentProgression + 1) % CHORD_PROGRESSIONS.length;
      }
    }

    nextNoteTime += beatDuration;
  }
}

export function startMusic(): void {
  if (isPlaying) return;
  const ctx = getCtx();
  isPlaying = true;
  nextNoteTime = ctx.currentTime + 0.1;
  beatCount = 0;
  currentChordIndex = 0;
  scheduleTimer = setInterval(scheduleNotes, 100);
}

export function stopMusic(): void {
  if (!isPlaying) return;
  isPlaying = false;
  if (scheduleTimer) { clearInterval(scheduleTimer); scheduleTimer = null; }
}

export function toggleMusic(): boolean {
  if (isPlaying) { stopMusic(); return false; }
  else { startMusic(); return true; }
}

export function isMusicPlaying(): boolean { return isPlaying; }
