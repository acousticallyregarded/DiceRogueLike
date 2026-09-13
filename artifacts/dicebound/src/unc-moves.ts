import type { DamageType } from "./bestiary";

export type UncDamageType = Extract<
  DamageType,
  "poison" | "bludgeoning" | "wind" | "acid" | "cold" | "fire"
>;

export interface UncMoveMetadata {
  damageType: UncDamageType;
  label: string;
  durationMs: number;
  /** Uploaded move sheets advance one frame every 200ms. */
  frameDurationMs: number;
  frames: number;
}

/**
 * Authored action sheets that are not attack-style sheets. Values are the
 * unscaled base durations; presenters apply the current combat playback
 * multiplier when they schedule an action.
 */
export const UNC_ACTION_DURATIONS = {
  guard: 5000,
  health: 4200,
  special: 8200,
  death: 8200,
  hurt: 4200,
  idle: 3400,
} as const;

/**
 * The six authored Unc attack sheets. Keep this table independent from the
 * sprite imports so the reducer, timing hooks, and presentation can all use
 * the same animation contract.
 */
export const UNC_MOVES: Readonly<Record<UncDamageType, UncMoveMetadata>> = {
  poison: {
    damageType: "poison",
    label: "Poison",
    durationMs: 5000,
    frameDurationMs: 200,
    frames: 25,
  },
  bludgeoning: {
    damageType: "bludgeoning",
    label: "Punch",
    durationMs: 3400,
    frameDurationMs: 200,
    frames: 17,
  },
  wind: {
    damageType: "wind",
    label: "Wind",
    durationMs: 5000,
    frameDurationMs: 200,
    frames: 25,
  },
  acid: {
    damageType: "acid",
    label: "Acid",
    durationMs: 1800,
    frameDurationMs: 200,
    frames: 9,
  },
  cold: {
    damageType: "cold",
    label: "Cold",
    durationMs: 5000,
    frameDurationMs: 200,
    frames: 25,
  },
  fire: {
    damageType: "fire",
    label: "Fire",
    durationMs: 5000,
    frameDurationMs: 200,
    frames: 25,
  },
};
