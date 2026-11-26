interface ToneSpec {
  freqStart: number;
  freqEnd?: number;
  freqRampDuration?: number;
  gainStart: number;
  gainRampDuration: number;
  duration: number;
  delay?: number;
}

export class AudioSynthesizer {
  private ctx: AudioContext | null = null;
  public enabled = false;

  private initContext() {
    if (this.ctx && this.ctx.state === "closed") {
      this.ctx = null;
    }

    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      try {
        const resumePromise = this.ctx.resume();
        if (resumePromise && typeof resumePromise.catch === "function") {
          resumePromise.catch(() => {});
        }
      } catch {
        // Ignore resume failures in restricted autoplay environments
      }
    }
  }

  private playTones(tones: ToneSpec[]) {
    if (!this.enabled) return;
    this.initContext();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + (tone.delay ?? 0);

      osc.type = "sine";
      osc.frequency.setValueAtTime(tone.freqStart, startTime);
      if (tone.freqEnd !== undefined && tone.freqRampDuration !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          tone.freqEnd,
          startTime + tone.freqRampDuration
        );
      }

      gain.gain.setValueAtTime(tone.gainStart, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + tone.gainRampDuration);

      osc.onended = () => {
        try {
          osc.disconnect();
        } catch {
          // Ignore already-disconnected nodes
        }
        try {
          gain.disconnect();
        } catch {
          // Ignore already-disconnected nodes
        }
      };

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + tone.duration);
    }
  }

  dispose() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx.state !== "closed") {
      try {
        const closePromise = ctx.close();
        if (closePromise && typeof closePromise.catch === "function") {
          closePromise.catch(() => {});
        }
      } catch {
        // Ignore close failures
      }
    }
  }

  // Generic UI clicks are muted for a peaceful classical reading experience
  playClick() {
    // Intentionally silent for standard UI buttons
  }

  playFlip() {
    // Gentle page turn / paper flutter (soft low sine glide)
    this.playTones([
      {
        freqStart: 320,
        freqEnd: 160,
        freqRampDuration: 0.07,
        gainStart: 0.08,
        gainRampDuration: 0.07,
        duration: 0.08
      }
    ]);
  }

  playCorrect() {
    // Pure, gentle guqin / bell harmonic chime (E5 -> G#5)
    const freqs = [659.25, 830.61];
    this.playTones(
      freqs.map((freq, idx) => ({
        freqStart: freq,
        gainStart: 0.1,
        gainRampDuration: 0.28,
        duration: 0.3,
        delay: idx * 0.07
      }))
    );
  }

  playEasy() {
    // Gentle ascending triad (C5 -> E5 -> G5 -> C6)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    this.playTones(
      notes.map((freq, idx) => ({
        freqStart: freq,
        gainStart: 0.09,
        gainRampDuration: 0.3,
        duration: 0.32,
        delay: idx * 0.05
      }))
    );
  }

  playHard() {
    // Subtle wooden reflection tone
    this.playTones([
      {
        freqStart: 260,
        freqEnd: 200,
        freqRampDuration: 0.16,
        gainStart: 0.09,
        gainRampDuration: 0.18,
        duration: 0.2
      }
    ]);
  }

  playWrong() {
    // Soft muted wooden block (muyyu) tap - never a harsh buzzer
    this.playTones([
      {
        freqStart: 160,
        freqEnd: 100,
        freqRampDuration: 0.12,
        gainStart: 0.08,
        gainRampDuration: 0.14,
        duration: 0.15
      }
    ]);
  }

  playReveal() {
    // Very quiet gentle ping
    this.playTones([
      {
        freqStart: 880, // A5
        gainStart: 0.06,
        gainRampDuration: 0.12,
        duration: 0.13
      }
    ]);
  }

  playCelebration() {
    // Harmonious ancient temple chime (peaceful, not loud)
    const chord = [392.0, 523.25, 659.25, 783.99, 1046.5];
    this.playTones(
      chord.map((freq, idx) => ({
        freqStart: freq,
        gainStart: 0.1,
        gainRampDuration: 0.8,
        duration: 0.85,
        delay: idx * 0.08
      }))
    );
  }
}

export const sound = new AudioSynthesizer();
