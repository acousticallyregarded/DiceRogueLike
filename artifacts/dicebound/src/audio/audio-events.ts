import type { DamageType } from "../bestiary";
import type { GameStateV4, RunState } from "../engine";

export type AudioTransitionEvent =
  | { type: "dice-roll" }
  | { type: "consumable"; consumable: "health_potion" | "fire_bomb" }
  | { type: "weapon-hit"; damageType: "slashing" | "piercing" | "bludgeoning" }
  | { type: "hero-hit" };

function enemyDamageCommitted(previous: RunState, current: RunState): boolean {
  const currentById = new Map(current.enemies.map(enemy => [enemy.id, enemy]));
  return previous.enemies.some(previousEnemy => {
    const nextEnemy = currentById.get(previousEnemy.id);
    // A removed enemy was killed by this transition. Otherwise compare the
    // committed HP values, not a presentation animation.
    return nextEnemy
      ? nextEnemy.hp < previousEnemy.hp
      : previousEnemy.hp > 0;
  });
}

function attackSequenceAdvanced(previous: RunState, current: RunState): boolean {
  return (current.playerCombat?.heroAttackSequence ?? 0)
    > (previous.playerCombat?.heroAttackSequence ?? 0);
}

function consumableSequenceAdvanced(previous: RunState, current: RunState): boolean {
  return (current.playerCombat?.heroConsumableSequence ?? 0)
    > (previous.playerCombat?.heroConsumableSequence ?? 0);
}

/**
 * Converts two committed reducer states into one-shot presentation events.
 * Keeping this pure makes it impossible for selection/inspection/reload
 * renders to replay an attack sound.
 */
export function getAudioTransitionEvents(
  previous: GameStateV4 | null,
  current: GameStateV4,
): AudioTransitionEvent[] {
  if (!previous || !current.run || !previous.run) return [];

  const previousRun = previous.run;
  const currentRun = current.run;
  const events: AudioTransitionEvent[] = [];

  if (
    currentRun.phase === "moving"
    && currentRun.rollAnimating === true
    && previousRun.rollAnimating !== true
  ) {
    events.push({ type: "dice-roll" });
  }

  const potionOrBombCommitted = consumableSequenceAdvanced(previousRun, currentRun);
  if (potionOrBombCommitted && currentRun.playerCombat?.lastConsumable === "health_potion") {
    events.push({ type: "consumable", consumable: "health_potion" });
  }
  if (
    potionOrBombCommitted
    && currentRun.playerCombat?.lastConsumable === "fire_bomb"
    && currentRun.playerCombat.pendingFireBomb === true
  ) {
    events.push({ type: "consumable", consumable: "fire_bomb" });
  }

  // Only a real HP delta from a committed player attack produces a weapon
  // sound. Ember/fire and other magical stances do not borrow a sword sample.
  const pendingImpact = previousRun.playerCombat?.pendingHeroAttack;
  const impactLanded = Boolean(pendingImpact && !currentRun.playerCombat?.pendingHeroAttack);
  const committedDamageType = pendingImpact?.damageType ?? currentRun.selectedDamageType;
  if (
    previousRun.phase === "combat"
    && (impactLanded || attackSequenceAdvanced(previousRun, currentRun))
    && enemyDamageCommitted(previousRun, currentRun)
    && currentRun.combatFeedback?.amount
    && currentRun.combatFeedback.damageType === committedDamageType
  ) {
    const damageType = committedDamageType as DamageType;
    if (damageType === "slashing" || damageType === "piercing" || damageType === "bludgeoning") {
      events.push({ type: "weapon-hit", damageType });
    }
  }

  // One reducer response can increment this once per living enemy. The audio
  // event intentionally stays singular so a pack cannot produce stacked hits.
  if (
    previousRun.phase === "combat"
    && (currentRun.playerCombat?.enemyAttackSequence ?? 0)
      > (previousRun.playerCombat?.enemyAttackSequence ?? 0)
  ) {
    events.push({ type: "hero-hit" });
  }

  return events;
}