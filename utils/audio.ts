/**
 * AudioManager — lazy Web Audio synth with procedural chiptune music.
 *
 * Music is generated entirely from oscillators — no samples, no files.
 * The melody uses a repeating 16-note pattern in D minor over a simple
 * bass line and hi-hat pulse, giving a tense retro firefighter vibe.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  // Music state
  private musicGain:    GainNode | null = null;
  private musicPlaying  = false;
  private musicScheduled = false;
  private nextNoteTime  = 0;
  private beatIndex     = 0;
  private musicTimer:   ReturnType<typeof setTimeout> | null = null;

  // ── Lazy init ───────────────────────────────────────────────────────────────
  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
        this.ctx = new Ctor();
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  resume() { this.getCtx(); }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopMusic();
  }

  toggleMute(mute: boolean) {
    this.setMuted(mute);
    if (!mute) this.resume();
  }

  // ── Core tone ────────────────────────────────────────────────────────────────
  playTone(freq: number, type: OscillatorType, duration: number, vol = 0.08) {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* context closed */ }
  }

  private playNoise(duration: number, vol: number) {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const samples = Math.floor(ctx.sampleRate * duration);
      const buf  = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────
  playShoot()            { this.playNoise(0.08, 0.04); }
  playFireCrackling()    { this.playNoise(0.02, 0.015); }
  playBigFireCrackle()   { this.playNoise(0.05, 0.03); }
  playFireSpread()       { this.playTone(150, 'sawtooth', 0.05, 0.04); }
  playDamage()           { this.playTone(100, 'sawtooth', 0.18, 0.12); }
  playPickup()           {
    this.playTone(400, 'sine', 0.08);
    setTimeout(() => this.playTone(800, 'sine', 0.08), 50);
  }
  playCivilianThankYou() {
    this.playTone(500, 'sine', 0.08);
    setTimeout(() => this.playTone(700, 'sine', 0.08), 80);
    setTimeout(() => this.playTone(900, 'sine', 0.08), 160);
  }
  playWin() {
    this.stopMusic();
    this.playTone(400, 'square', 0.1);
    setTimeout(() => this.playTone(500, 'square', 0.1), 150);
    setTimeout(() => this.playTone(650, 'square', 0.35), 300);
  }
  playCrumble() {
    this.playTone(80, 'sawtooth', 0.1, 0.1);
    setTimeout(() => this.playTone(60, 'sawtooth', 0.2, 0.1), 50);
  }
  playSpark() {
    this.playTone(1200, 'square', 0.05, 0.04);
    setTimeout(() => this.playTone(1500, 'square', 0.05, 0.04), 30);
  }

  // ── Chiptune music ───────────────────────────────────────────────────────────
  //
  // Architecture: Web Audio "lookahead scheduler" pattern.
  //   - A JS timer fires every ~100 ms and pre-schedules notes ~200 ms ahead
  //     into the AudioContext timeline.  This decouples JS timer jitter from
  //     audio timing, giving perfectly steady rhythm.
  //
  // Song: 16-step pattern at 140 BPM, 16th-note grid.
  // Key:  D minor  (D3 bass + melody in D4 pentatonic minor)
  // Feel: urgent, tense, retro arcade.

  private readonly BPM        = 140;
  private readonly STEP_SEC   = () => 60 / this.BPM / 4; // 16th note duration
  private readonly LOOKAHEAD  = 0.2;   // seconds to schedule ahead
  private readonly SCHEDULE_MS = 100;  // how often the scheduler runs (ms)

  // Melody: 16 steps. null = rest. Frequencies in Hz (D4 pentatonic minor).
  // D4=293.7  F4=349.2  G4=392  A4=440  C5=523.3  D5=587.3
  private readonly MELODY: (number | null)[] = [
    293.7, null, 392,   null,
    440,   null, 349.2, 293.7,
    null,  523.3,null,  440,
    392,   null, 293.7, 349.2,
  ];

  // Bass: root D2 (146.8) and A2 (110) power-chord pulse
  private readonly BASS: (number | null)[] = [
    146.8, null, null, null,
    110,   null, null, null,
    146.8, null, null, null,
    110,   null, 146.8,null,
  ];

  // Hi-hat pattern (just a noise burst): 1=hit, 0=rest
  private readonly HIHAT = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,1];

  // Kick on beats 1 and 3 (steps 0 and 8)
  private readonly KICK = [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0];

  private scheduleNote(ctx: AudioContext, step: number, time: number) {
    const step16 = step % 16;
    const stepDur = this.STEP_SEC();

    // ── Melody ──
    const mFreq = this.MELODY[step16];
    if (mFreq !== null) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(mFreq, time);
      gain.gain.setValueAtTime(0.06, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 0.8);
      osc.connect(gain);
      if (this.musicGain) gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + stepDur);
    }

    // ── Bass ──
    const bFreq = this.BASS[step16];
    if (bFreq !== null) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(bFreq, time);
      gain.gain.setValueAtTime(0.07, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 1.5);
      osc.connect(gain);
      if (this.musicGain) gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + stepDur * 1.6);
    }

    // ── Hi-hat (bandpass noise) ──
    if (this.HIHAT[step16]) {
      const samples = Math.floor(ctx.sampleRate * 0.04);
      const buf  = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
      const src    = ctx.createBufferSource();
      src.buffer   = buf;
      const filter = ctx.createBiquadFilter();
      filter.type  = 'bandpass';
      filter.frequency.value = 8000;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.025, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      src.connect(filter);
      filter.connect(gain);
      if (this.musicGain) gain.connect(this.musicGain);
      src.start(time);
    }

    // ── Kick (sine thump) ──
    if (this.KICK[step16]) {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type   = 'sine';
      osc.frequency.setValueAtTime(150, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.08);
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      osc.connect(gain);
      if (this.musicGain) gain.connect(this.musicGain);
      osc.start(time);
      osc.stop(time + 0.15);
    }
  }

  private schedulerTick() {
    const ctx = this.getCtx();
    if (!ctx || !this.musicPlaying) return;

    // Pre-schedule all steps that fall within the lookahead window
    while (this.nextNoteTime < ctx.currentTime + this.LOOKAHEAD) {
      this.scheduleNote(ctx, this.beatIndex, this.nextNoteTime);
      this.nextNoteTime += this.STEP_SEC();
      this.beatIndex++;
    }

    this.musicTimer = setTimeout(() => this.schedulerTick(), this.SCHEDULE_MS);
  }

  startMusic() {
    if (this.musicPlaying || this.muted) return;
    const ctx = this.getCtx();
    if (!ctx) return;

    this.musicGain = ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.7, ctx.currentTime);
    this.musicGain.connect(ctx.destination);

    this.musicPlaying  = true;
    this.beatIndex     = 0;
    this.nextNoteTime  = ctx.currentTime + 0.1;
    this.schedulerTick();
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
    if (this.musicGain) {
      try {
        const ctx = this.ctx;
        if (ctx) {
          this.musicGain.gain.setValueAtTime(
            this.musicGain.gain.value, ctx.currentTime
          );
          this.musicGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        }
      } catch { /* ignore */ }
      this.musicGain = null;
    }
  }
}

export const audioManager = new AudioManager();
