import { fetchCachedAsset } from "@/lib/audio-cache";

type ActiveSource = AudioBufferSourceNode | null;
type ActiveNarration = {
  source: AudioBufferSourceNode;
  buffer: AudioBuffer;
  startedAt: number;
  offset: number;
  volume: number;
  resolve: () => void;
  stopReason: "natural" | "pause" | "stop" | null;
};
type ActiveOneShot = {
  source: AudioBufferSourceNode;
  buffer: AudioBuffer;
  startedAt: number;
};
export type PlaybackProgress = {
  position: number;
  duration: number;
  percent: number;
};

const FOREGROUND_VOLUME_BOOST = 1.55;
const MAX_FOREGROUND_VOLUME = 2.4;
const DEFAULT_NARRATION_VOLUME = 0.95;

export class DarkDrivesAudioEngine {
  private context: AudioContext | null = null;
  private narrationGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientSource: ActiveSource = null;
  private activeNarration: ActiveNarration | null = null;
  private activeOneShots = new Map<AudioBufferSourceNode, ActiveOneShot>();
  private bufferCache = new Map<string, AudioBuffer>();

  get isUnlocked() {
    return this.context?.state === "running";
  }

  async unlock() {
    const context = this.getContext();
    const silentBuffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(context.destination);
    source.start(0);
    await context.resume();
  }

  async startAmbient(url: string, targetVolume = 0.28) {
    const context = this.getContext();
    const ambientGain = this.getAmbientGain();
    const buffer = await this.getBuffer(url);

    if (this.ambientSource) {
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(ambientGain);
    ambientGain.gain.setValueAtTime(0.0001, context.currentTime);
    ambientGain.gain.exponentialRampToValueAtTime(targetVolume, context.currentTime + 0.8);
    source.start();
    this.ambientSource = source;
  }

  setAmbientVolume(targetVolume: number, rampSeconds = 0.45) {
    if (!this.context || !this.ambientGain) {
      return;
    }

    const volume = Math.min(Math.max(targetVolume, 0.0001), 0.55);
    this.ambientGain.gain.cancelScheduledValues(this.context.currentTime);
    this.ambientGain.gain.setTargetAtTime(volume, this.context.currentTime, rampSeconds / 4);
  }

  async playNarration(url: string, volume = DEFAULT_NARRATION_VOLUME, onStarted?: () => void) {
    const context = this.getContext();
    const narrationGain = this.getNarrationGain();
    const ambientGain = this.getAmbientGain();
    const buffer = await this.getBuffer(url);

    this.stopNarration();

    ambientGain.gain.cancelScheduledValues(context.currentTime);
    ambientGain.gain.setTargetAtTime(0.08, context.currentTime, 0.06);
    narrationGain.gain.cancelScheduledValues(context.currentTime);
    narrationGain.gain.setValueAtTime(0.0001, context.currentTime);
    const targetVolume = this.foregroundVolume(volume);
    narrationGain.gain.exponentialRampToValueAtTime(targetVolume, context.currentTime + 0.05);

    return new Promise<void>((resolve) => {
      this.startNarrationSource({ buffer, offset: 0, volume: targetVolume, resolve });
      onStarted?.();
    });
  }

  pauseNarration() {
    if (!this.context || !this.activeNarration) {
      return false;
    }

    const narration = this.activeNarration;
    narration.offset = Math.min(narration.offset + (this.context.currentTime - narration.startedAt), narration.buffer.duration);
    narration.stopReason = "pause";
    this.narrationGain?.gain.cancelScheduledValues(this.context.currentTime);
    this.narrationGain?.gain.setTargetAtTime(0.0001, this.context.currentTime, 0.035);
    try {
      narration.source.stop();
    } catch {
      // Source may already be stopped.
    }
    return true;
  }

  resumeNarration() {
    if (!this.context || !this.activeNarration || this.activeNarration.stopReason !== "pause") {
      return false;
    }

    const narration = this.activeNarration;
    this.narrationGain?.gain.cancelScheduledValues(this.context.currentTime);
    this.narrationGain?.gain.setValueAtTime(0.0001, this.context.currentTime);
    this.narrationGain?.gain.exponentialRampToValueAtTime(narration.volume, this.context.currentTime + 0.05);
    this.startNarrationSource(narration);
    return true;
  }

  seekNarration(position: number) {
    if (!this.context || !this.activeNarration) {
      return false;
    }

    const narration = this.activeNarration;
    narration.offset = Math.min(Math.max(position, 0), Math.max(narration.buffer.duration - 0.01, 0));

    if (narration.stopReason === "pause") {
      return true;
    }

    narration.stopReason = "stop";
    try {
      narration.source.stop();
    } catch {
      // Source may already be stopped.
    }
    this.startNarrationSource(narration);
    return true;
  }

  stopNarration() {
    if (!this.activeNarration) {
      return;
    }

    const narration = this.activeNarration;
    narration.stopReason = "stop";
    try {
      narration.source.stop();
    } catch {
      // Source may already be stopped.
    }
    this.activeNarration = null;
    narration.resolve();
  }

  getNarrationProgress(): PlaybackProgress | null {
    if (!this.context || !this.activeNarration) {
      return null;
    }

    const narration = this.activeNarration;
    const position =
      narration.stopReason === "pause"
        ? narration.offset
        : Math.min(narration.offset + (this.context.currentTime - narration.startedAt), narration.buffer.duration);

    return this.progressFrom(position, narration.buffer.duration);
  }

  getEffectProgress(): PlaybackProgress | null {
    if (!this.context || this.activeOneShots.size === 0) {
      return null;
    }

    const active = [...this.activeOneShots.values()].at(-1);
    if (!active) {
      return null;
    }

    return this.progressFrom(this.context.currentTime - active.startedAt, active.buffer.duration);
  }

  async playEffect(url: string, volume = 0.38) {
    return this.playOneShot(url, { volume, duckAmbient: false });
  }

  async playCue(url: string, volume = 0.72) {
    return this.playOneShot(url, { volume, duckAmbient: true });
  }

  private async playOneShot(url: string, { volume, duckAmbient }: { volume: number; duckAmbient: boolean }) {
    const context = this.getContext();
    const narrationGain = this.getNarrationGain();
    const ambientGain = this.getAmbientGain();
    const buffer = await this.getBuffer(url);

    if (duckAmbient) {
      ambientGain.gain.cancelScheduledValues(context.currentTime);
      ambientGain.gain.setTargetAtTime(0.08, context.currentTime, 0.06);
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(narrationGain);
    this.activeOneShots.set(source, { source, buffer, startedAt: context.currentTime });
    narrationGain.gain.setValueAtTime(0.0001, context.currentTime);
    narrationGain.gain.exponentialRampToValueAtTime(this.foregroundVolume(volume), context.currentTime + 0.05);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        this.activeOneShots.delete(source);
        narrationGain.gain.cancelScheduledValues(context.currentTime);
        narrationGain.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
        if (duckAmbient) {
          ambientGain.gain.cancelScheduledValues(context.currentTime);
          ambientGain.gain.setTargetAtTime(0.28, context.currentTime, 0.22);
        }
        resolve();
      };
      source.start();
    });
  }

  stopOneShots() {
    this.stopNarration();
    this.stopEffects();
  }

  stopEffects() {
    for (const source of this.activeOneShots.keys()) {
      try {
        source.stop();
      } catch {
        // Source may already be stopped.
      }
    }
    this.activeOneShots.clear();
  }

  stopAll() {
    this.stopOneShots();

    if (this.ambientSource) {
      try {
        this.ambientSource.stop();
      } catch {
        // Source may already be stopped.
      }
      this.ambientSource = null;
    }

    if (this.context) {
      this.ambientGain?.gain.setValueAtTime(0.0001, this.context.currentTime);
      this.narrationGain?.gain.setValueAtTime(0.0001, this.context.currentTime);
    }
  }

  private getContext() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.context = new AudioContextClass();
    }
    return this.context;
  }

  private getNarrationGain() {
    if (!this.narrationGain) {
      const context = this.getContext();
      this.narrationGain = context.createGain();
      this.narrationGain.gain.value = 0.0001;
      this.narrationGain.connect(context.destination);
    }
    return this.narrationGain;
  }

  private getAmbientGain() {
    if (!this.ambientGain) {
      const context = this.getContext();
      this.ambientGain = context.createGain();
      this.ambientGain.gain.value = 0.0001;
      this.ambientGain.connect(context.destination);
    }
    return this.ambientGain;
  }

  private async getBuffer(url: string) {
    const cached = this.bufferCache.get(url);
    if (cached) {
      return cached;
    }

    const context = this.getContext();
    const arrayBuffer = await fetchCachedAsset(url);
    const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
    this.bufferCache.set(url, buffer);
    return buffer;
  }

  private progressFrom(position: number, duration: number): PlaybackProgress {
    const safeDuration = Math.max(duration, 0.01);
    const safePosition = Math.min(Math.max(position, 0), safeDuration);
    return {
      position: safePosition,
      duration: safeDuration,
      percent: Math.round((safePosition / safeDuration) * 1000) / 10
    };
  }

  private foregroundVolume(volume: number) {
    return Math.min(Math.max(volume * FOREGROUND_VOLUME_BOOST, 0.0001), MAX_FOREGROUND_VOLUME);
  }

  private startNarrationSource(narration: Omit<ActiveNarration, "source" | "startedAt" | "stopReason"> | ActiveNarration) {
    const context = this.getContext();
    const narrationGain = this.getNarrationGain();
    const source = context.createBufferSource();
    source.buffer = narration.buffer;
    source.connect(narrationGain);

    const active: ActiveNarration = {
      buffer: narration.buffer,
      offset: Math.min(narration.offset, Math.max(narration.buffer.duration - 0.01, 0)),
      volume: narration.volume,
      resolve: narration.resolve,
      source,
      startedAt: context.currentTime,
      stopReason: null
    };
    this.activeNarration = active;

    source.onended = () => {
      if (this.activeNarration !== active) {
        return;
      }

      if (active.stopReason === "pause") {
        return;
      }

      this.activeNarration = null;
      this.narrationGain?.gain.cancelScheduledValues(context.currentTime);
      this.narrationGain?.gain.setTargetAtTime(0.0001, context.currentTime, 0.04);
      this.ambientGain?.gain.cancelScheduledValues(context.currentTime);
      this.ambientGain?.gain.setTargetAtTime(0.28, context.currentTime, 0.22);
      active.resolve();
    };

    source.start(0, active.offset);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
