/**
 * AudioManager — lazy-initialised Web Audio synth.
 *
 * ROOT CAUSE of "sound goes awol":
 *   - AudioContext created at module load time is immediately suspended by
 *     browsers that require a user gesture before audio plays.
 *   - Calling ctx.resume() only once (on Start) is not enough; after a tab
 *     switch or incoming call the context re-suspends and is never re-resumed.
 *
 * FIXES:
 *   1. Lazy-init: AudioContext is not created until the first user interaction.
 *   2. Every play call checks ctx.state and resumes if suspended.
 *   3. Public resume() method so App/UIOverlay can poke it on any user action.
 *   4. Removed separate suspend() path — muting just sets a flag instead.
 */
class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;

  // ── Lazy init ──────────────────────────────────────────────────────────────
  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    // Re-resume if the browser suspended us (tab switch, OS interrupt, etc.)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Call on every user interaction so the context stays un-suspended. */
  resume() {
    this.getCtx(); // side-effect: creates + resumes
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  /** Legacy toggle used by older call sites — kept for compatibility. */
  toggleMute(mute: boolean) {
    this.setMuted(mute);
    if (!mute) this.resume();
  }

  // ── Core tone ──────────────────────────────────────────────────────────────
  playTone(freq: number, type: OscillatorType, duration: number, vol = 0.08) {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch { /* ignore if context closed */ }
  }

  // ── Noise burst (extinguisher / fire crackle) ──────────────────────────────
  private playNoise(duration: number, vol: number) {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const samples = Math.floor(ctx.sampleRate * duration);
      const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < samples; i++) data[i] = (Math.random() * 2 - 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }

  // ── SFX ───────────────────────────────────────────────────────────────────
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
}

export const audioManager = new AudioManager();
