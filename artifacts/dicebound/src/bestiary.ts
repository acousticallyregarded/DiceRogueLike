/**
 * Dicebound's compact monster reference.
 *
 * The damage traits in this file are adapted from the SRD 5.1 creature
 * entries. Dicebound uses these traits in its deliberate turn-based combat
 * rather than trying to reproduce the full D&D ruleset.
 */

export type DamageType =
  | "slashing"
  | "piercing"
  | "bludgeoning"
  | "fire"
  | "cold"
  | "lightning"
  | "acid"
  | "poison"
  | "necrotic";

export type PhysicalDamageType = "slashing" | "piercing" | "bludgeoning";
export type MonsterSpeciesKey =
  | "wolf"
  | "goblin"
  | "skeleton"
  | "ochre_jelly"
  | "ogre"
  | "winter_wolf"
  | "mummy";

export type MonsterArtKey = "wolf" | "goblin" | "skeleton" | "slime" | "boss";

export interface DamageTrait {
  damageType: DamageType;
  /**
   * Mummy's physical resistance only applies to nonmagical weapons. Every
   * physical attack style in Dicebound is explicitly nonmagical.
   */
  nonmagicalOnly?: boolean;
}

export interface BestiaryEntry {
  key: MonsterSpeciesKey;
  name: string;
  family: string;
  blurb: string;
  tactic: string;
  artKey: MonsterArtKey;
  resistances: DamageTrait[];
  vulnerabilities: DamageTrait[];
  immunities: DamageTrait[];
}

const trait = (damageType: DamageType, nonmagicalOnly = false): DamageTrait => ({
  damageType,
  ...(nonmagicalOnly ? { nonmagicalOnly: true } : {}),
});

/**
 * Stable species keys are intentionally independent of display names and
 * sprite names. This keeps old saves and future art changes safe to migrate.
 */
export const BESTIARY: Record<MonsterSpeciesKey, BestiaryEntry> = {
  wolf: {
    key: "wolf",
    name: "Wolf",
    family: "Beast",
    blurb: "A swift pack hunter that relies on pressure, not damage tricks.",
    tactic: "No damage traits. Keep a steady stance and finish it quickly.",
    artKey: "wolf",
    resistances: [],
    vulnerabilities: [],
    immunities: [],
  },
  goblin: {
    key: "goblin",
    name: "Goblin",
    family: "Humanoid",
    blurb: "A nimble raider with no special damage resistance.",
    tactic: "No damage traits. Choose the stance that fits your plan.",
    artKey: "goblin",
    resistances: [],
    vulnerabilities: [],
    immunities: [],
  },
  skeleton: {
    key: "skeleton",
    name: "Skeleton",
    family: "Undead",
    blurb: "Animated bones that shrug off toxins but splinter under blunt force.",
    tactic: "Use bludgeoning; poison is completely ineffective.",
    artKey: "skeleton",
    resistances: [],
    vulnerabilities: [trait("bludgeoning")],
    immunities: [trait("poison")],
  },
  ochre_jelly: {
    key: "ochre_jelly",
    name: "Ochre Jelly",
    family: "Ooze",
    blurb: "A corrosive ooze that divides around blades and crackles harmlessly under lightning.",
    tactic: "Use fire, cold, or piercing. Never rely on acid, lightning, or slashing.",
    artKey: "slime",
    resistances: [trait("acid")],
    vulnerabilities: [],
    immunities: [trait("lightning"), trait("slashing")],
  },
  ogre: {
    key: "ogre",
    name: "Ogre",
    family: "Giant",
    blurb: "A towering bruiser with no special damage traits.",
    tactic: "No damage traits. Exploit its slow attack cycle.",
    artKey: "goblin",
    resistances: [],
    vulnerabilities: [],
    immunities: [],
  },
  winter_wolf: {
    key: "winter_wolf",
    name: "Winter Wolf",
    family: "Monstrosity",
    blurb: "An icy predator whose hide turns frost into harmless rime.",
    tactic: "Cold is ineffective; fire is not a vulnerability, so use any viable stance.",
    artKey: "wolf",
    resistances: [],
    vulnerabilities: [],
    immunities: [trait("cold")],
  },
  mummy: {
    key: "mummy",
    name: "Mummy",
    family: "Undead",
    blurb: "A cursed guardian resistant to nonmagical weapons and untouched by poison or necrotic force.",
    tactic: "Use an elemental stance. Physical stances are nonmagical and deal half damage.",
    artKey: "skeleton",
    resistances: [
      trait("bludgeoning", true),
      trait("piercing", true),
      trait("slashing", true),
    ],
    vulnerabilities: [trait("fire")],
    immunities: [trait("necrotic"), trait("poison")],
  },
};

export const BESTIARY_ENTRIES = Object.values(BESTIARY);

export const ATTACK_STYLES: ReadonlyArray<{
  id: DamageType;
  label: string;
  damageType: DamageType;
  description: string;
  magical: boolean;
}> = [
  { id: "slashing", label: "Slash", damageType: "slashing", description: "A quick nonmagical blade stance.", magical: false },
  { id: "piercing", label: "Pierce", damageType: "piercing", description: "A focused nonmagical point stance.", magical: false },
  { id: "bludgeoning", label: "Bludgeon", damageType: "bludgeoning", description: "A crushing nonmagical impact stance.", magical: false },
  { id: "fire", label: "Ember", damageType: "fire", description: "An adapted Dicebound arcane stance.", magical: true },
  { id: "cold", label: "Frost", damageType: "cold", description: "An adapted Dicebound arcane stance.", magical: true },
  { id: "acid", label: "Acid", damageType: "acid", description: "An adapted Dicebound arcane stance.", magical: true },
  { id: "lightning", label: "Spark", damageType: "lightning", description: "An adapted Dicebound arcane stance.", magical: true },
];

export const DEFAULT_DAMAGE_TYPE: DamageType = "slashing";

export function isDamageType(value: unknown): value is DamageType {
  return typeof value === "string" && (
    value === "slashing"
    || value === "piercing"
    || value === "bludgeoning"
    || value === "fire"
    || value === "cold"
    || value === "lightning"
    || value === "acid"
    || value === "poison"
    || value === "necrotic"
  );
}

export function isAttackStyle(value: unknown): value is typeof ATTACK_STYLES[number]["id"] {
  return ATTACK_STYLES.some(style => style.id === value);
}

/**
 * Return undefined for unknown names on purpose. An old/custom boss should
 * remain neutral rather than inheriting a made-up weakness.
 */
export function speciesKeyForName(name: unknown): MonsterSpeciesKey | undefined {
  if (typeof name !== "string") return undefined;
  const normalized = name.trim().toLowerCase().replace(/[^a-z]+/g, " ");
  if (normalized.includes("ochre jelly") || normalized === "slime" || normalized.includes("jelly")) return "ochre_jelly";
  if (normalized.includes("winter wolf") || normalized === "dire wolf") return "winter_wolf";
  if (normalized.includes("skeleton king")) return "skeleton";
  if (normalized.includes("skeleton")) return "skeleton";
  if (normalized.includes("goblin")) return "goblin";
  if (normalized.includes("wolf")) return "wolf";
  if (normalized.includes("ogre") || normalized.includes("orc warlord")) return "ogre";
  if (normalized.includes("mummy")) return "mummy";
  return undefined;
}

export function getBestiaryEntry(speciesKey: unknown): BestiaryEntry | undefined {
  if (typeof speciesKey !== "string") return undefined;
  const direct = BESTIARY[speciesKey as MonsterSpeciesKey];
  if (direct) return direct;
  const inferred = speciesKeyForName(speciesKey);
  return inferred ? BESTIARY[inferred] : undefined;
}

export function getMonsterArtKey(
  speciesKey: unknown,
  explicitArtKey?: unknown,
): MonsterArtKey {
  if (
    explicitArtKey === "wolf"
    || explicitArtKey === "goblin"
    || explicitArtKey === "skeleton"
    || explicitArtKey === "slime"
    || explicitArtKey === "boss"
  ) return explicitArtKey;
  return getBestiaryEntry(speciesKey)?.artKey ?? "wolf";
}

export function hasTrait(
  traits: DamageTrait[],
  damageType: DamageType,
  isMagical = false,
): boolean {
  return traits.some(item => (
    item.damageType === damageType
    && (!item.nonmagicalOnly || !isMagical)
  ));
}

export function getDamageModifier(
  speciesKey: unknown,
  damageType: DamageType,
  isMagical = false,
): { kind: "immune" | "resisted" | "vulnerable" | "normal"; multiplier: number } {
  const normalizedSpeciesKey = getBestiaryEntry(speciesKey)
    ? speciesKey
    : speciesKeyForName(speciesKey);
  const entry = getBestiaryEntry(normalizedSpeciesKey);
  if (!entry) return { kind: "normal", multiplier: 1 };
  if (hasTrait(entry.immunities, damageType, isMagical)) return { kind: "immune", multiplier: 0 };
  if (hasTrait(entry.vulnerabilities, damageType, isMagical)) return { kind: "vulnerable", multiplier: 2 };
  if (hasTrait(entry.resistances, damageType, isMagical)) return { kind: "resisted", multiplier: 0.5 };
  return { kind: "normal", multiplier: 1 };
}

export function formatDamageType(damageType: DamageType): string {
  return damageType.charAt(0).toUpperCase() + damageType.slice(1);
}