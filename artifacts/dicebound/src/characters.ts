import type { Skill } from "./engine";
import type { DamageType } from "./bestiary";

export type CharacterId = "john" | "unc" | "alan-a-dale";

export interface CharacterDefinition {
  id: CharacterId;
  name: string;
  className: string;
  description: string;
  baseStats: {
    maxHp: number;
    attack: number;
    defense: number;
    speed: number;
  };
  startingSkills: Skill[];
  startingDamageType: DamageType;
}

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  john: {
    id: "john",
    name: "John",
    className: "Fighter",
    description: "A dependable fighter with balanced fundamentals.",
    baseStats: {
      maxHp: 100,
      attack: 10,
      defense: 2,
      speed: 40,
    },
    startingSkills: [],
    startingDamageType: "slashing",
  },
  unc: {
    id: "unc",
    name: "Unc",
    className: "Magic User",
    description: "A spellcaster who begins with fire and cold attack styles.",
    baseStats: {
      maxHp: 80,
      attack: 12,
      defense: 1,
      speed: 40,
    },
    startingSkills: [
      {
        id: "s_fire",
        name: "Ember",
        description: "Learn the fire attack style",
        type: "fire",
      },
      {
        id: "s_cold",
        name: "Frost",
        description: "Learn the cold attack style",
        type: "cold",
      },
    ],
    startingDamageType: "fire",
  },
  "alan-a-dale": {
    id: "alan-a-dale",
    name: "Alan-a-Dale",
    className: "Bard",
    description: "A bard whose songs heal from damage dealt and strengthen combat defense.",
    baseStats: {
      maxHp: 95,
      attack: 9,
      defense: 2,
      speed: 45,
    },
    startingSkills: [
      {
        id: "s_restorative_refrain",
        name: "Restorative Refrain",
        description: "Heal for 10% of damage dealt",
        type: "vampire",
      },
      {
        id: "s_inspiring_melody",
        name: "Inspiring Melody",
        description: "+20% Defense in combat",
        type: "defense_boost",
      },
    ],
    startingDamageType: "slashing",
  },
};

export function getCharacter(id?: string): CharacterDefinition {
  if (id === "john" || id === "unc" || id === "alan-a-dale") {
    return CHARACTERS[id];
  }
  return CHARACTERS.john;
}