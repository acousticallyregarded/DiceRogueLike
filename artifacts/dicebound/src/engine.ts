import {
  ATTACK_STYLES,
  DEFAULT_DAMAGE_TYPE,
  DamageType,
  getAttackStyle,
  getAttackStylesForCharacter,
  getBestiaryEntry,
  getDamageModifier,
  isAttackStyle,
  isDamageType,
  speciesKeyForName,
  type AttackStyle,
  type MonsterSpeciesKey,
} from "./bestiary";
import { CHARACTERS, getCharacter } from "./characters";
import type { CharacterId } from "./characters";
import { UNC_ACTION_DURATIONS, UNC_MOVES } from "./unc-moves";

export { CHARACTERS, getCharacter };
export type { CharacterId } from "./characters";

function uuid() {
  return Math.random().toString(36).substring(2, 9);
}

export type TileType = "start" | "enemy" | "elite" | "event" | "shop" | "rest" | "minigame" | "boss";

export interface Tile {
  id: number;
  type: TileType;
}

export interface Item {
  id: string;
  name: string;
  type: "weapon" | "armor" | "accessory";
  stats: { attack?: number; defense?: number; speed?: number; maxHp?: number };
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

export interface MetaState {
  version: 4;
  gems: number;
  talents: { vitality: number; quickness: number; power: number };
  inventory: Item[];
  equipped: {
    weapon: string | null;
    armor: string | null;
    accessory: string | null;
  };
}

export interface EnemyState {
  id: string;
  name: string;
  /** Stable bestiary key. Optional for version 4 save compatibility. */
  speciesKey?: MonsterSpeciesKey;
  /** Explicit art identity keeps existing sprites independent of names. */
  artKey?: "wolf" | "goblin" | "skeleton" | "slime" | "boss";
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  /** Legacy save field; discrete combat does not advance this timer. */
  attackTimer?: number;
  poisoned?: boolean;
  poisonTimerMs?: number;
  damageType?: DamageType;
  boss?: boolean;
  lastBossAttack?: "sword" | "fireball";
}

export type ConsumableType = "health_potion" | "fire_bomb" | "guard_tonic";

export interface Consumables {
  health_potion: number;
  fire_bomb: number;
  guard_tonic: number;
}

export type CombatFeedbackKind = "immune" | "resisted" | "vulnerable" | "normal";

export interface CombatFeedback {
  id: string;
  kind: CombatFeedbackKind;
  damageType: DamageType;
  amount: number;
  targetName: string;
  message: string;
}

export interface PlayerCombatState {
  /** Legacy save field; discrete combat does not advance this timer. */
  attackTimer?: number;
  roundCounter: number;
  /** Explicit event counters let the scene animate only real actions. */
  heroAttackSequence?: number;
  /** Durable marker for the most recent committed consumable action. */
  lastConsumable?: ConsumableType | null;
  /** Increments once for every successful consumable action. */
  heroConsumableSequence?: number;
  /** A consumed fire bomb whose damage is waiting for its impact. */
  pendingFireBomb?: boolean;
  enemyAttackSequence?: number;
  firstAttackPending?: boolean;
  /** The style committed by the most recent player attack. */
  attackDamageType?: DamageType;
  /** Unc's one-use special is durable for the current fight. */
  holdMyBeerUsed?: boolean;
  /** The animation/action committed by the most recent player attack. */
  lastAttackKind?: "normal" | "hold_my_beer";
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  type: "poison" | "heal" | "first_strike" | "speed_boost" | "defense_boost" | "vampire" | "execute" | "combo" | "counter" | "fire" | "cold" | "acid" | "lightning" | "wind";
}

export function isAttackStyleLearned(
  run: Pick<RunState, "skills"> & { characterId?: CharacterId },
  damageType: DamageType,
): boolean {
  const style = run.characterId
    ? getAttackStylesForCharacter(run.characterId).find(candidate => candidate.id === damageType)
    : getAttackStyle(damageType);
  return Boolean(style && (!style.magical || run.skills.some(skill => skill.type === damageType)));
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: "stat" | "skill" | "heal" | "consumable";
  stat?: "attack" | "defense" | "speed" | "maxHp";
  value?: number;
  skill?: Skill;
  consumable?: ConsumableType;
  stock: number;
}

export interface RunState {
  /** Selected character identity. Old saves migrate to John without rebalance. */
  characterId?: CharacterId;
  victoryReport?: {
    id: string; boss: boolean; floor: number; xp: number; gold: number;
    gems: number; healing: number; equipment: string[]; showAt: number;
  } | null;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  /** Optional animation playback multiplier supplied by a combat presenter. */
  combatSpeed?: number;
  gold: number;
  gemsEarned: number;
  
  xp: number;
  level: number;
  queuedLevels: number;

  /** Finite trail countdown in remaining paces (legacy alias retained below). */
  bossCountdown?: number;
  bossRollsLeft: number;
  floor: number;
  
  position: number;
  tiles: Tile[];
  lastRolls: [number, number] | null;
  stepsRemaining: number;
  /**
   * Trail presentation state is durable so a refresh cannot replay a scene
   * or allow input while a scene is in progress.
   */
  trailCinematic?: "intro" | "alert" | "awakening" | null;
  trailIntroSeen?: boolean;
  trailAlertSeen?: boolean;
  trailAwakeningSeen?: boolean;
  /** A landing waiting for the alert presentation to finish. */
  pendingTileTrigger?: boolean;
  
  phase: "explore" | "moving" | "combat" | "boss_awakening" | "boss_ready" | "level_up" | "shop" | "event_test_of_might" | "rest" | "minigame" | "victory" | "defeat";
  
  enemies: EnemyState[];
  playerCombat: PlayerCombatState | null;
  /** The only state that can accept a combat action. */
  combatTurn: "player" | "enemy";
  guardActive: boolean;
  consumables: Consumables;
  isBossCombat: boolean;
  /** Player stance. Old saves default to slashing during migration. */
  selectedDamageType: DamageType;
  combatFeedback?: CombatFeedback | null;
  
  skills: Skill[];
  skillOptions: Skill[] | null;
  shopItems: ShopItem[] | null;
  shopRerollCost: number;
  
  log: { id: string, msg: string }[];
  settled: boolean;
  /**
   * The dice result is committed before the movement animation starts. This
   * marker lets the hook hold the first step until the result has been shown,
   * and is optional so version 4 saves made before dice animation was added
   * continue to load as ordinary movement.
   */
  rollAnimating?: boolean;
  /** Unc death presentation is pending before the normal defeat modal. */
  heroDeathPending?: boolean;
}

export interface GameStateV4 {
  meta: MetaState;
  run: RunState | null;
}

export const POTION_ANIMATION_DURATION_MS = 1800;
export const FIRE_BOMB_ANIMATION_DURATION_MS = 2600;
export const GUARD_TONIC_ANIMATION_DURATION_MS = 2600;
export const HERO_SWORD_ANIMATION_DURATION_MS = 2600;
export const DEFAULT_ENEMY_RESPONSE_DELAY_MS = HERO_SWORD_ANIMATION_DURATION_MS;
export const DICE_ROLL_ANIMATION_DURATION_MS = 800;
export const BOSS_AWAKENING_DURATION_MS = 2200;

type AttackTimingRun = Pick<RunState, "combatTurn" | "phase" | "playerCombat">
  & Partial<Pick<RunState, "selectedDamageType" | "skills" | "characterId">>
  & { combatSpeed?: number };

type AttackStyleRun = Pick<RunState, "selectedDamageType" | "skills">
  & {
    characterId?: CharacterId;
    playerCombat?: Pick<PlayerCombatState, "lastAttackKind"> | null;
    /** Direct marker accepted for timing callers that only have combat data. */
    lastAttackKind?: PlayerCombatState["lastAttackKind"] | "special";
  };

function fallbackDamageType(run: Pick<RunState, "skills"> & { characterId?: CharacterId }): DamageType {
  if (run.characterId === "unc") {
    return isAttackStyleLearned(run, "fire") ? "fire" : "bludgeoning";
  }
  return DEFAULT_DAMAGE_TYPE;
}

function resolveAttackStyle(run: AttackStyleRun) {
  const selected = isAttackStyle(run.selectedDamageType)
    && isAttackStyleLearned(run, run.selectedDamageType)
    ? run.selectedDamageType
    : fallbackDamageType(run);
  return getAttackStyle(selected) ?? getAttackStyle(DEFAULT_DAMAGE_TYPE)!;
}

/**
 * Return the authored attack duration before the presentation's playback
 * speed multiplier is applied. John and Alan-a-Dale retain the sword timing.
 */
export function getPlayerAttackDurationMs(run: AttackStyleRun): number {
  const lastAttackKind = run.playerCombat?.lastAttackKind ?? run.lastAttackKind;
  if (
    run.characterId === "unc"
    && (lastAttackKind === "hold_my_beer" || lastAttackKind === "special")
  ) {
    return UNC_ACTION_DURATIONS.special;
  }
  const style = resolveAttackStyle(run);
  const move = UNC_MOVES[style.damageType as keyof typeof UNC_MOVES];
  return (!run.characterId || run.characterId === "unc") && move
    ? move.durationMs
    : HERO_SWORD_ANIMATION_DURATION_MS;
}

/**
 * The enemy response delay is derived from committed state rather than UI
 * intent. This keeps saved enemy-turn consumable actions replayable after a
 * reload without consuming another item, while allowing a pending bomb to
 * defer its impact until the animation completes.
 */
export function getEnemyResponseDelayMs(run: AttackTimingRun): number {
  if (run.phase !== "combat" || run.combatTurn !== "enemy") {
    return DEFAULT_ENEMY_RESPONSE_DELAY_MS;
  }
  if (run.playerCombat?.pendingFireBomb) return FIRE_BOMB_ANIMATION_DURATION_MS;
  if (run.playerCombat?.lastConsumable === "health_potion") {
    return run.characterId === "unc"
      ? UNC_ACTION_DURATIONS.health
      : POTION_ANIMATION_DURATION_MS;
  }
  if (run.playerCombat?.lastConsumable === "guard_tonic") {
    return run.characterId === "unc"
      ? UNC_ACTION_DURATIONS.guard
      : GUARD_TONIC_ANIMATION_DURATION_MS;
  }
  const committedDamageType = run.playerCombat?.attackDamageType ?? run.selectedDamageType;
  if (run.characterId === "unc" && run.skills && committedDamageType) {
    const speed = Number.isFinite(run.combatSpeed) ? Math.max(1, run.combatSpeed!) : 1;
    return getPlayerAttackDurationMs({
      selectedDamageType: committedDamageType,
      skills: run.skills,
      characterId: run.characterId,
      playerCombat: run.playerCombat,
    }) / speed;
  }
  return DEFAULT_ENEMY_RESPONSE_DELAY_MS;
}

/** Backwards-compatible name for callers that describe this as a turn delay. */
export const getEnemyTurnDelay = getEnemyResponseDelayMs;

export type GameAction =
  | { type: "DISMISS_VICTORY_REPORT" }
  | { type: "START_RUN"; characterId?: CharacterId }
  | { type: "ROLL_DICE" }
  | { type: "BEGIN_MOVEMENT" }
  | { type: "STEP_MOVE" }
  | { type: "FINISH_TRAIL_CINEMATIC" }
  | { type: "COMPLETE_BOSS_AWAKENING" }
  | { type: "FIGHT_BOSS" }
  | { type: "SELECT_ATTACK"; damageType: DamageType }
  | { type: "PLAYER_ATTACK"; targetId?: string }
  | { type: "UNC_HOLD_MY_BEER"; targetId?: string }
  | { type: "USE_CONSUMABLE"; consumable: ConsumableType }
  | { type: "RESOLVE_ENEMY_TURN" }
  | { type: "FINISH_HERO_DEATH" }
  | { type: "CHOOSE_SKILL"; skillId: string }
  | { type: "BUY_SHOP"; itemId: string }
  | { type: "REROLL_SHOP" }
  | { type: "LEAVE_SHOP" }
  | { type: "TEST_OF_MIGHT_ENTER" }
  | { type: "TEST_OF_MIGHT_LEAVE" }
  | { type: "REST_HEAL" }
  | { type: "REST_TRAIN" }
  | { type: "PLAY_MINIGAME" }
  | { type: "LEAVE_MINIGAME" }
  | { type: "CONTINUE_POST_COMBAT" }
  | { type: "RETURN_TO_LOBBY" }
  | { type: "CONTINUE_RUN" }
  | { type: "OPEN_CHEST" }
  | { type: "EQUIP_ITEM"; itemId: string }
  | { type: "UNEQUIP_ITEM"; slot: "weapon" | "armor" | "accessory" }
  | { type: "BUY_TALENT"; stat: "vitality" | "quickness" | "power" }
  | { type: "RESET_SAVE" };

/** Number of paces in the finite first-level forest trail. */
export const TRAIL_TILE_COUNT = 64;
const ALERT_REMAINING_PACES = 15;

export type DiceRoll = [number, number];

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Roll the two six-sided dice used for board movement. */
export function rollTwoDice(): DiceRoll {
  return [rollD6(), rollD6()];
}

function isDiceFace(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

function isDiceRoll(value: unknown): value is DiceRoll {
  return Array.isArray(value) && value.length === 2 && isDiceFace(value[0]) && isDiceFace(value[1]);
}

export type WalkDirection = "south-east" | "south-west" | "north-west" | "north-east";

/** Grid deltas for the four diagonal views used by the perimeter walk. */
export const WALK_DIRECTION_DELTAS: Record<WalkDirection, { x: number; y: number }> = {
  "south-east": { x: 1, y: 0 },
  "south-west": { x: 0, y: 1 },
  "north-west": { x: -1, y: 0 },
  "north-east": { x: 0, y: -1 },
};

const WALK_DIRECTION_BY_DELTA = Object.fromEntries(
  Object.entries(WALK_DIRECTION_DELTAS).map(([direction, delta]) => [
    `${delta.x},${delta.y}`,
    direction,
  ]),
) as Record<string, WalkDirection>;

function getBoardGridCoords(index: number) {
  if (index < 7) return { x: index, y: 0 };
  if (index < 13) return { x: 6, y: index - 6 };
  if (index < 19) return { x: 6 - (index - 12), y: 6 };
  return { x: 0, y: 6 - (index - 18) };
}

function normalizeBoardIndex(index: number) {
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  return Math.min(TRAIL_TILE_COUNT - 1, Math.max(0, safeIndex));
}

/**
 * Resolve one clockwise perimeter step to a directional sheet. Non-adjacent
 * updates intentionally return null so a caller can preserve its idle facing.
 */
export function getWalkDirection(from: number, to: number): WalkDirection | null {
  const fromIndex = normalizeBoardIndex(from);
  const toIndex = normalizeBoardIndex(to);
  // The trail has a beginning and an end. In particular, the last tile never
  // wraps back to the first tile as the old square board did.
  if (toIndex - fromIndex !== 1) return null;

  const fromCoords = getBoardGridCoords(fromIndex);
  const toCoords = getBoardGridCoords(toIndex);
  return WALK_DIRECTION_BY_DELTA[
    `${toCoords.x - fromCoords.x},${toCoords.y - fromCoords.y}`
  ] ?? null;
}

/** Speed is a combat stat. Every 20 points above the 40-point base adds one
 * deterministic point to successful outgoing player damage, capped at +5. */
export const COMBAT_SPEED_BASELINE = 40;
export const MAX_COMBAT_SPEED_DAMAGE = 5;

export function getCombatSpeedBonus(speed: number): number {
  return Math.min(
    MAX_COMBAT_SPEED_DAMAGE,
    Math.max(0, Math.floor(((Number.isFinite(speed) ? speed : COMBAT_SPEED_BASELINE) - COMBAT_SPEED_BASELINE) / 20)),
  );
}

export function generateBoard(): Tile[] {
  return Array.from({ length: TRAIL_TILE_COUNT }).map((_, i) => {
    if (i === 0) return { id: i, type: "start" };
    if (i === TRAIL_TILE_COUNT - 1) return { id: i, type: "boss" };
    // Distribute varied tiles
    if (i % 6 === 0) return { id: i, type: "rest" };
    if (i % 5 === 0) return { id: i, type: "shop" };
    if (i % 8 === 0) return { id: i, type: "event" };
    if (i % 7 === 0) return { id: i, type: "elite" };
    if (i % 11 === 0) return { id: i, type: "minigame" };
    return { id: i, type: "enemy" };
  });
}

function getNextLevelXp(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

function generateSkills(
  count: number,
  currentSkills: Skill[],
  characterId?: CharacterId,
): Skill[] {
  const pool: Skill[] = [
    { id: "s_fire", name: "Ember", description: "Learn the fire attack style", type: "fire" },
    { id: "s_cold", name: "Frost", description: "Learn the cold attack style", type: "cold" },
    { id: "s_acid", name: "Acid", description: "Learn the acid attack style", type: "acid" },
    { id: "s_lightning", name: "Spark", description: "Learn the lightning attack style", type: "lightning" },
    { id: "s_wind", name: "Gale", description: "Learn the wind attack style", type: "wind" },
    { id: "s_poison", name: "Poison Strike", description: "Attacks apply poison; poison ticks once at the start of each turn", type: "poison" },
    { id: "s_heal", name: "Life Leech", description: "Heal for 10% of damage dealt", type: "vampire" },
    { id: "s_first_strike", name: "First Strike", description: "Your first attack deals 50% bonus damage", type: "first_strike" },
    { id: "s_speed", name: "Momentum", description: "+20% damage on your committed attacks", type: "speed_boost" },
    { id: "s_def", name: "Iron Skin", description: "+20% Defense in combat", type: "defense_boost" },
    { id: "s_execute", name: "Executioner", description: "Deal double damage to enemies below 30% HP", type: "execute" },
    { id: "s_combo", name: "Combo Mastery", description: "Every 3rd attack deals 1.5x damage", type: "combo" },
    { id: "s_counter", name: "Counter Mastery", description: "Retaliate for 50% of incoming damage", type: "counter" },
  ];
  
  const supportedAttackStyles = new Set(
    getAttackStylesForCharacter(characterId).map(style => style.id),
  );
  const available = pool.filter(p => (
    !currentSkills.find(cs => cs.type === p.type)
    && (
      // Poison is also Unc's authored attack move, but this skill is a
      // passive effect and remains usable by John and Alan-a-Dale.
      p.type === "poison"
      || !isAttackStyle(p.type)
      || supportedAttackStyles.has(p.type)
    )
  ));
  return available.sort(() => Math.random() - 0.5).slice(0, count).map(s => ({ ...s, id: uuid() }));
}

function generateShop(characterId?: CharacterId): ShopItem[] {
  const items: ShopItem[] = [
    { id: uuid(), name: "Health Potion", description: "Restore 40% max HP, capped at full health", type: "consumable", consumable: "health_potion", cost: 25, stock: 1 },
    { id: uuid(), name: "Fire Bomb", description: "Deal fire damage to every living enemy", type: "consumable", consumable: "fire_bomb", cost: 45, stock: 1 },
    { id: uuid(), name: "Guard Tonic", description: "Halve damage from the next enemy response", type: "consumable", consumable: "guard_tonic", cost: 35, stock: 1 },
    { id: uuid(), name: "Iron Sword", description: "+5 Attack", type: "stat", stat: "attack", value: 5, cost: 60, stock: 1 },
    { id: uuid(), name: "Steel Shield", description: "+2 Defense", type: "stat", stat: "defense", value: 2, cost: 60, stock: 1 },
    { id: uuid(), name: "Wind Boots", description: "+15 Speed; every 20 above 40 adds +1 successful attack damage (cap +5)", type: "stat", stat: "speed", value: 15, cost: 50, stock: 1 },
  ];
  // Add a random skill
  const skills = generateSkills(1, [], characterId);
  if (skills.length > 0) {
    items.push({ id: uuid(), name: "Skill: " + skills[0].name, description: skills[0].description, type: "skill", skill: skills[0], cost: 150, stock: 1 });
  }
  // Keep one listing of every consumable visible so a run can plan around
  // healing, area damage, and guarding. The fourth slot rotates a stat/skill
  // upgrade, and every listing has one stock.
  const consumables = items.filter(item => item.type === "consumable");
  const upgrade = items.filter(item => item.type !== "consumable")
    .sort(() => Math.random() - 0.5)
    .slice(0, 1);
  return [...consumables, ...upgrade];
}

export const NORMAL_ROSTER: readonly MonsterSpeciesKey[] = ["wolf", "goblin", "skeleton", "ochre_jelly"];
export const ELITE_ROSTER: readonly MonsterSpeciesKey[] = ["ogre", "winter_wolf", "mummy"];

export function getEncounterCount(level: number, isElite: boolean, roll = Math.random()): number {
  if (isElite) return level >= 8 && roll >= 0.8 ? 2 : 1;
  if (level <= 2) return 1;
  if (level <= 5) return roll >= 0.65 ? 2 : 1;
  return roll >= 0.9 ? 3 : roll >= 0.35 ? 2 : 1;
}

export function generateEnemies(count: number, scale: number, isElite: boolean = false, level: number = 1): EnemyState[] {
  // Floors raise difficulty, but cannot outpace an under-levelled hero.
  const tier = Math.max(1, Math.min(scale, 1 + (level - 1) / 3));
  const roster = isElite ? ELITE_ROSTER : NORMAL_ROSTER;
  return Array.from({ length: count }).map(() => {
    const speciesKey = roster[Math.floor(Math.random() * roster.length)];
    const entry = getBestiaryEntry(speciesKey);
    const name = entry?.name ?? "Unknown Monster";
    const hp = Math.floor((16 + tier * 8) * (isElite ? 1.5 : 1));
    return {
      id: uuid(),
      name,
      speciesKey,
      artKey: entry?.artKey,
      hp,
      maxHp: hp,
      attack: Math.floor((3 + tier * 2) * (isElite ? 1.4 : 1)),
      defense: Math.floor(1 + (tier - 1) * (isElite ? 0.75 : 0.5)),
      speed: Math.floor(30 + tier * 2 + (isElite ? 10 : 0)),
      attackTimer: 0
    };
  });
}

export function generateBoss(floor: number): EnemyState {
  const hp = 150 + floor * 50;
  return {
    id: uuid(),
    name: "Skeleton King",
    speciesKey: "skeleton",
    artKey: "boss",
    hp,
    maxHp: hp,
    attack: 15 + floor * 5,
    defense: 5 + floor * 2,
    speed: 50 + floor * 5,
    attackTimer: 0,
    boss: true
  } as EnemyState;
}

export function logMessage(r: RunState, msg: string) {
  r.log.unshift({ id: uuid(), msg });
  if (r.log.length > 20) r.log.length = 20;
}

function initializeBossCombat(r: RunState) {
  r.isBossCombat = true;
  r.enemies = [generateBoss(r.floor)];
  r.playerCombat = {
    attackTimer: 0,
    roundCounter: 0,
    heroAttackSequence: 0,
    lastConsumable: null,
    heroConsumableSequence: 0,
    pendingFireBomb: false,
    enemyAttackSequence: 0,
    firstAttackPending: r.skills.some(sk => sk.type === "first_strike"),
    holdMyBeerUsed: false,
  };
  r.combatTurn = "player";
  r.guardActive = false;
  r.combatFeedback = null;
  r.phase = "combat";
  logMessage(r, "The Boss has arrived!");
}

function remainingTrailPaces(r: Pick<RunState, "position" | "tiles">): number {
  return Math.max(0, r.tiles.length - 1 - r.position);
}

function syncTrailCountdown(r: RunState) {
  // bossRollsLeft is retained as a legacy save/UI alias, but both countdown
  // names now represent trail distance rather than a budget of dice rolls.
  const remaining = remainingTrailPaces(r);
  r.bossCountdown = remaining;
  r.bossRollsLeft = remaining;
}

function stageTrailAwakening(r: RunState) {
  r.trailAwakeningSeen = true;
  r.trailCinematic = "awakening";
  r.pendingTileTrigger = false;
  r.isBossCombat = false;
  r.enemies = [];
  r.playerCombat = null;
  r.combatTurn = "player";
  r.guardActive = false;
  r.combatFeedback = null;
  r.rollAnimating = false;
  r.stepsRemaining = 0;
  r.phase = "boss_awakening";
  syncTrailCountdown(r);
  logMessage(r, "Blue fire gathers around the ancient boss statue...");
}

function stageTrailAlert(r: RunState): boolean {
  if (r.trailAlertSeen) return false;
  r.trailAlertSeen = true;
  r.trailCinematic = "alert";
  logMessage(r, "A warning bell echoes through the forest. The boss trail draws near.");
  return true;
}

function triggerTile(s: GameStateV4, r: RunState) {
  const tile = r.tiles[r.position];

  // The final tile is a boss approach, not an automatic fight. The
  // awakening presentation must complete before the explicit Fight Boss
  // choice becomes available.
  if (r.position >= r.tiles.length - 1 || tile?.type === "boss") {
    stageTrailAwakening(r);
    return;
  }

  if (tile?.type === "start") {
    r.phase = "explore";
    logMessage(r, "Passed Start! Healed 20 HP.");
    r.hp = Math.min(r.maxHp, r.hp + 20);
  } else if (tile?.type === "enemy" || tile?.type === "elite") {
    const count = getEncounterCount(r.level, tile.type === "elite");
    r.enemies = generateEnemies(count, r.floor, tile.type === "elite", r.level);
    r.playerCombat = {
      attackTimer: 0,
      roundCounter: 0,
      heroAttackSequence: 0,
      lastConsumable: null,
      heroConsumableSequence: 0,
      pendingFireBomb: false,
      enemyAttackSequence: 0,
      firstAttackPending: r.skills.some(sk => sk.type === "first_strike"),
      holdMyBeerUsed: false,
    };
    r.combatTurn = "player";
    r.guardActive = false;
    r.combatFeedback = null;
    r.phase = "combat";
    r.isBossCombat = false;
    logMessage(r, `Encountered ${count} ${tile.type === "elite" ? "Elite " : ""}enemies!`);
  } else if (tile?.type === "shop") {
    r.phase = "shop";
    r.shopItems = generateShop(r.characterId);
    r.shopRerollCost = 10;
    logMessage(r, "A wandering merchant offers their wares.");
  } else if (tile?.type === "event") {
    r.phase = "event_test_of_might";
    logMessage(r, "You face a Test of Might!");
  } else if (tile?.type === "rest") {
    r.phase = "rest";
    logMessage(r, "You found a safe place to rest.");
  } else if (tile?.type === "minigame") {
    r.phase = "minigame";
    logMessage(r, "A strange minigame awaits.");
  } else {
    r.phase = "explore";
  }
}

export function createInitialState(): GameStateV4 {
  return {
    meta: {
      version: 4,
      gems: 0,
      talents: { vitality: 0, quickness: 0, power: 0 },
      inventory: [],
      equipped: { weapon: null, armor: null, accessory: null }
    },
    run: null
  };
}

export function getTalentCost(level: number) {
  return 50 + level * 25;
}

function migrateEnemy(enemy: any): EnemyState {
  if (enemy?.boss && enemy?.name === "Mummy") {
    enemy = { ...enemy, name: "Skeleton King", speciesKey: "skeleton", artKey: "boss" };
  }
  const speciesKey = getBestiaryEntry(enemy?.speciesKey)
    ? enemy.speciesKey as MonsterSpeciesKey
    : speciesKeyForName(enemy?.name);
  const entry = getBestiaryEntry(speciesKey);
  return {
    ...enemy,
    ...(speciesKey ? { speciesKey } : {}),
    ...(enemy?.artKey || (entry === undefined && !enemy?.boss) ? {} : { artKey: entry?.artKey ?? "boss" }),
    attackTimer: typeof enemy?.attackTimer === "number" ? enemy.attackTimer : 0,
    damageType: isDamageType(enemy?.damageType) ? enemy.damageType : DEFAULT_DAMAGE_TYPE,
    poisonTimerMs: typeof enemy?.poisonTimerMs === "number" ? enemy.poisonTimerMs : 0,
  };
}

function isConsumableType(value: unknown): value is ConsumableType {
  return value === "health_potion" || value === "fire_bomb" || value === "guard_tonic";
}

function isTileType(value: unknown): value is TileType {
  return value === "start"
    || value === "enemy"
    || value === "elite"
    || value === "event"
    || value === "shop"
    || value === "rest"
    || value === "minigame"
    || value === "boss";
}

function migrateTrailTiles(tiles: unknown): Tile[] {
  const legacyTiles = Array.isArray(tiles) ? tiles : [];
  const generated = generateBoard();
  return generated.map((fallback, index) => {
    const legacy = legacyTiles[index];
    if (legacy && isTileType(legacy.type) && index < TRAIL_TILE_COUNT - 1) {
      // Preserve the old tile at its index, including any future metadata,
      // while normalizing its identity to the finite trail index.
      return { ...legacy, id: index, type: legacy.type };
    }
    return fallback;
  });
}

export function validateState(input: any): GameStateV4 {
  if (!input || input.meta?.version !== 4) return createInitialState();
  if (typeof input.meta.gems !== "number") return createInitialState();

  const s = JSON.parse(JSON.stringify(input)) as GameStateV4;
  s.meta.inventory = Array.isArray(s.meta.inventory) ? s.meta.inventory : [];
  s.meta.talents = {
    vitality: Number.isFinite(s.meta.talents?.vitality) ? s.meta.talents.vitality : 0,
    quickness: Number.isFinite(s.meta.talents?.quickness) ? s.meta.talents.quickness : 0,
    power: Number.isFinite(s.meta.talents?.power) ? s.meta.talents.power : 0,
  };
  s.meta.equipped = {
    weapon: s.meta.equipped?.weapon ?? null,
    armor: s.meta.equipped?.armor ?? null,
    accessory: s.meta.equipped?.accessory ?? null,
  };
  if (s.run) {
    const run = s.run as RunState & { combatTurn?: unknown };
    const legacyTiles = s.run.tiles;
    const legacyTileCount = Array.isArray(legacyTiles) ? legacyTiles.length : 0;
    const legacyBossRollsLeft = s.run.bossRollsLeft;
    s.run.tiles = migrateTrailTiles(legacyTiles);
    s.run.position = Number.isFinite(s.run.position)
      ? Math.min(s.run.tiles.length - 1, Math.max(0, Math.floor(s.run.position)))
      : 0;
    // v4 saves predate the finite trail. They already have a meaningful
    // position, so keep it at the same index and only append the new trail.
    // Existing presentations are kept intact rather than replayed.
    const hasTrailIntroSeen = typeof s.run.trailIntroSeen === "boolean";
    const hasTrailAlertSeen = typeof s.run.trailAlertSeen === "boolean";
    const hasTrailAwakeningSeen = typeof s.run.trailAwakeningSeen === "boolean";
    s.run.trailIntroSeen = hasTrailIntroSeen ? s.run.trailIntroSeen : true;
    s.run.trailAlertSeen = hasTrailAlertSeen
      ? s.run.trailAlertSeen
      : s.run.position >= s.run.tiles.length - 1 - ALERT_REMAINING_PACES;
    s.run.trailAwakeningSeen = hasTrailAwakeningSeen
      ? s.run.trailAwakeningSeen
      : s.run.phase === "boss_awakening"
        || s.run.phase === "boss_ready"
        || (s.run.phase === "combat" && Boolean(s.run.isBossCombat))
        || s.run.phase === "victory";
    s.run.trailCinematic = s.run.trailCinematic === "intro"
      || s.run.trailCinematic === "alert"
      || s.run.trailCinematic === "awakening"
      ? s.run.trailCinematic
      : null;
    if (s.run.trailCinematic === "intro") s.run.trailIntroSeen = false;
    if (s.run.trailCinematic === "alert") s.run.trailAlertSeen = true;
    if (s.run.trailCinematic === "awakening") s.run.trailAwakeningSeen = true;
    if (s.run.trailCinematic === "awakening") s.run.phase = "boss_awakening";
    s.run.pendingTileTrigger = Boolean(s.run.pendingTileTrigger);
    // Character selection was added after existing v4 saves. Identity is
    // migrated independently from the run's current stats and skills so an
    // old or malformed save cannot be rebalanced on load.
    s.run.characterId = getCharacter(s.run.characterId).id;
    syncTrailCountdown(s.run);
    s.run.skills = Array.isArray(s.run.skills)
      ? s.run.skills.map(skill => skill.type === "speed_boost"
        ? { ...skill, name: "Momentum", description: "+20% damage on your committed attacks" }
        : skill.type === "first_strike"
          ? { ...skill, description: "Your first attack deals 50% bonus damage" }
          : skill)
      : [];
    s.run.log = Array.isArray(s.run.log) ? s.run.log : [];
    s.run.shopRerollCost = typeof s.run.shopRerollCost === "number" ? s.run.shopRerollCost : 10;
    s.run.settled = Boolean(s.run.settled);
    // Old defeated saves did not have a death-presentation marker. Preserve a
    // genuinely pending Unc presentation while defaulting missing markers to
    // the completed state.
    s.run.heroDeathPending = Boolean(s.run.heroDeathPending);
    s.run.lastRolls = isDiceRoll(s.run.lastRolls)
      ? s.run.lastRolls
      : null;
    s.run.stepsRemaining = Number.isFinite(s.run.stepsRemaining)
      ? Math.max(0, Math.floor(s.run.stepsRemaining))
      : 0;
    // A pre-trail v4 save could have finished its old roll budget while the
    // movement hook had not yet committed the landing. Keep its old position
    // (rather than teleporting it) and resume ordinary exploration toward the
    // new endpoint instead of leaving it in a zero-step moving phase.
    if (
      legacyTileCount > 0
      && legacyTileCount < TRAIL_TILE_COUNT
      && Number.isFinite(legacyBossRollsLeft)
      && legacyBossRollsLeft <= 0
      && s.run.phase === "moving"
      && s.run.stepsRemaining <= 0
    ) {
      s.run.phase = "explore";
      s.run.rollAnimating = false;
    }
    // Saves from before the roll-animation marker represent ordinary movement.
    s.run.rollAnimating = s.run.phase === "moving" && Boolean(s.run.rollAnimating);
    s.run.isBossCombat = Boolean(s.run.isBossCombat);
    // Unc's authored menu intentionally does not include the legacy blade or
    // lightning stances. Keep an already-valid Unc move, otherwise migrate an
    // old selection to fire (the starting magical style) or Punch without
    // changing any run progression, inventory, or stats.
    s.run.selectedDamageType = isAttackStyle(s.run.selectedDamageType)
      && isAttackStyleLearned(s.run, s.run.selectedDamageType)
      ? s.run.selectedDamageType
      : fallbackDamageType(s.run);
    s.run.combatFeedback = s.run.combatFeedback ?? null;
    s.run.enemies = Array.isArray(s.run.enemies)
      ? s.run.enemies.map(migrateEnemy)
      : [];
    s.run.playerCombat = s.run.playerCombat
      ? {
        attackTimer: typeof s.run.playerCombat.attackTimer === "number" ? s.run.playerCombat.attackTimer : 0,
        roundCounter: typeof s.run.playerCombat.roundCounter === "number" ? s.run.playerCombat.roundCounter : 0,
        heroAttackSequence: typeof s.run.playerCombat.heroAttackSequence === "number" ? s.run.playerCombat.heroAttackSequence : 0,
        lastConsumable: isConsumableType(s.run.playerCombat.lastConsumable)
          ? s.run.playerCombat.lastConsumable
          : null,
        heroConsumableSequence: typeof s.run.playerCombat.heroConsumableSequence === "number"
          ? Math.max(0, Math.floor(s.run.playerCombat.heroConsumableSequence))
          : 0,
        pendingFireBomb: Boolean(s.run.playerCombat.pendingFireBomb),
        enemyAttackSequence: typeof s.run.playerCombat.enemyAttackSequence === "number" ? s.run.playerCombat.enemyAttackSequence : 0,
        firstAttackPending: typeof s.run.playerCombat.firstAttackPending === "boolean"
          ? s.run.playerCombat.firstAttackPending
          : s.run.skills.some(skill => skill.type === "first_strike"),
        holdMyBeerUsed: Boolean(s.run.playerCombat.holdMyBeerUsed),
        ...(s.run.playerCombat.lastAttackKind === "normal"
          || s.run.playerCombat.lastAttackKind === "hold_my_beer"
          ? { lastAttackKind: s.run.playerCombat.lastAttackKind }
          : {}),
        ...(isAttackStyle(s.run.playerCombat.attackDamageType)
          ? { attackDamageType: s.run.playerCombat.attackDamageType }
          : {}),
      }
      : null;
    s.run.combatTurn = run.combatTurn === "enemy" ? "enemy" : "player";
    s.run.guardActive = Boolean(run.guardActive);
    s.run.consumables = {
      health_potion: Math.max(0, Math.floor(Number(run.consumables?.health_potion ?? 3))),
      fire_bomb: Math.max(0, Math.floor(Number(run.consumables?.fire_bomb ?? 2))),
      guard_tonic: Math.max(0, Math.floor(Number(run.consumables?.guard_tonic ?? 1))),
    };
    s.run.shopItems = Array.isArray(run.shopItems)
      ? run.shopItems.map(item => ({ ...item, stock: Math.max(0, Math.floor(Number(item.stock ?? 1))) }))
      : null;
    // A pre-turn-state save has no turn marker. It is deliberately safe to
    // restore it to player input rather than giving an enemy a free response.
    // An explicit enemy-turn save, however, must retain its pending response
    // so the hook can resolve it once after reload.
    if (s.run.phase === "combat" && !s.run.playerCombat) {
      s.run.playerCombat = {
        attackTimer: 0,
        roundCounter: 0,
        heroAttackSequence: 0,
        lastConsumable: null,
        heroConsumableSequence: 0,
        pendingFireBomb: false,
        enemyAttackSequence: 0,
        holdMyBeerUsed: false,
      };
      if (run.combatTurn !== "enemy") s.run.combatTurn = "player";
    }

    // A save taken exactly on the new endpoint but before the reducer staged
    // the awakening is repaired into the durable presentation phase.
    if (
      !s.run.isBossCombat
      && s.run.position >= s.run.tiles.length - 1
      && s.run.phase === "moving"
      && s.run.stepsRemaining <= 0
      && !s.run.trailCinematic
    ) {
      stageTrailAwakening(s.run);
    }
    syncTrailCountdown(s.run);
  }
  return s;
}

export interface DamageResolution {
  amount: number;
  afterDefense: number;
  kind: CombatFeedbackKind;
  damageType: DamageType;
}

/**
 * Defense is subtracted before a damage trait is applied. The trait then
 * halves (floor), doubles, or nullifies the result. Unlike the old combat
 * loop, immunity is allowed to produce zero damage and is never promoted to
 * one point.
 */
export function calculateDamage(
  baseDamage: number,
  defense: number,
  speciesKey: MonsterSpeciesKey | string | undefined,
  damageType: DamageType,
  magical = false,
): DamageResolution {
  const afterDefense = Math.max(0, Math.floor(baseDamage - defense));
  const modifier = getDamageModifier(speciesKey, damageType, magical);
  let amount = afterDefense;
  if (modifier.kind === "immune") amount = 0;
  if (modifier.kind === "resisted") amount = Math.floor(afterDefense / 2);
  if (modifier.kind === "vulnerable") amount = afterDefense * 2;
  return { amount, afterDefense, kind: modifier.kind, damageType };
}

function enemySpecies(enemy: EnemyState): MonsterSpeciesKey | undefined {
  return enemy.speciesKey ?? speciesKeyForName(enemy.name);
}

function feedbackMessage(
  resolution: DamageResolution,
  targetName: string,
): string {
  const type = resolution.damageType.charAt(0).toUpperCase() + resolution.damageType.slice(1);
  if (resolution.kind === "immune") return `${targetName} is immune to ${type} (0 damage).`;
  if (resolution.kind === "resisted") return `${targetName} resists ${type} (½ damage).`;
  if (resolution.kind === "vulnerable") return `${targetName} is vulnerable to ${type} (2× damage).`;
  return `${type} hits ${targetName} for ${resolution.amount}.`;
}

function setCombatFeedback(
  r: RunState,
  resolution: DamageResolution,
  targetName: string,
) {
  r.combatFeedback = {
    id: uuid(),
    kind: resolution.kind,
    damageType: resolution.damageType,
    amount: resolution.amount,
    targetName,
    message: feedbackMessage(resolution, targetName),
  };
}

function getEquippedStats(meta: MetaState) {
  let attack = 0, defense = 0, speed = 0, maxHp = 0;
  Object.values(meta.equipped).forEach(id => {
    if (id) {
      const item = meta.inventory.find(i => i.id === id);
      if (item && item.stats) {
        if (item.stats.attack) attack += item.stats.attack;
        if (item.stats.defense) defense += item.stats.defense;
        if (item.stats.speed) speed += item.stats.speed;
        if (item.stats.maxHp) maxHp += item.stats.maxHp;
      }
    }
  });
  return { attack, defense, speed, maxHp };
}

function gainXp(r: RunState, amount: number) {
  r.xp += amount;
  while (r.xp >= getNextLevelXp(r.level)) {
    r.xp -= getNextLevelXp(r.level);
    r.level++;
    r.queuedLevels++;
  }
}

function settleDefeat(s: GameStateV4, r: RunState) {
  r.phase = "defeat";
  r.combatTurn = "player";
  if (r.characterId === "unc") r.heroDeathPending = true;
  if (!r.settled) {
    s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
    r.settled = true;
  }
  logMessage(r, "You have been defeated...");
}

function finishVictory(r: RunState, attackDurationMs = getPlayerAttackDurationMs(r)) {
  const authoredPresentationDuration = r.isBossCombat
    ? Math.max(5200, attackDurationMs)
    : attackDurationMs;
  const playbackSpeed = r.characterId === "unc" && Number.isFinite(r.combatSpeed)
    ? Math.max(1, r.combatSpeed!)
    : 1;
  const report = {
    id: uuid(), boss: r.isBossCombat, floor: r.floor,
    xp: r.isBossCombat ? 0 : 40 + r.floor * 10,
    gold: r.isBossCombat ? 100 + r.floor * 20 : 15 + r.floor * 5,
    gems: r.isBossCombat ? 50 * r.floor : 0,
    healing: 0, equipment: [] as string[],
    // The report must not replace an authored Unc attack sheet while it is
    // still playing. Boss reports retain their established presentation
    // minimum, while ordinary encounters use the committed attack duration.
    // Unc's authored presentation is paced by the committed combat speed.
    // John and Alan-a-Dale deliberately retain their existing report timing.
    showAt: Date.now() + authoredPresentationDuration / playbackSpeed,
  };
  if (r.isBossCombat) {
    r.gemsEarned += report.gems;
    r.gold += report.gold;
    logMessage(r, "Boss defeated! Gained gems and gold.");
    r.phase = "victory";
  } else {
    r.gold += report.gold;
    gainXp(r, report.xp);
    logMessage(r, "Enemies defeated! Gained gold and XP.");
    const recovery = Math.min(r.maxHp - r.hp, Math.ceil(r.maxHp * 0.08));
    r.hp += recovery;
    report.healing = recovery;
    if (recovery > 0) logMessage(r, `Caught your breath: recovered ${recovery} HP.`);
    r.phase = "explore";
  }
  r.combatTurn = "player";
  r.guardActive = false;
  r.victoryReport = report;
}

function applyPoisonTicks(r: RunState) {
  for (const enemy of r.enemies) {
    if (enemy.hp <= 0 || !enemy.poisoned) continue;
    // Poison is deliberately turn based. Legacy elapsed-time poison fields
    // are ignored and reset so loading an old battle cannot deal catch-up
    // damage.
    enemy.poisonTimerMs = 0;
    const poison = calculateDamage(1, 0, enemySpecies(enemy), "poison");
    enemy.hp = Math.max(0, enemy.hp - poison.amount);
    setCombatFeedback(r, poison, enemy.name);
    if (poison.amount > 0) {
      logMessage(r, `Poison deals ${poison.amount} damage to ${enemy.name}.`);
    } else if (poison.kind === "immune") {
      logMessage(r, `${enemy.name} is immune to poison.`);
    }
  }
  r.enemies = r.enemies.filter(enemy => enemy.hp > 0);
}

function activeStyle(r: RunState) {
  const style = resolveAttackStyle(r);
  r.selectedDamageType = style.damageType;
  return style;
}

function beginEnemyTurn(r: RunState) {
  r.combatTurn = "enemy";
  r.phase = "combat";
}

/**
 * Apply one physical or magical player hit. Hold My Beer calls this twice
 * with the same target and sequence number, so every punch gets the ordinary
 * defense/trait and skill modifiers while combo/attack sequencing remains one
 * committed hero attack.
 */
function applyPlayerAttackHit(
  r: RunState,
  target: EnemyState,
  style: AttackStyle,
  attackSequence: number,
) {
  const pc = r.playerCombat!;
  const resolution = calculateDamage(
    r.attack,
    target.defense,
    enemySpecies(target),
    style.damageType,
    style.magical,
  );
  let damage = resolution.amount;
  if (damage > 0) damage += getCombatSpeedBonus(r.speed);
  if (r.skills.some(skill => skill.type === "speed_boost")) damage = Math.floor(damage * 1.2);
  if (pc.firstAttackPending) {
    damage = Math.floor(damage * 1.5);
    pc.firstAttackPending = false;
  }
  if (r.skills.some(skill => skill.type === "execute") && target.hp < target.maxHp * 0.3) {
    damage *= 2;
  }
  if (r.skills.some(skill => skill.type === "combo") && attackSequence % 3 === 0) {
    damage = Math.floor(damage * 1.5);
  }

  const previousHp = target.hp;
  target.hp = Math.max(0, target.hp - Math.floor(damage));
  const finalResolution = { ...resolution, amount: Math.floor(damage) };
  setCombatFeedback(r, finalResolution, target.name);
  logMessage(r, feedbackMessage(finalResolution, target.name));

  if (r.skills.some(skill => skill.type === "poison") && target.hp > 0) {
    target.poisoned = true;
    target.poisonTimerMs = 0;
  }
  if (r.skills.some(skill => skill.type === "vampire") && finalResolution.amount > 0) {
    r.hp = Math.min(r.maxHp, r.hp + Math.floor((previousHp - target.hp) * 0.1));
  }
}

function resolvePlayerAttack(s: GameStateV4, targetId?: string) {
  const r = s.run;
  if (!r || r.phase !== "combat" || r.combatTurn === "enemy" || !r.playerCombat) return;
  if (r.enemies.length === 0) return;

  const pc = r.playerCombat;
  const style = activeStyle(r);
  pc.attackDamageType = style.damageType;
  pc.lastAttackKind = "normal";
  pc.roundCounter++;
  applyPoisonTicks(r);
  const target = (targetId ? r.enemies.find(enemy => enemy.id === targetId && enemy.hp > 0) : undefined)
    ?? r.enemies.find(enemy => enemy.hp > 0);

  if (target) {
    pc.heroAttackSequence = (pc.heroAttackSequence ?? 0) + 1;
    applyPlayerAttackHit(r, target, style, pc.heroAttackSequence);
  }

  r.enemies = r.enemies.filter(enemy => enemy.hp > 0);
  if (r.enemies.length === 0) {
    finishVictory(r);
  } else {
    beginEnemyTurn(r);
  }
}

function resolveHoldMyBeer(s: GameStateV4, targetId?: string) {
  const r = s.run;
  if (
    !r
    || r.characterId !== "unc"
    || r.phase !== "combat"
    || r.combatTurn === "enemy"
    || !r.playerCombat
    || r.playerCombat.holdMyBeerUsed
    || r.enemies.length === 0
  ) return;

  const pc = r.playerCombat;
  const target = (targetId ? r.enemies.find(enemy => enemy.id === targetId && enemy.hp > 0) : undefined)
    ?? r.enemies.find(enemy => enemy.hp > 0);
  if (!target) return;

  const style = getAttackStyle("bludgeoning")!;
  pc.holdMyBeerUsed = true;
  pc.lastAttackKind = "hold_my_beer";
  pc.attackDamageType = style.damageType;
  pc.roundCounter++;
  applyPoisonTicks(r);
  pc.heroAttackSequence = (pc.heroAttackSequence ?? 0) + 1;

  // Keep the selected target stable across both punches. If the first punch
  // kills it, the second punch is intentionally skipped rather than spilling
  // over into another enemy.
  for (let punch = 0; punch < 2 && target.hp > 0; punch++) {
    applyPlayerAttackHit(r, target, style, pc.heroAttackSequence);
  }

  r.enemies = r.enemies.filter(enemy => enemy.hp > 0);
  if (r.enemies.length === 0) {
    finishVictory(r, UNC_ACTION_DURATIONS.special);
  } else {
    beginEnemyTurn(r);
  }
}

function resolveConsumable(s: GameStateV4, consumable: ConsumableType) {
  const r = s.run;
  if (!r || r.phase !== "combat" || r.combatTurn === "enemy" || !r.playerCombat) return;
  if ((r.consumables[consumable] ?? 0) <= 0 || r.enemies.length === 0) return;

  if (consumable === "health_potion" && r.hp >= r.maxHp) return;

  r.consumables[consumable]--;
  r.playerCombat.roundCounter++;
  r.playerCombat.lastConsumable = consumable;
  delete r.playerCombat.attackDamageType;
  r.playerCombat.heroConsumableSequence = (r.playerCombat.heroConsumableSequence ?? 0) + 1;
  applyPoisonTicks(r);

  if (consumable === "health_potion") {
    const healed = Math.max(1, Math.floor(r.maxHp * 0.4));
    const before = r.hp;
    r.hp = Math.min(r.maxHp, r.hp + healed);
    logMessage(r, `Health Potion restores ${Math.floor(r.hp - before)} HP.`);
  } else if (consumable === "guard_tonic") {
    r.guardActive = true;
    logMessage(r, "Guard Tonic readies a guard against the next enemy response.");
  } else {
    // The item is consumed now, but its impact belongs to the delayed enemy
    // response. This durable marker makes the impact replayable after reload
    // without consuming another bomb.
    r.playerCombat.pendingFireBomb = true;
    logMessage(r, "Fire Bomb arcs toward every living enemy.");
  }

  beginEnemyTurn(r);
}

function resolveFireBomb(r: RunState) {
  const bombDamage = Math.max(1, 30 + Math.floor(r.attack * 0.5));
  const style = ATTACK_STYLES.find(candidate => candidate.id === "fire")!;
  for (const enemy of r.enemies) {
    if (enemy.hp <= 0) continue;
    const resolution = calculateDamage(
      bombDamage,
      enemy.defense,
      enemySpecies(enemy),
      "fire",
      style.magical,
    );
    enemy.hp = Math.max(0, enemy.hp - resolution.amount);
    setCombatFeedback(r, resolution, enemy.name);
    logMessage(r, `Fire Bomb: ${feedbackMessage(resolution, enemy.name)}`);
  }
  r.enemies = r.enemies.filter(enemy => enemy.hp > 0);
}

function resolveEnemyTurn(s: GameStateV4) {
  const r = s.run;
  if (!r || r.phase !== "combat" || r.combatTurn !== "enemy" || !r.playerCombat) return;

  // Fire Bomb impact is committed to this one resolution. Legacy saves may
  // retain lastConsumable === "fire_bomb" without this marker because those
  // bombs already dealt damage before the delayed response; never infer a
  // second impact from that legacy marker.
  if (r.playerCombat.pendingFireBomb) {
    r.playerCombat.pendingFireBomb = false;
    resolveFireBomb(r);
    if (r.enemies.length === 0) {
      finishVictory(r, Math.max(FIRE_BOMB_ANIMATION_DURATION_MS, getPlayerAttackDurationMs(r)));
      r.playerCombat.lastConsumable = null;
      return;
    }
  }

  // Use the style committed by the preceding player attack for counter
  // damage. A selected Unc move must remain stable for the entire enemy turn,
  // even if a caller presents a stale or partially migrated save.
  const committedStyle = r.playerCombat.attackDamageType;
  const style = committedStyle && isAttackStyle(committedStyle)
    && isAttackStyleLearned(r, committedStyle)
    ? getAttackStyle(committedStyle)!
    : resolveAttackStyle(r);
  let playerDefense = r.defense;
  if (r.skills.some(skill => skill.type === "defense_boost")) playerDefense *= 1.2;
  const guardMultiplier = r.guardActive ? 0.5 : 1;

  // Iterate the living roster once. A counter can kill a later enemy, in
  // which case that enemy is no longer living and does not retaliate.
  for (const enemy of r.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.boss) {
      enemy.lastBossAttack = enemy.lastBossAttack === "sword" ? "fireball" : "sword";
      enemy.damageType = enemy.lastBossAttack === "fireball" ? "fire" : "slashing";
    }
    let damage = Math.max(1, Math.floor(enemy.attack - playerDefense));
    damage = Math.floor(damage * guardMultiplier);
    r.hp = Math.max(0, r.hp - damage);
    r.playerCombat.enemyAttackSequence = (r.playerCombat.enemyAttackSequence ?? 0) + 1;
    logMessage(r, `${enemy.name}${enemy.boss ? enemy.lastBossAttack === "fireball" ? " casts a fireball" : " strikes with his sword" : " hits you"} for ${damage} ${enemy.damageType ?? "slashing"} damage.`);

    if (r.hp <= 0) break;

    if (r.skills.some(skill => skill.type === "counter") && damage > 0 && enemy.hp > 0) {
      const counter = calculateDamage(
        Math.floor(damage * 0.5),
        enemy.defense,
        enemySpecies(enemy),
        style.damageType,
        style.magical,
      );
      const counterResolution = counter.amount > 0
        ? { ...counter, amount: counter.amount + getCombatSpeedBonus(r.speed) }
        : counter;
      enemy.hp = Math.max(0, enemy.hp - counterResolution.amount);
      setCombatFeedback(r, counterResolution, enemy.name);
      logMessage(r, `You counter ${enemy.name}: ${feedbackMessage(counterResolution, enemy.name)}`);
    }
  }

  r.guardActive = false;
  r.enemies = r.enemies.filter(enemy => enemy.hp > 0);
  if (r.hp <= 0) {
    settleDefeat(s, r);
  } else if (r.enemies.length === 0) {
    finishVictory(r);
  } else {
    r.combatTurn = "player";
    r.phase = "combat";
  }
  // A consumable marker is pending only for this response.  Clearing it after
  // resolution prevents a later attack from inheriting the potion delay.
  r.playerCombat.lastConsumable = null;
}

export function act(state: GameStateV4, action: GameAction): GameStateV4 {
  const s: GameStateV4 = JSON.parse(JSON.stringify(state));
  if (action.type === "DISMISS_VICTORY_REPORT") {
    if (s.run?.victoryReport) s.run.victoryReport = null;
    return s;
  }
  if (s.run?.victoryReport && action.type !== "RESET_SAVE") return s;

  if (action.type === "RESET_SAVE") {
    return createInitialState();
  }
  if (action.type === "FINISH_HERO_DEATH") {
    if (s.run?.phase === "defeat") s.run.heroDeathPending = false;
    return s;
  }
  // A pending death presentation owns the run. In particular, do not let a
  // reload or an eager exit/start action skip directly to another screen.
  if (s.run?.heroDeathPending) return s;

  if (s.run) {
    const maxPosition = Math.max(0, s.run.tiles.length - 1);
    s.run.position = Number.isFinite(s.run.position)
      ? Math.min(maxPosition, Math.max(0, Math.trunc(s.run.position)))
      : 0;
    syncTrailCountdown(s.run);
  }

  const cinematic = s.run?.trailCinematic;
  const canFinishCinematic = action.type === "FINISH_TRAIL_CINEMATIC"
    // Keep the pre-trail hook action as a safe alias for the awakening only.
    || (action.type === "COMPLETE_BOSS_AWAKENING" && cinematic === "awakening");
  if (cinematic && !canFinishCinematic) return s;

  if (action.type === "FINISH_TRAIL_CINEMATIC") {
    const r = s.run;
    if (!r || !r.trailCinematic) return s;
    const finished = r.trailCinematic;
    r.trailCinematic = null;
    if (finished === "intro") {
      r.trailIntroSeen = true;
      logMessage(r, "The forest trail opens before you.");
    } else if (finished === "alert") {
      r.trailAlertSeen = true;
      logMessage(r, "You press onward toward the heart of the forest.");
      // If the alert was staged on the final step of a roll, do not lose the
      // landing encounter while the cinematic was on screen.
      if (
        (r.pendingTileTrigger || r.phase === "moving")
        && r.stepsRemaining <= 0
      ) {
        r.pendingTileTrigger = false;
        triggerTile(s, r);
      }
    } else if (finished === "awakening") {
      r.trailAwakeningSeen = true;
      r.phase = "boss_ready";
      logMessage(r, "The statue awakens. Choose when to challenge the Floor Boss.");
    }
    return s;
  }

  if (action.type === "OPEN_CHEST") {
    if (s.run) return s;
    if (s.meta.gems >= 100) {
      s.meta.gems -= 100;
      const types: ("weapon" | "armor" | "accessory")[] = ["weapon", "armor", "accessory"];
      const rarities: ("common" | "uncommon" | "rare" | "epic" | "legendary")[] = ["common", "uncommon", "rare", "epic", "legendary"];
      const type = types[Math.floor(Math.random() * types.length)];
      const r = Math.random();
      let rarity = "common";
      let mult = 1;
      if (r > 0.95) { rarity = "legendary"; mult = 5; }
      else if (r > 0.8) { rarity = "epic"; mult = 3; }
      else if (r > 0.5) { rarity = "rare"; mult = 2; }
      else if (r > 0.25) { rarity = "uncommon"; mult = 1.5; }
      
      const item: Item = {
        id: uuid(),
        name: `${rarity.charAt(0).toUpperCase() + rarity.slice(1)} ${type}`,
        type,
        rarity: rarity as any,
        stats: {}
      };
      
      if (type === "weapon") item.stats.attack = Math.floor(Math.random() * 5 * mult) + 2;
      if (type === "armor") item.stats.defense = Math.floor(Math.random() * 3 * mult) + 1;
      if (type === "accessory") item.stats.speed = Math.floor(Math.random() * 10 * mult) + 5;
      
      s.meta.inventory.push(item);
    }
  }

  if (action.type === "EQUIP_ITEM") {
    if (s.run) return s;
    const item = s.meta.inventory.find(i => i.id === action.itemId);
    if (item) {
      s.meta.equipped[item.type] = item.id;
    }
  }
  
  if (action.type === "UNEQUIP_ITEM") {
    if (s.run) return s;
    s.meta.equipped[action.slot] = null;
  }

  if (action.type === "BUY_TALENT") {
    if (s.run) return s;
    const lvl = s.meta.talents[action.stat];
    const cost = getTalentCost(lvl);
    if (s.meta.gems >= cost) {
      s.meta.gems -= cost;
      s.meta.talents[action.stat]++;
    }
  }

  if (action.type === "START_RUN") {
    const character = getCharacter(action.characterId);
    const eq = getEquippedStats(s.meta);
    const mHp = character.baseStats.maxHp + s.meta.talents.vitality * 20 + eq.maxHp;
    s.run = {
      characterId: character.id,
      hp: mHp,
      maxHp: mHp,
      attack: character.baseStats.attack + s.meta.talents.power * 3 + eq.attack,
      defense: character.baseStats.defense + eq.defense,
      speed: character.baseStats.speed + s.meta.talents.quickness * 5 + eq.speed,
      gold: 0,
      gemsEarned: 0,
      xp: 0,
      level: 1,
      queuedLevels: 0,
      bossCountdown: TRAIL_TILE_COUNT - 1,
      bossRollsLeft: TRAIL_TILE_COUNT - 1,
      floor: 1,
      position: 0,
      tiles: generateBoard(),
      lastRolls: null,
      stepsRemaining: 0,
      trailCinematic: "intro",
      trailIntroSeen: false,
      trailAlertSeen: false,
      trailAwakeningSeen: false,
      pendingTileTrigger: false,
      phase: "explore",
      enemies: [],
      playerCombat: null,
      combatTurn: "player",
      guardActive: false,
      consumables: { health_potion: 3, fire_bomb: 2, guard_tonic: 1 },
      isBossCombat: false,
      selectedDamageType: character.startingDamageType,
      combatFeedback: null,
      // Skills belong to the run, so clone definitions rather than allowing a
      // reducer action or save migration to mutate the character catalogue.
      skills: character.startingSkills.map(skill => ({ ...skill })),
      skillOptions: null,
      shopItems: null,
      shopRerollCost: 10,
      log: [{ id: uuid(), msg: "You enter the realm. The adventure begins!" }],
      settled: false,
      rollAnimating: false,
      heroDeathPending: false,
    };
  }

  if (action.type === "ROLL_DICE") {
    const r = s.run;
    // A committed roll owns the run until its movement resolves. The phase
    // check is also the reducer-level guard against rapid/double rolls.
    if (!r || r.phase !== "explore" || r.rollAnimating || r.trailCinematic) return s;
    
    // Check level up first before rolling
    if (r.queuedLevels > 0) {
      r.phase = "level_up";
      r.skillOptions = generateSkills(3, r.skills, r.characterId);
      return s;
    }
    if (remainingTrailPaces(r) <= 0) {
      if (r.trailAwakeningSeen) {
        r.phase = "boss_ready";
      } else {
        stageTrailAwakening(r);
      }
      return s;
    }

    const [d1, d2] = rollTwoDice();
    r.lastRolls = [d1, d2];
    // Keep the authentic dice faces even when the final roll would overshoot
    // the finite trail; only the committed movement budget is clamped.
    r.stepsRemaining = Math.min(d1 + d2, remainingTrailPaces(r));
    syncTrailCountdown(r);
    r.phase = "moving";
    r.rollAnimating = true;
    logMessage(r, `Rolled a ${d1 + d2}.`);
  }

  if (action.type === "BEGIN_MOVEMENT") {
    const r = s.run;
    if (!r || r.phase !== "moving" || !r.rollAnimating) return s;
    r.rollAnimating = false;
  }

  if (action.type === "STEP_MOVE") {
    const r = s.run;
    if (!r || r.phase !== "moving" || r.stepsRemaining <= 0 || r.trailCinematic) return s;
    
    // Direct engine callers may advance immediately after ROLL_DICE. The
    // realtime hook waits for BEGIN_MOVEMENT, but a committed step always
    // ends the roll presentation phase.
    r.rollAnimating = false;
    const previousPosition = r.position;
    r.position = Math.min(r.tiles.length - 1, r.position + 1);
    r.stepsRemaining = r.position >= r.tiles.length - 1
      ? 0
      : Math.max(0, r.stepsRemaining - 1);
    syncTrailCountdown(r);

    // Alert at the exact 15-pace crossing. Since this happens during the
    // committed movement, the remaining steps stay durable and resume after
    // FINISH_TRAIL_CINEMATIC. This also catches a roll that overshoots the
    // threshold instead of waiting for a later roll.
    const crossedAlert = r.bossRollsLeft <= ALERT_REMAINING_PACES
      && r.tiles.length - 1 - previousPosition > ALERT_REMAINING_PACES;
    if (crossedAlert) stageTrailAlert(r);
    
    if (r.stepsRemaining === 0) {
      if (r.trailCinematic) {
        r.pendingTileTrigger = true;
      } else {
        triggerTile(s, r);
      }
    }
  }

  if (action.type === "COMPLETE_BOSS_AWAKENING") {
    const r = s.run;
    if (r && r.phase === "boss_awakening") {
      if (r.trailCinematic === "awakening") {
        r.trailCinematic = null;
      }
      r.trailAwakeningSeen = true;
      r.phase = "boss_ready";
      logMessage(r, "The statue awakens. Choose when to challenge the Floor Boss.");
    }
  }

  if (action.type === "FIGHT_BOSS") {
    const r = s.run;
    if (r && r.phase === "boss_ready") {
      initializeBossCombat(r);
    }
  }

  if (action.type === "CHOOSE_SKILL") {
    const r = s.run;
    if (r && r.phase === "level_up" && r.skillOptions) {
      const choice = r.skillOptions.find(o => o.id === action.skillId);
      if (choice) {
        r.skills.push(choice);
        logMessage(r, "Acquired skill: " + choice.name);
      }
      r.queuedLevels--;
      if (r.queuedLevels > 0) {
          r.skillOptions = generateSkills(3, r.skills, r.characterId);
      } else {
        r.skillOptions = null;
        r.phase = "explore";
      }
    }
  }

  if (action.type === "SELECT_ATTACK") {
    const r = s.run;
    if (r && isAttackStyle(action.damageType) && isAttackStyleLearned(r, action.damageType)
      && r.phase === "combat" && r.combatTurn !== "enemy") {
      r.selectedDamageType = action.damageType;
    }
  }

  if (action.type === "PLAYER_ATTACK") {
    resolvePlayerAttack(s, action.targetId);
  }

  if (action.type === "UNC_HOLD_MY_BEER") {
    resolveHoldMyBeer(s, action.targetId);
  }

  if (action.type === "USE_CONSUMABLE") {
    resolveConsumable(s, action.consumable);
  }

  if (action.type === "RESOLVE_ENEMY_TURN") {
    resolveEnemyTurn(s);
  }

  if (action.type === "CONTINUE_POST_COMBAT") {
    const r = s.run;
    if (r && r.enemies.length === 0 && r.phase === "combat") {
      r.phase = "explore";
    }
  }

  if (action.type === "TEST_OF_MIGHT_ENTER") {
    const r = s.run;
    if (r && r.phase === "event_test_of_might") {
      r.enemies = generateEnemies(2, r.floor + 1, true); // 2 elites
      r.playerCombat = {
        attackTimer: 0,
        roundCounter: 0,
        heroAttackSequence: 0,
        lastConsumable: null,
        heroConsumableSequence: 0,
        pendingFireBomb: false,
        enemyAttackSequence: 0,
        firstAttackPending: r.skills.some(sk => sk.type === "first_strike"),
        holdMyBeerUsed: false,
      };
      r.combatTurn = "player";
      r.guardActive = false;
      r.combatFeedback = null;
      r.phase = "combat";
      logMessage(r, "You accepted the test! Elite enemies appear.");
    }
  }
  
  if (action.type === "TEST_OF_MIGHT_LEAVE") {
    const r = s.run;
    if (r && r.phase === "event_test_of_might") {
      r.phase = "explore";
      logMessage(r, "You walked away from the test.");
    }
  }

  if (action.type === "REST_HEAL") {
    const r = s.run;
    if (r && r.phase === "rest") {
      r.hp = Math.min(r.maxHp, r.hp + 50);
      logMessage(r, "You rested and recovered 50 HP.");
      r.phase = "explore";
    }
  }

  if (action.type === "REST_TRAIN") {
    const r = s.run;
    if (r && r.phase === "rest") {
      gainXp(r, 60);
      logMessage(r, "You trained and gained 60 XP.");
      r.phase = "explore";
    }
  }

  if (action.type === "BUY_SHOP") {
    const r = s.run;
    if (r && r.phase === "shop" && r.shopItems) {
      const item = r.shopItems.find(i => i.id === action.itemId);
      if (item && (item.stock ?? 1) > 0 && r.gold >= item.cost) {
        r.gold -= item.cost;
        if (item.type === "consumable" && item.consumable) {
          r.consumables[item.consumable]++;
        } else if (item.type === "heal") {
          // Legacy shop saves may still contain an instant heal listing.
          r.hp = Math.min(r.maxHp, r.hp + (item.value || 0));
        } else if (item.type === "stat") {
          if (item.stat === "attack") r.attack += item.value || 0;
          if (item.stat === "defense") r.defense += item.value || 0;
          if (item.stat === "speed") r.speed += item.value || 0;
          if (item.stat === "maxHp") { r.maxHp += item.value || 0; r.hp += item.value || 0; }
        } else if (item.type === "skill" && item.skill) {
          r.skills.push(item.skill);
        }
        // A listing is single stock. Remove it rather than allowing a
        // rebuy after the purchase.
        r.shopItems = r.shopItems.filter(i => i.id !== action.itemId);
        logMessage(r, "Bought " + item.name + ".");
      }
    }
  }
  
  if (action.type === "REROLL_SHOP") {
    const r = s.run;
    if (r && r.phase === "shop") {
      if (r.gold >= r.shopRerollCost) {
        r.gold -= r.shopRerollCost;
        r.shopItems = generateShop(r.characterId);
        r.shopRerollCost += 10;
        logMessage(r, "Rerolled shop wares.");
      }
    }
  }

  if (action.type === "LEAVE_SHOP") {
    const r = s.run;
    if (r && r.phase === "shop") {
      r.shopItems = null;
      r.phase = "explore";
      logMessage(r, "You leave the merchant.");
    }
  }

  if (action.type === "PLAY_MINIGAME") {
    const r = s.run;
    if (r && r.phase === "minigame") {
      const roll = Math.floor(Math.random() * 100) + 1;
      if (roll <= 30) {
        r.hp -= 20;
        logMessage(r, "The dice betrayed you! Lost 20 HP.");
        if (r.hp <= 0) {
          settleDefeat(s, r);
        } else {
          r.phase = "explore";
        }
      } else if (roll <= 80) {
        r.gold += 40;
        logMessage(r, "A lucky roll! Gained 40 Gold.");
        r.phase = "explore";
      } else {
        r.gemsEarned += 15;
        logMessage(r, "Jackpot! Gained 15 Gems!");
        r.phase = "explore";
      }
    }
  }

  if (action.type === "LEAVE_MINIGAME") {
    const r = s.run;
    if (r && r.phase === "minigame") {
      r.phase = "explore";
      logMessage(r, "You ignored the temptation and moved on.");
    }
  }

  if (action.type === "CONTINUE_RUN") {
    if (s.run && s.run.phase === "victory") {
      if (!s.run.settled) {
        s.meta.gems += s.run.gemsEarned + Math.floor(s.run.gold / 10);
        s.run.settled = true;
      }
      s.run.floor++;
      // Level two reuses the same finite forest trail for now. Restart at its
      // first pace while keeping the generated tile identities stable.
      s.run.position = 0;
      s.run.bossCountdown = s.run.tiles.length - 1;
      s.run.bossRollsLeft = s.run.tiles.length - 1;
      s.run.phase = "explore";
      s.run.isBossCombat = false;
      s.run.enemies = [];
      s.run.playerCombat = null;
      s.run.combatTurn = "player";
      s.run.guardActive = false;
      s.run.combatFeedback = null;
      s.run.stepsRemaining = 0;
      s.run.rollAnimating = false;
      s.run.trailCinematic = null;
      s.run.trailIntroSeen = true;
      s.run.trailAlertSeen = false;
      s.run.trailAwakeningSeen = false;
      s.run.pendingTileTrigger = false;
      logMessage(s.run, "You venture deeper into Floor " + s.run.floor);
    }
  }

  if (action.type === "RETURN_TO_LOBBY") {
    if (s.run && (s.run.phase === "victory" || s.run.phase === "defeat")) {
      if (!s.run.settled) {
        s.meta.gems += s.run.gemsEarned + Math.floor(s.run.gold / 10);
        s.run.settled = true;
      }
      s.run = null;
    }
  }

  return s;
}
