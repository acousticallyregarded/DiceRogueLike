export type BossId = "skeleton-king" | "grubgut" | "silkmaw" | "cinder";
export type BiomeId = "forest" | "swamp" | "webwood" | "ashlands";

export interface LevelDefinition {
  floor: number;
  name: string;
  biome: BiomeId;
  description: string;
  boss: { id: BossId; name: string; arena: string; description: string };
}

export const LEVELS: readonly LevelDefinition[] = [
  {
    floor: 1, name: "The Forest Trail", biome: "forest",
    description: "Follow the forest trail to the ancient king's platform.",
    boss: { id: "skeleton-king", name: "Skeleton King", arena: "The King's Platform", description: "The ancient guardian of the forest." },
  },
  {
    floor: 2, name: "Mirebridge Marsh", biome: "swamp",
    description: "Cross mossy paths and misty wetlands to a ruined stone bridge.",
    boss: { id: "grubgut", name: "Grubgut, the Troll King", arena: "The Broken Bridge", description: "A regenerating troll monarch with a tree-trunk club and poisonous breath." },
  },
  {
    floor: 3, name: "Silkmaw's Hollow", biome: "webwood",
    description: "Travel through a web-covered forest to a colossal hollow tree.",
    boss: { id: "silkmaw", name: "Lady Silkmaw, the Spider Queen", arena: "The Hollow Throne", description: "A venomous queen who snares her prey and calls her brood." },
  },
  {
    floor: 4, name: "The Cinder March", biome: "ashlands",
    description: "Climb through a burned forest toward the gates of a ruined fortress.",
    boss: { id: "cinder", name: "Sir Cinder, the Ashen Knight", arena: "The Ashen Gate", description: "A black-armored knight whose burning sword grows fiercer as his armor cracks." },
  },
];

export function getLevelDefinition(floor: number): LevelDefinition {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, Math.floor(floor || 1) - 1))];
}

/** Match the saved enemy, not only the floor, so legacy King fights keep their art. */
export function getBossId(enemy: { boss?: boolean; name: string }): BossId | null {
  if (!enemy.boss) return null;
  if (enemy.name.startsWith("Grubgut")) return "grubgut";
  if (enemy.name.includes("Silkmaw")) return "silkmaw";
  if (enemy.name.includes("Cinder")) return "cinder";
  return "skeleton-king";
}

export function getBossDeathDurationMs(enemy: { boss?: boolean; name: string }): number {
  return getBossId(enemy) === "skeleton-king" ? 5200 : 1800;
}

export function getBossMovePresentation(enemy: {
  boss?: boolean; name: string; bossMove?: string; lastBossAttack?: string;
}): { label: string; kind: "melee" | "ranged" | "support"; durationMs: number } {
  switch (enemy.bossMove) {
    case "club": return { label: "Bridgebreaker", kind: "melee", durationMs: 1800 };
    case "poison_belch": return { label: "Swamp Belch", kind: "ranged", durationMs: 4200 };
    case "regen": return { label: "Troll Regeneration", kind: "support", durationMs: 2200 };
    case "venom_bite": return { label: "Venom Lunge", kind: "melee", durationMs: 1800 };
    case "web": return { label: "Royal Web", kind: "ranged", durationMs: 2200 };
    case "summon_brood": return { label: "Brood Call", kind: "support", durationMs: 2400 };
    case "slash": return { label: "Executioner's Slash", kind: "melee", durationMs: 1800 };
    case "fire_wave": return { label: "Cinder Wave", kind: "ranged", durationMs: 4200 };
    case "rage": return { label: "Furnace Rage", kind: "support", durationMs: 2400 };
    default: return enemy.lastBossAttack === "fireball"
      ? { label: "Fireball", kind: "ranged", durationMs: 4200 }
      : { label: "Sword Strike", kind: "melee", durationMs: 1800 };
  }
}