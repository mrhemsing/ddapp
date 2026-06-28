import { fetchCachedAsset } from "@/lib/audio-cache";

type ActiveSource = AudioBufferSourceNode | null;

export class DarkDrivesAudioEngine {
  private context: AudioContext | null = null;
  private narrationGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private ambientSource: ActiveSource = null;
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

  async playNarration(url: string) {
    return this.playOneShot(url, { volume: 0.95, duckAmbient: true });
  }

  async playEffect(url: string, volume = 0.38) {
    return this.playOneShot(url, { volume, duckAmbient: false });
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
    narrationGain.gain.setValueAtTime(0.0001, context.currentTime);
    narrationGain.gain.exponentialRampToValueAtTime(Math.min(Math.max(volume, 0.0001), 1), context.currentTime + 0.05);

    return new Promise<void>((resolve) => {
      source.onended = () => {
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

  stopAll() {
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
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
