import type { DamageType } from "./bestiary";

export type JohnAttackType = keyof typeof JOHN_ATTACK_DURATIONS;

export interface JohnMoveMetadata {
  damageType: DamageType;
  label: string;
  durationMs: number;
  /** Uploaded move sheets advance one frame every 200ms. */
  frameDurationMs: number;
  frames: number;
}

/**
 * Authored John attack timings. Slash retains the original 2600ms timing.
 */
export const JOHN_ATTACK_DURATIONS = {
  lightning: 3400,
  cold: 1800,
  acid: 5000,
  piercing: 4200,
  fire: 5000,
  bludgeoning: 5000,
  takedown: 5800,
} as const;

/**
 * Keep the sheet metadata next to the duration contract so presentation code
 * can use the same authored frame counts as the reducer's timing helpers.
 */
export const JOHN_MOVES: Readonly<Record<JohnAttackType, JohnMoveMetadata>> = {
  lightning: {
    damageType: "lightning",
    label: "Spark",
    durationMs: JOHN_ATTACK_DURATIONS.lightning,
    frameDurationMs: 200,
    frames: 17,
  },
  cold: {
    damageType: "cold",
    label: "Cold",
    durationMs: JOHN_ATTACK_DURATIONS.cold,
    frameDurationMs: 200,
    frames: 9,
  },
  acid: {
    damageType: "acid",
    label: "Acid",
    durationMs: JOHN_ATTACK_DURATIONS.acid,
    frameDurationMs: 200,
    frames: 25,
  },
  piercing: {
    damageType: "piercing",
    label: "Piercing",
    durationMs: JOHN_ATTACK_DURATIONS.piercing,
    frameDurationMs: 200,
    frames: 21,
  },
  fire: {
    damageType: "fire",
    label: "Ember",
    durationMs: JOHN_ATTACK_DURATIONS.fire,
    frameDurationMs: 200,
    frames: 25,
  },
  bludgeoning: {
    damageType: "bludgeoning",
    label: "Bludgeoning",
    durationMs: JOHN_ATTACK_DURATIONS.bludgeoning,
    frameDurationMs: 200,
    frames: 25,
  },
  takedown: {
    damageType: "bludgeoning",
    label: "Takedown",
    durationMs: JOHN_ATTACK_DURATIONS.takedown,
    frameDurationMs: 200,
    frames: 29,
  },
};

export function getJohnAttackDuration(
  damageType: DamageType | "takedown",
): number | undefined {
  return damageType in JOHN_ATTACK_DURATIONS
    ? JOHN_ATTACK_DURATIONS[damageType as JohnAttackType]
    : undefined;
}