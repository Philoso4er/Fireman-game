// A simple synthesizer for retro sound effects to avoid external asset dependencies
class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      // Initialize on first user interaction usually, but we set up the object now
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  toggleMute(mute: boolean) {
    this.muted = mute;
    if (this.ctx && this.muted) {
      this.ctx.suspend();
    } else if (this.ctx && !this.muted) {
      this.ctx.resume();
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playShoot() {
    // Extinguisher hiss
    if (!this.ctx || this.muted) return;
    const bufferSize = this.ctx.sampleRate * 0.1; // 0.1 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
    
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  playJump() {
    this.playTone(150, 'square', 0.1, 0.1); // Interaction sound
  }

  playDamage() {
    this.playTone(100, 'sawtooth', 0.2, 0.15);
  }

  playPowerup() {
    this.playTone(600, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(900, 'sine', 0.2, 0.1), 100);
  }

  playWin() {
    this.playTone(400, 'square', 0.1, 0.1);
    setTimeout(() => this.playTone(500, 'square', 0.1, 0.1), 150);
    setTimeout(() => this.playTone(600, 'square', 0.4, 0.1), 300);
  }

  playFireSpread() {
    this.playTone(150, 'sawtooth', 0.05, 0.05);
  }

  playPickup() {
    this.playTone(400, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(800, 'sine', 0.1, 0.1), 50);
  }

  playCivilianThankYou() {
    // A happy "thank you" chirp
    this.playTone(500, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(700, 'sine', 0.1, 0.1), 80);
    setTimeout(() => this.playTone(900, 'sine', 0.1, 0.1), 160);
  }

  playFireCrackling() {
    if (!this.ctx || this.muted) return;
    // Short noise burst for crackle
    const bufferSize = this.ctx.sampleRate * 0.02; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.5;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.02);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  playBigFireCrackle() {
    if (!this.ctx || this.muted) return;
    // Longer, deeper noise burst
    const bufferSize = this.ctx.sampleRate * 0.05; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.7;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.04, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.05);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  playCrumble() {
    this.playTone(80, 'sawtooth', 0.1, 0.1);
    setTimeout(() => this.playTone(60, 'sawtooth', 0.2, 0.1), 50);
  }

  playSpark() {
    this.playTone(1200, 'square', 0.05, 0.05);
    setTimeout(() => this.playTone(1500, 'square', 0.05, 0.05), 30);
  }
}

export const audioManager = new SoundManager();