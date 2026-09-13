import type { EnemyState } from '../engine';
import { speciesKeyForName } from '../bestiary';

/** Size the visible body, excluding transparent margins in uploaded frames.
 * Hero's 112px frame contains about 109px of visible body.
 */
export function getCombatActorSize(enemy: EnemyState) {
  const species = enemy.speciesKey ?? speciesKeyForName(enemy.name);
  const proportions = enemy.boss
    ? { frame: 140, body: 100, bottom: 20, height: 170, slot: 120 }
    : species === 'wolf'
      ? { frame: 132, body: 76, bottom: 26, height: 76 * 160 / 132, slot: 100 }
    : species === 'winter_wolf'
      ? { frame: 128, body: 62, bottom: 33, height: 62 * 240 / 128, slot: 120 }
    : species === 'goblin'
      ? { frame: 96, body: 65, bottom: 15, height: 116, slot: 76 }
      : species === 'skeleton'
        ? { frame: 96, body: 57, bottom: 20, height: 120, slot: 76 }
        : species === 'mummy'
          ? { frame: 100, body: 68, bottom: 17, height: 124, slot: 76 }
          : species === 'ogre'
            ? { frame: 100, body: 70, bottom: 15, height: 136, slot: 80 }
            : null;
  if (!proportions) return null;
  const scale = proportions.height / proportions.body;
  return {
    slotWidth: proportions.slot,
    bodyHeight: proportions.height,
    frameSize: proportions.frame * scale,
    bottomOffset: -proportions.bottom * scale,
  };
}