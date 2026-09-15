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

export type BardMove = "sleep" | "cutting_words" | "electric";
export type BardAttackKind = `bard_${BardMove}`;

/**
 * Bard actions are deliberate abilities rather than attack-style unlocks.
 * Keeping their damage metadata here lets timing and combat use the same
 * authored move contract without adding the abilities to the normal menu.
 */
export const BARD_MOVES = {
  sleep: {
    damageType: "psychic",
    durationMs: BARD_DURATIONS.magic,
    magical: true,
    zeroDamage: true,
  },
  cutting_words: {
    damageType: "psychic",
    durationMs: BARD_DURATIONS.magic,
    magical: true,
    zeroDamage: false,
  },
  electric: {
    damageType: "lightning",
    durationMs: BARD_DURATIONS.electric,
    magical: true,
    zeroDamage: false,
  },
} as const;

/** Alias retained for callers that describe these as attacks. */
export const BARD_ATTACKS = BARD_MOVES;