import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  audioController,
  type AudioEffectName,
  type AudioSettings,
  type AudioStatus,
  type MusicScene,
} from "./audio-controller";

interface AudioContextValue {
  settings: AudioSettings;
  status: AudioStatus;
  unlock: () => Promise<boolean>;
  updateSettings: (update: Partial<AudioSettings>) => void;
  setMusicScene: (scene: MusicScene) => void;
  stopPlayback: () => void;
  playEffect: (name: AudioEffectName, delayMs?: number) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(() => audioController.getSettings());
  const [status, setStatus] = useState<AudioStatus>(() => audioController.getStatus());

  useEffect(() => {
    const unsubscribe = audioController.subscribe(nextStatus => setStatus(nextStatus));
    return () => {
      unsubscribe();
      audioController.stopPlayback();
    };
  }, []);

  // A pointer/keyboard event is a trusted gesture in all supported browsers.
  // Unlocking here also means the lobby Play button can start the forest loop
  // before its first state transition commits.
  useEffect(() => {
    const unlock = () => {
      void audioController.unlock();
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const unlock = useCallback(() => audioController.unlock(), []);
  const updateSettings = useCallback((update: Partial<AudioSettings>) => {
    audioController.setSettings(update);
    setSettings(audioController.getSettings());
  }, []);
  const setMusicScene = useCallback((scene: MusicScene) => {
    audioController.setMusicScene(scene);
  }, []);
  const stopPlayback = useCallback(() => {
    audioController.stopPlayback();
  }, []);
  const playEffect = useCallback((name: AudioEffectName, delayMs?: number) => {
    audioController.playEffect(name, delayMs);
  }, []);

  const value = useMemo<AudioContextValue>(() => ({
    settings,
    status,
    unlock,
    updateSettings,
    setMusicScene,
    stopPlayback,
    playEffect,
  }), [settings, status, unlock, updateSettings, setMusicScene, stopPlayback, playEffect]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const audio = useContext(AudioContext);
  if (!audio) throw new Error("useAudio must be used inside AudioProvider");
  return audio;
}