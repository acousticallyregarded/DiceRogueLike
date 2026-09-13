import forestMusicUrl from "../assets/audio/dicebound-forest-music.mp3";
import battleMusicUrl from "../assets/audio/dicebound-battle-music.mp3";
import diceRollUrl from "../assets/audio/dicebound-dice-roll.mp3";
import healingPotionUrl from "../assets/audio/dicebound-healing-potion.mp3";
import fireBombUrl from "../assets/audio/dicebound-fire-bomb.mp3";
import swordMetalUrl from "../assets/audio/dicebound-sword-metal.mp3";
import swordSlashUrl from "../assets/audio/dicebound-sword-slash.mp3";
import bluntImpactUrl from "../assets/audio/dicebound-blunt-impact.mp3";

export type AudioEffectName =
  | "dice-roll"
  | "healing-potion"
  | "fire-bomb"
  | "sword-slash"
  | "sword-metal"
  | "blunt-impact";

export type MusicScene = "lobby" | "explore" | "combat" | null;
export type AudioStatus = "locked" | "loading" | "ready" | "blocked" | "unavailable";

export interface AudioSettings {
  musicVolume: number;
  effectsVolume: number;
  musicMuted: boolean;
  effectsMuted: boolean;
}

export const AUDIO_SETTINGS_KEY = "dicebound-audio-settings-v1";

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  // The forest loop is deliberately a quiet bed under the game UI.
  musicVolume: 0.22,
  effectsVolume: 0.8,
  musicMuted: false,
  effectsMuted: false,
};

const AUDIO_FILES: Record<AudioEffectName | "forest-music" | "battle-music", string> = {
  "forest-music": forestMusicUrl,
  "battle-music": battleMusicUrl,
  "dice-roll": diceRollUrl,
  "healing-potion": healingPotionUrl,
  "fire-bomb": fireBombUrl,
  "sword-metal": swordMetalUrl,
  "sword-slash": swordSlashUrl,
  "blunt-impact": bluntImpactUrl,
};

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

export function loadAudioSettings(): AudioSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      musicVolume: clampVolume(parsed.musicVolume, DEFAULT_AUDIO_SETTINGS.musicVolume),
      effectsVolume: clampVolume(parsed.effectsVolume, DEFAULT_AUDIO_SETTINGS.effectsVolume),
      musicMuted: Boolean(parsed.musicMuted),
      effectsMuted: Boolean(parsed.effectsMuted),
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

function saveAudioSettings(settings: AudioSettings) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are non-critical. A private browsing quota failure should not
    // stop gameplay or surface a noisy browser error.
  }
}

interface QueuedEffect {
  name: AudioEffectName;
  delayMs: number;
}

type AudioListener = (status: AudioStatus) => void;

/**
 * A single WebAudio graph shared by the whole game. The controller never
 * starts a context from a render; unlock() is called by a trusted gesture
 * listener and all rejected autoplay/resume promises are handled quietly.
 */
class AudioController {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private failedBuffers = new Set<string>();
  private loadingPromise: Promise<void> | null = null;
  private activeEffects = new Set<AudioBufferSourceNode>();
  private pendingEffects: QueuedEffect[] = [];
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private musicScene: MusicScene = null;
  private settings: AudioSettings = loadAudioSettings();
  private status: AudioStatus = "locked";
  private listeners = new Set<AudioListener>();
  private hidden = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.hidden = document.visibilityState === "hidden";
    }
  }

  getSettings() {
    return { ...this.settings };
  }

  getStatus() {
    return this.status;
  }

  subscribe(listener: AudioListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: AudioStatus) {
    if (this.status === status) return;
    this.status = status;
    this.listeners.forEach(listener => listener(status));
  }

  private getAudioContextConstructor(): typeof AudioContext | undefined {
    if (typeof window === "undefined") return undefined;
    const browserWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    return window.AudioContext ?? browserWindow.webkitAudioContext;
  }

  private async loadBuffers(context: AudioContext) {
    if (this.loadingPromise) {
      await this.loadingPromise;
      return;
    }

    this.loadingPromise = Promise.all(
      Object.entries(AUDIO_FILES).map(async ([name, url]) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error("audio fetch failed");
          const data = await response.arrayBuffer();
          const buffer = await context.decodeAudioData(data);
          this.buffers.set(name, buffer);
        } catch {
          this.failedBuffers.add(name);
        }
      }),
    ).then(() => undefined);

    await this.loadingPromise;
  }

  async unlock(): Promise<boolean> {
    if (typeof window === "undefined") return false;

    const Context = this.getAudioContextConstructor();
    if (!Context) {
      this.setStatus("unavailable");
      return false;
    }

    try {
      if (!this.context) this.context = new Context();
      await this.context.resume();
      this.setStatus("loading");
      await this.loadBuffers(this.context);

      if (this.buffers.size === 0) {
        this.setStatus("unavailable");
        return false;
      }

      this.setStatus("ready");
      this.flushPendingEffects();
      this.startMusicIfReady();
      return true;
    } catch {
      // Browsers can reject resume() until a real gesture. Keep the queued
      // event for the next gesture and expose a compact status in settings.
      this.setStatus(this.context ? "blocked" : "unavailable");
      return false;
    }
  }

  setSettings(update: Partial<AudioSettings>) {
    this.settings = {
      ...this.settings,
      ...update,
      musicVolume: clampVolume(update.musicVolume, this.settings.musicVolume),
      effectsVolume: clampVolume(update.effectsVolume, this.settings.effectsVolume),
      musicMuted: Boolean(update.musicMuted ?? this.settings.musicMuted),
      effectsMuted: Boolean(update.effectsMuted ?? this.settings.effectsMuted),
    };
    saveAudioSettings(this.settings);

    if (this.settings.effectsMuted || this.settings.effectsVolume <= 0) {
      this.stopEffects();
    }
    if (this.settings.musicMuted || this.settings.musicVolume <= 0) {
      this.stopMusicSource();
    } else {
      this.applyMusicVolume();
      this.startMusicIfReady();
    }
    this.listeners.forEach(listener => listener(this.status));
  }

  setMusicScene(scene: MusicScene) {
    const previousTrack = this.musicScene === "combat" ? "battle-music" : "forest-music";
    const nextTrack = scene === "combat" ? "battle-music" : "forest-music";
    if (previousTrack !== nextTrack) this.stopMusicSource();
    this.musicScene = scene;
    if (!scene) {
      this.stopMusicSource();
      return;
    }
    this.applyMusicVolume();
    this.startMusicIfReady();
  }

  stopPlayback() {
    this.stopMusicSource();
    this.stopEffects();
  }

  playEffect(name: AudioEffectName, delayMs = 0) {
    if (this.settings.effectsMuted || this.settings.effectsVolume <= 0) return;
    if (this.hidden) return;

    if (!this.context || this.context.state !== "running" || !this.buffers.has(name)) {
      this.pendingEffects.push({ name, delayMs });
      void this.unlock();
      return;
    }

    this.startEffect(name, delayMs);
  }

  private startEffect(name: AudioEffectName, delayMs: number) {
    const context = this.context;
    const buffer = this.buffers.get(name);
    if (!context || !buffer || this.settings.effectsMuted || this.hidden) return;

    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = this.settings.effectsVolume;
    source.connect(gain);
    gain.connect(context.destination);
    this.activeEffects.add(source);
    source.addEventListener("ended", () => {
      this.activeEffects.delete(source);
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    try {
      source.start(context.currentTime + Math.max(0, delayMs) / 1000);
    } catch {
      this.activeEffects.delete(source);
      source.disconnect();
      gain.disconnect();
    }
  }

  private flushPendingEffects() {
    const queued = this.pendingEffects;
    this.pendingEffects = [];
    queued.forEach(effect => this.startEffect(effect.name, effect.delayMs));
  }

  private applyMusicVolume() {
    if (!this.context || !this.musicGain) return;
    const target = this.settings.musicMuted || this.settings.musicVolume <= 0
      ? 0
      : this.settings.musicVolume;
    this.musicGain.gain.setTargetAtTime(target, this.context.currentTime, 0.06);
  }

  private startMusicIfReady() {
    const track = this.musicScene === "combat" ? "battle-music" : "forest-music";
    if (
      !this.context
      || this.context.state !== "running"
      || !this.buffers.has(track)
      || !this.musicScene
      || this.settings.musicMuted
      || this.settings.musicVolume <= 0
      || this.hidden
      || this.musicSource
    ) return;

    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = this.buffers.get(track)!;
    source.loop = true;
    source.connect(gain);
    gain.connect(this.context.destination);
    this.musicSource = source;
    this.musicGain = gain;
    gain.gain.value = 0;
    this.applyMusicVolume();
    source.addEventListener("ended", () => {
      if (this.musicSource === source) {
        this.musicSource = null;
        this.musicGain = null;
      }
      source.disconnect();
      gain.disconnect();
    }, { once: true });
    try {
      source.start();
    } catch {
      this.musicSource = null;
      this.musicGain = null;
      source.disconnect();
      gain.disconnect();
    }
  }

  private stopMusicSource() {
    const source = this.musicSource;
    this.musicSource = null;
    this.musicGain = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // An already-ended loop is safe to ignore.
    }
    source.disconnect();
  }

  private stopEffects() {
    this.pendingEffects = [];
    this.activeEffects.forEach(source => {
      try {
        source.stop();
      } catch {
        // A source can end between iteration and stop().
      }
      source.disconnect();
    });
    this.activeEffects.clear();
  }

  private handleVisibilityChange = () => {
    if (typeof document === "undefined") return;
    this.hidden = document.visibilityState === "hidden";
    if (this.hidden) {
      this.stopMusicSource();
      this.stopEffects();
      return;
    }
    if (!this.context) return;
    void this.context.resume()
      .then(() => this.startMusicIfReady())
      .catch(() => this.setStatus("blocked"));
  };
}

export const audioController = new AudioController();