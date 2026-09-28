import type { DamageType } from "./bestiary";
import { ACTION_SHEET_FRAME_MS, actionSheetDurationMs } from "./combat-tempo";

export type UncDamageType = Extract<
  DamageType,
  "poison" | "bludgeoning" | "wind" | "acid" | "cold" | "fire"
>;

export interface UncMoveMetadata {
  damageType: UncDamageType;
  label: string;
  durationMs: number;
  /** Uploaded move sheets advance one frame every ACTION_SHEET_FRAME_MS. */
  frameDurationMs: number;
  frames: number;
}

/**
 * Authored action sheets that are not attack-style sheets. Values are the
 * unscaled base durations; presenters apply the current combat playback
 * multiplier when they schedule an action.
 */
export const UNC_ACTION_FRAMES = {
  guard: 25,
  health: 21,
  special: 41,
  death: 41,
  hurt: 21,
  idle: 17,
} as const;

export const UNC_ACTION_DURATIONS = {
  guard: actionSheetDurationMs(UNC_ACTION_FRAMES.guard),
  health: actionSheetDurationMs(UNC_ACTION_FRAMES.health),
  special: actionSheetDurationMs(UNC_ACTION_FRAMES.special),
  death: actionSheetDurationMs(UNC_ACTION_FRAMES.death),
  hurt: actionSheetDurationMs(UNC_ACTION_FRAMES.hurt),
  // The idle loop keeps its original relaxed 200ms cadence.
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
    durationMs: actionSheetDurationMs(25),
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: 25,
  },
  bludgeoning: {
    damageType: "bludgeoning",
    label: "Punch",
    durationMs: actionSheetDurationMs(17),
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: 17,
  },
  wind: {
    damageType: "wind",
    label: "Wind",
    durationMs: actionSheetDurationMs(25),
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: 25,
  },
  acid: {
    damageType: "acid",
    label: "Acid",
    durationMs: actionSheetDurationMs(9),
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: 9,
  },
  cold: {
    damageType: "cold",
    label: "Cold",
    durationMs: actionSheetDurationMs(25),
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: 25,
  },
  fire: {
    damageType: "fire",
    label: "Fire",
    durationMs: actionSheetDurationMs(25),
    frameDurationMs: ACTION_SHEET_FRAME_MS,
    frames: 25,
  },
};
