export type TileType = "battle" | "treasure" | "camp" | "event" | "boss";
export interface Tile { id: number; type: TileType }
export interface Enemy { name: string; hp: number; maxHp: number; attack: number; boss: boolean }
export interface GameState {
  version: 1; hp: number; maxHp: number; attack: number; armor: number;
  gold: number; level: number; xp: number; floor: number; position: number;
  roll: number; turns: number; potions: number; kills: number; bestFloor: number;
  tiles: Tile[]; enemy: Enemy | null; phase: "explore" | "combat" | "defeat" | "victory";
  log: string[]; weaponLevel: number; armorLevel: number;
}
const KEY = "dicebound-save-v1";
const random = (max: number) => Math.floor(Math.random() * max);
const board = (): Tile[] => Array.from({ length: 24 }, (_, id) => ({
  id, type: id === 23 ? "boss" : id % 7 === 0 ? "camp" : id % 5 === 0 ? "event" : id % 3 === 0 ? "treasure" : "battle",
}));
export function initialGame(bestFloor = 1): GameState {
  return { version: 1, hp: 100, maxHp: 100, attack: 16, armor: 3, gold: 50,
    level: 1, xp: 0, floor: 1, position: 0, roll: 1, turns: 0, potions: 3,
    kills: 0, bestFloor, tiles: board(), enemy: null, phase: "explore",
    log: ["Your journey begins. Roll the dice to explore the forest."], weaponLevel: 0, armorLevel: 0 };
}
export function saveGame(s: GameState): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}
export function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialGame();
    const s = JSON.parse(raw) as GameState;
    const base = initialGame();
    if (s.version !== 1 || !Object.keys(base).every(k => k in s) ||
      !["explore", "combat", "defeat", "victory"].includes(s.phase) ||
      !Object.entries(base).filter(([, v]) => typeof v === "number")
        .every(([k]) => Number.isFinite(s[k as keyof GameState]) && Number(s[k as keyof GameState]) >= 0) ||
      s.floor < 1 || s.floor > 3 || s.position > 23 || s.maxHp < 1 ||
      !Array.isArray(s.log) || !s.log.every(v => typeof v === "string") ||
      (s.phase === "combat" && (!s.enemy || !Number.isFinite(s.enemy.hp) || !Number.isFinite(s.enemy.attack)))) {
      return { ...base, log: ["The saved adventure could not be read. A new journey has begun."] };
    }
    return { ...s, tiles: board() };
  } catch { return { ...initialGame(), log: ["Saved progress is unavailable. Starting a new journey."] }; }
}
export type Action = "roll" | "attack" | "guard" | "potion" | "weapon" | "armor" | "next" | "restart";
/** Upgrade prices: weapon 40 + 30 * level; armor 35 + 25 * level.
 * Guard deals half damage and blocks 75% of the next attack.
 * Potions restore 45 HP without consuming a combat turn. */
export function act(state: GameState, action: Action): GameState {
  if (action === "restart") return initialGame(state.bestFloor);
  const s: GameState = { ...state, enemy: state.enemy ? { ...state.enemy } : null, log: [...state.log] };
  const note = (text: string) => { s.log = [text, ...s.log].slice(0, 40); };
  if (action === "next") {
    if (s.phase !== "victory" || s.floor >= 3) return state;
    s.floor++; s.bestFloor = Math.max(s.bestFloor, s.floor);
    s.position = 0; s.phase = "explore"; s.enemy = null; s.tiles = board();
    s.hp = s.maxHp; s.potions++;
    note(`Entered chapter ${s.floor}. Health restored and one potion gained.`);
    return s;
  }
  if (s.phase === "defeat" || s.phase === "victory") return state;
  if (action === "potion") {
    if (!s.potions || s.hp >= s.maxHp) return state;
    s.potions--; const healed = Math.min(45, s.maxHp - s.hp); s.hp += healed;
    note(`Drank a potion. Restored ${healed} health.`); return s;
  }
  if (action === "weapon" || action === "armor") {
    const cost = action === "weapon" ? 40 + s.weaponLevel * 30 : 35 + s.armorLevel * 25;
    if (s.gold < cost) return state;
    s.gold -= cost;
    if (action === "weapon") { s.weaponLevel++; s.attack += 5; note("Weapon upgraded. Attack increased by 5."); }
    else { s.armorLevel++; s.armor += 2; note("Armor upgraded. Defense increased by 2."); }
    return s;
  }
  if (action === "roll") {
    if (s.phase !== "explore") return state;
    s.roll = random(6) + 1; s.turns++; s.position = Math.min(23, s.position + s.roll);
    const tile = s.tiles[s.position]!;
    note(`Rolled ${s.roll}. Reached space ${s.position + 1}.`);
    if (tile.type === "battle" || tile.type === "boss") {
      const boss = tile.type === "boss";
      const hp = boss ? 70 + s.floor * 30 : 22 + s.floor * 12 + random(10);
      s.enemy = { name: boss ? ["Thornwood Guardian", "Ashen Golem", "The Hollow King"][s.floor - 1]! :
        ["Forest Slime", "Wild Boar", "Thorn Goblin"][random(3)]!,
        hp, maxHp: hp, attack: boss ? 12 + s.floor * 4 : 7 + s.floor * 3, boss };
      s.phase = "combat"; note(`${s.enemy.name} blocks your path!`);
    } else if (tile.type === "treasure") {
      const coins = 25 + random(26); s.gold += coins; s.potions++;
      note(`Treasure found! Gained ${coins} gold and a potion.`);
    } else if (tile.type === "camp") {
      s.hp = Math.min(s.maxHp, s.hp + 35); note("A quiet campsite restores up to 35 health.");
    } else {
      s.gold += 20; s.attack += 1; note("An ancient shrine grants 20 gold and +1 attack.");
    }
    return s;
  }
  if ((action === "attack" || action === "guard") && s.phase === "combat" && s.enemy) {
    const critical = action === "attack" && random(5) === 0;
    const damage = Math.max(1, Math.round((s.attack + random(5)) * (action === "guard" ? 0.5 : critical ? 1.7 : 1)));
    s.enemy.hp = Math.max(0, s.enemy.hp - damage);
    note(`${critical ? "Critical hit! " : ""}${action === "guard" ? "Guarded strike" : "Strike"} deals ${damage} damage.`);
    if (s.enemy.hp === 0) {
      const boss = s.enemy.boss;
      const gold = boss ? 80 + 20 * s.floor : 15 + random(16);
      s.gold += gold; s.xp += boss ? 65 : 30; s.kills++;
      note(`${s.enemy.name} defeated! +${gold} gold.`);
      while (s.xp >= s.level * 60) {
        s.xp -= s.level * 60; s.level++; s.maxHp += 15; s.hp = Math.min(s.maxHp, s.hp + 35); s.attack += 3;
        note(`Level ${s.level}! +15 maximum health and +3 attack.`);
      }
      s.enemy = null; s.phase = boss ? "victory" : "explore";
      if (boss) note(s.floor === 3 ? "The Hollow King has fallen. Your adventure is complete!" : "Chapter cleared! Continue to the next realm.");
    } else {
      const incoming = Math.max(1, Math.round((s.enemy.attack + random(4) - s.armor) * (action === "guard" ? 0.25 : 1)));
      s.hp = Math.max(0, s.hp - incoming); note(`${s.enemy.name} hits for ${incoming} damage.`);
      if (s.hp === 0) { s.phase = "defeat"; note("Your journey ends here. Begin a new run and try again."); }
    }
    return s;
  }
  return state;
}