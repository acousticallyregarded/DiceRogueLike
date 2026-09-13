/**
 * Authored Alan-a-Dale animation timings.
 *
 * These are the unscaled sheet durations. Combat presenters apply the
 * committed playback speed when scheduling an action so a reload cannot
 * change the pace of an in-flight animation.
 */
export const BARD_DURATIONS = {
  electric: 8200,
  bludgeoning: 4200,
  magic: 5800,
  idle: 4200,
  hurt: 5000,
  death: 5000,
  walk: 4200,
} as const;