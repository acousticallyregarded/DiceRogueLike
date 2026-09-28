import type { DamageType } from "./bestiary";
import { ACTION_SHEET_FRAME_MS, actionSheetDurationMs } from "./combat-tempo";

export type JohnAttackType = keyof typeof JOHN_ATTACK_DURATIONS;

export interface JohnMoveMetadata {
  damageType: DamageType;
  label: string;
  durationMs: number;
  /** Uploaded move sheets advance one frame every ACTION_SHEET_FRAME_MS. */
  frameDurationMs: number;
  frames: number;
}

/** Frame counts of John's uploaded attack sheets. */
export const JOHN_ATTACK_FRAMES = {
  lightning: 17,
  cold: 9,
  acid: 25,
  piercing: 21,
  fire: 25,
  bludgeoning: 25,
  takedown: 29,
} as const;

/**
 * John attack timings, derived from the sheet frame counts at the shared
 * combat tempo. Slash uses the hero sword clip timing.
 */
export const JOHN_ATTACK_DURATIONS = {
  lightning: actionSheetDurationMs(JOHN_ATTACK_FRAMES.lightning),
  cold: actionSheetDurationMs(JOHN_ATTACK_FRAMES.cold),
  acid: actionSheetDurationMs(JOHN_ATTACK_FRAMES.acid),
  piercing: actionSheetDurationMs(JOHN_ATTACK_FRAMES.piercing),
  fire: actionSheetDurationMs(JOHN_ATTACK_FRAMES.fire),
  bludgeoning: actionSheetDurationMs(JOHN_ATTACK_FRAMES.bludgeoning),
  takedown: actionSheetDurationMs(JOHN_ATTACK_FRAMES.takedown),
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
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.lightning,
  },
  cold: {
    damageType: "cold",
    label: "Cold",
    durationMs: JOHN_ATTACK_DURATIONS.cold,
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.cold,
  },
  acid: {
    damageType: "acid",
    label: "Acid",
    durationMs: JOHN_ATTACK_DURATIONS.acid,
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.acid,
  },
  piercing: {
    damageType: "piercing",
    label: "Piercing",
    durationMs: JOHN_ATTACK_DURATIONS.piercing,
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.piercing,
  },
  fire: {
    damageType: "fire",
    label: "Ember",
    durationMs: JOHN_ATTACK_DURATIONS.fire,
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.fire,
  },
  bludgeoning: {
    damageType: "bludgeoning",
    label: "Bludgeoning",
    durationMs: JOHN_ATTACK_DURATIONS.bludgeoning,
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.bludgeoning,
  },
  takedown: {
    damageType: "bludgeoning",
    label: "Takedown",
    durationMs: JOHN_ATTACK_DURATIONS.takedown,
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: JOHN_ATTACK_FRAMES.takedown,
  },
};

export function getJohnAttackDuration(
  damageType: DamageType | "takedown",
): number | undefined {
  return damageType in JOHN_ATTACK_DURATIONS
    ? JOHN_ATTACK_DURATIONS[damageType as JohnAttackType]
    : undefined;
}