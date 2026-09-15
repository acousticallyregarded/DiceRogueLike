import { MAX_SAVE_BYTES } from "./wallet-security";

export interface SaveValidationSuccess {
  ok: true;
  value: Record<string, unknown>;
}

export interface SaveValidationFailure {
  ok: false;
  reason: string;
}

export type SaveValidationResult = SaveValidationSuccess | SaveValidationFailure;

const tileTypes = new Set([
  "start",
  "enemy",
  "elite",
  "event",
  "shop",
  "rest",
  "minigame",
  "boss",
]);
const phases = new Set([
  "explore",
  "moving",
  "combat",
  "boss_awakening",
  "boss_ready",
  "level_up",
  "shop",
  "event_test_of_might",
  "rest",
  "minigame",
  "victory",
  "defeat",
]);
const itemTypes = new Set(["weapon", "armor", "accessory"]);
const rarities = new Set(["common", "uncommon", "rare", "epic", "legendary"]);
const damageTypes = new Set([
  "slashing",
  "bludgeoning",
  "piercing",
  "fire",
  "cold",
  "acid",
  "poison",
  "lightning",
  "necrotic",
  "wind",
  "psychic",
]);
const bossMoves = new Set([
  "sword",
  "fireball",
  "club",
  "poison_belch",
  "regen",
  "venom_bite",
  "web",
  "summon_brood",
  "slash",
  "fire_wave",
  "rage",
]);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(
  value: unknown,
  min = -1_000_000_000,
  max = 1_000_000_000,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function integer(
  value: unknown,
  min = -1_000_000_000,
  max = 1_000_000_000,
): value is number {
  return finiteNumber(value, min, max) && Number.isInteger(value);
}

function string(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function nullableString(value: unknown, maxLength: number): boolean {
  return value === null || string(value, maxLength);
}

function boundedArray(value: unknown, maxLength: number): value is unknown[] {
  return Array.isArray(value) && value.length <= maxLength;
}

function hasKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function validItem(value: unknown): boolean {
  if (!record(value)) return false;
  if (
    !onlyKeys(value, ["id", "name", "type", "stats", "rarity"]) ||
    !string(value.id, 200) ||
    !string(value.name, 200) ||
    typeof value.type !== "string" ||
    !itemTypes.has(value.type) ||
    typeof value.rarity !== "string" ||
    !rarities.has(value.rarity) ||
    !record(value.stats)
  ) {
    return false;
  }
  const stats = value.stats;
  if (!record(stats)) return false;
  const statKeys = ["attack", "defense", "speed", "maxHp"];
  return Object.keys(value.stats).every(
    (key) => statKeys.includes(key) && finiteNumber(stats[key], -1_000_000, 1_000_000),
  );
}

function validMeta(meta: unknown): meta is Record<string, unknown> {
  if (!record(meta)) return false;
  if (
    !onlyKeys(meta, ["version", "gems", "talents", "inventory", "equipped"]) ||
    !hasKeys(meta, ["version", "gems", "talents", "inventory", "equipped"]) ||
    meta.version !== 4 ||
    !integer(meta.gems, 0, 1_000_000_000) ||
    !record(meta.talents) ||
    !onlyKeys(meta.talents, ["vitality", "quickness", "power"]) ||
    !hasKeys(meta.talents, ["vitality", "quickness", "power"]) ||
    !integer(meta.talents.vitality, 0, 100_000) ||
    !integer(meta.talents.quickness, 0, 100_000) ||
    !integer(meta.talents.power, 0, 100_000) ||
    !boundedArray(meta.inventory, 2_000) ||
    !record(meta.equipped) ||
    !onlyKeys(meta.equipped, ["weapon", "armor", "accessory"]) ||
    !hasKeys(meta.equipped, ["weapon", "armor", "accessory"]) ||
    !nullableString(meta.equipped.weapon, 200) ||
    !nullableString(meta.equipped.armor, 200) ||
    !nullableString(meta.equipped.accessory, 200)
  ) {
    return false;
  }
  return meta.inventory.every(validItem);
}

function validTile(value: unknown): boolean {
  return (
    record(value) &&
    integer(value.id, 0, 1_000) &&
    typeof value.type === "string" &&
    tileTypes.has(value.type)
  );
}

function validEnemy(value: unknown): boolean {
  if (
    !record(value) ||
    !string(value.id, 200) ||
    !string(value.name, 200) ||
    !finiteNumber(value.hp, -1_000_000, 1_000_000) ||
    !finiteNumber(value.maxHp, 0, 1_000_000) ||
    !finiteNumber(value.attack, -1_000_000, 1_000_000) ||
    !finiteNumber(value.defense, -1_000_000, 1_000_000) ||
    !finiteNumber(value.speed, -1_000_000, 1_000_000)
  ) {
    return false;
  }
  if (value.speciesKey !== undefined && !string(value.speciesKey, 100)) return false;
  if (value.artKey !== undefined && !string(value.artKey, 100)) return false;
  for (const key of [
    "attackTimer",
    "poisonTimerMs",
    "sleepTurns",
    "bossTurnCounter",
    "bossSummonsUsed",
  ]) {
    if (value[key] !== undefined && !finiteNumber(value[key], -1_000_000, 1_000_000)) {
      return false;
    }
  }
  for (const key of ["poisoned", "boss", "stunned", "attackDisadvantage"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") return false;
  }
  if (value.damageType !== undefined && (typeof value.damageType !== "string" || !damageTypes.has(value.damageType))) {
    return false;
  }
  if (value.lastBossAttack !== undefined && value.lastBossAttack !== "sword" && value.lastBossAttack !== "fireball") {
    return false;
  }
  if (value.bossMove !== undefined && (
    typeof value.bossMove !== "string" || !bossMoves.has(value.bossMove)
  )) {
    return false;
  }
  for (const key of ["bossRegenSuppressed", "bossRageActive"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") return false;
  }
  return true;
}

function validSkill(value: unknown): boolean {
  return (
    record(value) &&
    string(value.id, 200) &&
    string(value.name, 200) &&
    string(value.description, 2_000) &&
    string(value.type, 100)
  );
}

function validShopItem(value: unknown): boolean {
  if (
    !record(value) ||
    !string(value.id, 200) ||
    !string(value.name, 200) ||
    !string(value.description, 2_000) ||
    !finiteNumber(value.cost, 0, 1_000_000_000) ||
    !string(value.type, 100) ||
    !integer(value.stock, -1_000, 1_000)
  ) {
    return false;
  }
  if (value.stat !== undefined && !string(value.stat, 50)) return false;
  if (value.value !== undefined && !finiteNumber(value.value)) return false;
  if (value.consumable !== undefined && !string(value.consumable, 100)) return false;
  return value.skill === undefined || validSkill(value.skill);
}

function validPlayerCombat(value: unknown): boolean {
  if (value === null) return true;
  if (!record(value)) return false;
  for (const key of [
    "attackTimer",
    "roundCounter",
    "heroAttackSequence",
    "heroConsumableSequence",
    "enemyAttackSequence",
  ]) {
    if (value[key] !== undefined && !integer(value[key], 0, 1_000_000_000)) return false;
  }
  for (const key of ["firstAttackPending", "pendingFireBomb", "heroImpactResolved", "holdMyBeerUsed", "takedownUsed"]) {
    if (value[key] !== undefined && typeof value[key] !== "boolean") return false;
  }
  if (value.lastConsumable !== undefined && value.lastConsumable !== null && !string(value.lastConsumable, 100)) return false;
  if (value.attackDamageType !== undefined && (typeof value.attackDamageType !== "string" || !damageTypes.has(value.attackDamageType))) {
    return false;
  }
  if (value.lastAttackKind !== undefined && !string(value.lastAttackKind, 100)) return false;
  if (value.pendingHeroAttack !== undefined) {
    const pending = value.pendingHeroAttack;
    if (
      !record(pending) ||
      !string(pending.targetId, 200) ||
      !string(pending.kind, 100) ||
      typeof pending.damageType !== "string" ||
      !damageTypes.has(pending.damageType)
    ) {
      return false;
    }
  }
  if (value.pendingBossDeath !== undefined && (
    !record(value.pendingBossDeath) ||
    value.pendingBossDeath.boss !== true ||
    !string(value.pendingBossDeath.name, 200)
  )) {
    return false;
  }
  return true;
}

function validRun(run: unknown): run is Record<string, unknown> {
  if (!record(run)) return false;
  const requiredNumbers = [
    "hp",
    "maxHp",
    "attack",
    "defense",
    "speed",
    "gold",
    "gemsEarned",
    "xp",
    "level",
    "queuedLevels",
    "bossRollsLeft",
    "floor",
    "position",
    "stepsRemaining",
    "shopRerollCost",
  ];
  if (!requiredNumbers.every((key) => finiteNumber(run[key], -1_000_000_000, 1_000_000_000))) return false;
  if (typeof run.phase !== "string" || !phases.has(run.phase)) return false;
  if (run.combatTurn !== "player" && run.combatTurn !== "enemy") return false;
  if (
    typeof run.guardActive !== "boolean" ||
    typeof run.isBossCombat !== "boolean" ||
    typeof run.settled !== "boolean" ||
    !boundedArray(run.tiles, 500) ||
    !run.tiles.every(validTile) ||
    !boundedArray(run.enemies, 200) ||
    !run.enemies.every(validEnemy) ||
    !validPlayerCombat(run.playerCombat) ||
    !record(run.consumables) ||
    !integer(run.consumables.health_potion, 0, 1_000_000) ||
    !integer(run.consumables.fire_bomb, 0, 1_000_000) ||
    !integer(run.consumables.guard_tonic, 0, 1_000_000) ||
    typeof run.selectedDamageType !== "string" ||
    !damageTypes.has(run.selectedDamageType) ||
    !boundedArray(run.skills, 200) ||
    !run.skills.every(validSkill) ||
    !(run.skillOptions === null || (boundedArray(run.skillOptions, 200) && run.skillOptions.every(validSkill))) ||
    !(run.shopItems === null || (boundedArray(run.shopItems, 200) && run.shopItems.every(validShopItem))) ||
    !boundedArray(run.log, 2_000)
  ) {
    return false;
  }
  if (
    !run.log.every(
      (entry) => record(entry) && string(entry.id, 200) && string(entry.msg, 4_000),
    )
  ) {
    return false;
  }
  if (
    run.lastRolls !== null &&
    (!Array.isArray(run.lastRolls) ||
      run.lastRolls.length !== 2 ||
      !run.lastRolls.every((roll) => integer(roll, 1, 6)))
  ) {
    return false;
  }
  for (const key of ["combatSpeed"]) {
    if (run[key] !== undefined && finiteNumber(run[key], 0.01, 100) === false) return false;
  }
  for (const key of [
    "trailIntroSeen",
    "trailAlertSeen",
    "trailAwakeningSeen",
    "pendingTileTrigger",
    "rollAnimating",
    "heroDeathPending",
  ]) {
    if (run[key] !== undefined && typeof run[key] !== "boolean") return false;
  }
  for (const key of ["heroHinderedTurns", "settledGold", "settledGems"]) {
    if (run[key] !== undefined && !finiteNumber(run[key], 0, 1_000_000_000)) return false;
  }
  if (run.trailCinematic !== undefined && run.trailCinematic !== null && !string(run.trailCinematic, 50)) return false;
  if (run.characterId !== undefined && !string(run.characterId, 100)) return false;
  if (run.victoryReport !== undefined && run.victoryReport !== null && !record(run.victoryReport)) return false;
  if (run.combatFeedback !== undefined && run.combatFeedback !== null && !record(run.combatFeedback)) return false;
  if (run.bardSpellFeedback !== undefined && !string(run.bardSpellFeedback, 4_000)) return false;
  return true;
}

export function validateGameStateV4(input: unknown): SaveValidationResult {
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, reason: "save_not_json" };
  }
  if (serialized === undefined) return { ok: false, reason: "save_not_json" };
  if (Buffer.byteLength(serialized, "utf8") > MAX_SAVE_BYTES) {
    return { ok: false, reason: "save_too_large" };
  }
  if (
    !record(input) ||
    !hasKeys(input, ["meta", "run"]) ||
    Object.keys(input).some((key) => key !== "meta" && key !== "run") ||
    !validMeta(input.meta) ||
    !(input.run === null || validRun(input.run))
  ) {
    return { ok: false, reason: "invalid_game_state" };
  }
  return { ok: true, value: input };
}