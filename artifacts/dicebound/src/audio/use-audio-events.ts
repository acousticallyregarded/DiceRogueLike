import { useEffect, useRef } from "react";
import type { GameStateV4 } from "../engine";
import { getAudioTransitionEvents } from "./audio-events";
import { useAudio } from "./use-audio";

/**
 * Audio is intentionally observed after state commits. It never runs from a
 * React setState updater, and its null baseline prevents restored saves from
 * replaying historical attacks.
 */
export function useAudioEvents(state: GameStateV4 | null) {
  const { playEffect } = useAudio();
  const previousState = useRef<GameStateV4 | null>(null);

  useEffect(() => {
    if (!state) return;
    const events = getAudioTransitionEvents(previousState.current, state);
    previousState.current = state;

    events.forEach(event => {
      if (event.type === "dice-roll") {
        playEffect("dice-roll");
      } else if (event.type === "consumable") {
        playEffect(event.consumable === "health_potion" ? "healing-potion" : "fire-bomb");
      } else if (event.type === "hero-hit") {
        playEffect("blunt-impact");
      } else if (event.damageType === "bludgeoning") {
        playEffect("blunt-impact");
      } else {
        playEffect("sword-slash");
        // The metal ring lands just after the blade's impact.
        playEffect("sword-metal", 110);
      }
    });
  }, [playEffect, state]);
}