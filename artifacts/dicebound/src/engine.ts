function uuid() {
  return Math.random().toString(36).substring(2, 9);
}

export type TileType = "start" | "enemy" | "elite" | "event" | "shop" | "rest" | "minigame";

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
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  attackTimer: number;
  poisoned?: boolean;
  boss?: boolean;
}

export interface PlayerCombatState {
  attackTimer: number;
  roundCounter: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  type: "poison" | "heal" | "first_strike" | "speed_boost" | "defense_boost" | "vampire" | "execute" | "combo" | "counter";
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: "stat" | "skill" | "heal";
  stat?: "attack" | "defense" | "speed" | "maxHp";
  value?: number;
  skill?: Skill;
}

export interface RunState {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  gold: number;
  gemsEarned: number;
  
  xp: number;
  level: number;
  queuedLevels: number;

  bossRollsLeft: number;
  floor: number;
  
  position: number;
  tiles: Tile[];
  lastRolls: [number, number] | null;
  stepsRemaining: number;
  
  phase: "explore" | "moving" | "combat" | "level_up" | "shop" | "event_test_of_might" | "rest" | "minigame" | "victory" | "defeat";
  
  enemies: EnemyState[];
  playerCombat: PlayerCombatState | null;
  isBossCombat: boolean;
  
  skills: Skill[];
  skillOptions: Skill[] | null;
  shopItems: ShopItem[] | null;
  shopRerollCost: number;
  
  log: { id: string, msg: string }[];
  settled: boolean;
}

export interface GameStateV4 {
  meta: MetaState;
  run: RunState | null;
}

export type GameAction =
  | { type: "START_RUN" }
  | { type: "ROLL_DICE" }
  | { type: "STEP_MOVE" }
  | { type: "TICK_COMBAT"; dtMs: number }
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

const BOARD_SIZE = 24;

export function generateBoard(): Tile[] {
  return Array.from({ length: BOARD_SIZE }).map((_, i) => {
    if (i === 0) return { id: i, type: "start" };
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

function generateSkills(count: number, currentSkills: Skill[]): Skill[] {
  const pool: Skill[] = [
    { id: "s_poison", name: "Poison Strike", description: "Attacks apply poison, dealing damage over time", type: "poison" },
    { id: "s_heal", name: "Life Leech", description: "Heal for 10% of damage dealt", type: "vampire" },
    { id: "s_first_strike", name: "First Strike", description: "Start combat with 50% attack timer filled", type: "first_strike" },
    { id: "s_speed", name: "Adrenaline", description: "+20% Speed in combat", type: "speed_boost" },
    { id: "s_def", name: "Iron Skin", description: "+20% Defense in combat", type: "defense_boost" },
    { id: "s_execute", name: "Executioner", description: "Deal double damage to enemies below 30% HP", type: "execute" },
    { id: "s_combo", name: "Combo Mastery", description: "Every 3rd attack deals 1.5x damage", type: "combo" },
    { id: "s_counter", name: "Counter Mastery", description: "Retaliate for 50% of incoming damage", type: "counter" },
  ];
  
  const available = pool.filter(p => !currentSkills.find(cs => cs.type === p.type));
  return available.sort(() => Math.random() - 0.5).slice(0, count).map(s => ({ ...s, id: uuid() }));
}

function generateShop(): ShopItem[] {
  const items: ShopItem[] = [
    { id: uuid(), name: "Health Potion", description: "Restore 50 HP", type: "heal", value: 50, cost: 25 },
    { id: uuid(), name: "Iron Sword", description: "+5 Attack", type: "stat", stat: "attack", value: 5, cost: 60 },
    { id: uuid(), name: "Steel Shield", description: "+2 Defense", type: "stat", stat: "defense", value: 2, cost: 60 },
    { id: uuid(), name: "Wind Boots", description: "+15 Speed", type: "stat", stat: "speed", value: 15, cost: 50 },
  ];
  // Add a random skill
  const skills = generateSkills(1, []);
  if (skills.length > 0) {
    items.push({ id: uuid(), name: "Skill: " + skills[0].name, description: skills[0].description, type: "skill", skill: skills[0], cost: 150 });
  }
  return items.sort(() => Math.random() - 0.5).slice(0, 3);
}

function generateEnemies(count: number, scale: number, isElite: boolean = false): EnemyState[] {
  const names = ["Goblin", "Slime", "Wolf", "Skeleton", "Bandit"];
  const eliteNames = ["Orc Warlord", "Dire Wolf", "Skeleton King", "Ogre"];
  
  return Array.from({ length: count }).map(() => {
    const name = isElite ? eliteNames[Math.floor(Math.random() * eliteNames.length)] : names[Math.floor(Math.random() * names.length)];
    const hp = Math.floor((20 + scale * 10) * (isElite ? 2 : 1));
    return {
      id: uuid(),
      name,
      hp,
      maxHp: hp,
      attack: Math.floor((5 + scale * 2) * (isElite ? 1.5 : 1)),
      defense: Math.floor((1 + scale * 0.5) * (isElite ? 1.5 : 1)),
      speed: Math.floor(30 + scale * 2 + (isElite ? 10 : 0)),
      attackTimer: 0
    };
  });
}

function generateBoss(floor: number): EnemyState {
  const hp = 150 + floor * 50;
  return {
    id: uuid(),
    name: "The Overlord",
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

function triggerTile(s: GameStateV4, r: RunState) {
  const tile = r.tiles[r.position];
  
  if (r.bossRollsLeft <= 0) {
    r.isBossCombat = true;
    r.enemies = [generateBoss(r.floor)];
    r.playerCombat = { attackTimer: r.skills.some(sk => sk.type === "first_strike") ? 50 : 0, roundCounter: 0 };
    r.phase = "combat";
    logMessage(r, "The Boss has arrived!");
    return;
  }

  if (tile.type === "start") {
    r.phase = "explore";
    logMessage(r, "Passed Start! Healed 20 HP.");
    r.hp = Math.min(r.maxHp, r.hp + 20);
  } else if (tile.type === "enemy" || tile.type === "elite") {
    const count = Math.floor(Math.random() * 3) + 1; // 1 to 3 enemies
    r.enemies = generateEnemies(count, r.floor, tile.type === "elite");
    r.playerCombat = { attackTimer: r.skills.some(sk => sk.type === "first_strike") ? 50 : 0, roundCounter: 0 };
    r.phase = "combat";
    r.isBossCombat = false;
    logMessage(r, `Encountered ${count} ${tile.type === "elite" ? "Elite " : ""}enemies!`);
  } else if (tile.type === "shop") {
    r.phase = "shop";
    r.shopItems = generateShop();
    r.shopRerollCost = 10;
    logMessage(r, "A wandering merchant offers their wares.");
  } else if (tile.type === "event") {
    r.phase = "event_test_of_might";
    logMessage(r, "You face a Test of Might!");
  } else if (tile.type === "rest") {
    r.phase = "rest";
    logMessage(r, "You found a safe place to rest.");
  } else if (tile.type === "minigame") {
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

export function validateState(s: any): GameStateV4 {
  if (!s || s.meta?.version !== 4) return createInitialState();
  if (typeof s.meta.gems !== "number") return createInitialState();
  return s as GameStateV4;
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

export function act(state: GameStateV4, action: GameAction): GameStateV4 {
  const s: GameStateV4 = JSON.parse(JSON.stringify(state));

  if (action.type === "RESET_SAVE") {
    return createInitialState();
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
    const eq = getEquippedStats(s.meta);
    const mHp = 100 + s.meta.talents.vitality * 20 + eq.maxHp;
    s.run = {
      hp: mHp,
      maxHp: mHp,
      attack: 10 + s.meta.talents.power * 3 + eq.attack,
      defense: 2 + eq.defense,
      speed: 40 + s.meta.talents.quickness * 5 + eq.speed,
      gold: 0,
      gemsEarned: 0,
      xp: 0,
      level: 1,
      queuedLevels: 0,
      bossRollsLeft: 30,
      floor: 1,
      position: 0,
      tiles: generateBoard(),
      lastRolls: null,
      stepsRemaining: 0,
      phase: "explore",
      enemies: [],
      playerCombat: null,
      isBossCombat: false,
      skills: [],
      skillOptions: null,
      shopItems: null,
      shopRerollCost: 10,
      log: [{ id: uuid(), msg: "You enter the realm. The adventure begins!" }],
      settled: false
    };
  }

  if (action.type === "ROLL_DICE") {
    const r = s.run;
    if (!r || r.phase !== "explore") return s;
    
    // Check level up first before rolling
    if (r.queuedLevels > 0) {
      r.phase = "level_up";
      r.skillOptions = generateSkills(3, r.skills);
      return s;
    }

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    r.lastRolls = [d1, d2];
    r.stepsRemaining = d1 + d2;
    r.bossRollsLeft--;
    r.phase = "moving";
    logMessage(r, `Rolled a ${d1 + d2}.`);
  }

  if (action.type === "STEP_MOVE") {
    const r = s.run;
    if (!r || r.phase !== "moving" || r.stepsRemaining <= 0) return s;
    
    r.position = (r.position + 1) % BOARD_SIZE;
    r.stepsRemaining--;
    
    if (r.stepsRemaining === 0) {
      triggerTile(s, r);
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
        r.skillOptions = generateSkills(3, r.skills);
      } else {
        r.skillOptions = null;
        r.phase = "explore";
      }
    }
  }

  if (action.type === "TICK_COMBAT") {
    const r = s.run;
    if (!r || r.phase !== "combat" || r.enemies.length === 0 || !r.playerCombat) return s;
    const pc = r.playerCombat;
    
    // Effective stats
    let playerSpeed = r.speed;
    if (r.skills.some(sk => sk.type === "speed_boost")) playerSpeed *= 1.2;
    let playerDef = r.defense;
    if (r.skills.some(sk => sk.type === "defense_boost")) playerDef *= 1.2;
    
    pc.attackTimer += playerSpeed * (action.dtMs / 1000);
    
    r.enemies.forEach(e => {
      e.attackTimer += e.speed * (action.dtMs / 1000);
      
      // Poison tick
      if (e.poisoned && Math.random() < 0.05) {
        e.hp -= 1; // minor poison tick
      }
    });

    if (pc.attackTimer >= 100) {
      pc.attackTimer -= 100;
      pc.roundCounter++;
      
      const target = r.enemies.find(e => e.hp > 0);
      if (target) {
        let dmg = Math.max(1, r.attack - target.defense);
        
        if (r.skills.some(sk => sk.type === "execute") && target.hp < target.maxHp * 0.3) dmg *= 2;
        if (r.skills.some(sk => sk.type === "combo") && pc.roundCounter % 3 === 0) dmg *= 1.5;
        
        target.hp = Math.max(0, Math.floor(target.hp - dmg));
        logMessage(r, `You strike ${target.name} for ${Math.floor(dmg)} damage.`);
        
        if (r.skills.some(sk => sk.type === "poison")) target.poisoned = true;
        if (r.skills.some(sk => sk.type === "vampire")) r.hp = Math.min(r.maxHp, r.hp + Math.floor(dmg * 0.1));
      }
    }
    
    r.enemies.forEach(e => {
      if (e.hp > 0 && e.attackTimer >= 100) {
        e.attackTimer -= 100;
        let dmg = Math.max(1, e.attack - playerDef);
        r.hp = Math.max(0, Math.floor(r.hp - dmg));
        logMessage(r, `${e.name} hits you for ${Math.floor(dmg)} damage.`);
        
        if (r.skills.some(sk => sk.type === "counter")) {
          const counterDmg = Math.max(1, Math.floor(dmg * 0.5));
          e.hp = Math.max(0, e.hp - counterDmg);
          logMessage(r, `You counter ${e.name} for ${counterDmg} damage.`);
        }
      }
    });
    
    r.enemies = r.enemies.filter(e => e.hp > 0);
    
    if (r.hp <= 0) {
      r.phase = "defeat";
      if (!r.settled) {
        s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
        r.settled = true;
      }
      logMessage(r, "You have been defeated...");
    } else if (pc.roundCounter >= 30) {
      r.phase = "defeat";
      if (!r.settled) {
        s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
        r.settled = true;
      }
      logMessage(r, "Combat took too long! You succumbed to exhaustion.");
    } else if (r.enemies.length === 0) {
      if (r.isBossCombat) {
        r.gemsEarned += 50 * r.floor;
        r.gold += 100 + r.floor * 20;
        logMessage(r, "Boss defeated! Gained gems and gold.");
        r.phase = "victory";
      } else {
        r.gold += 15 + r.floor * 5;
        gainXp(r, 40 + r.floor * 10);
        logMessage(r, "Enemies defeated! Gained gold and XP.");
        r.phase = "explore";
      }
    }
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
      r.playerCombat = { attackTimer: r.skills.some(sk => sk.type === "first_strike") ? 50 : 0, roundCounter: 0 };
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
      if (item && r.gold >= item.cost) {
        r.gold -= item.cost;
        if (item.type === "heal") {
          r.hp = Math.min(r.maxHp, r.hp + (item.value || 0));
        } else if (item.type === "stat") {
          if (item.stat === "attack") r.attack += item.value || 0;
          if (item.stat === "defense") r.defense += item.value || 0;
          if (item.stat === "speed") r.speed += item.value || 0;
          if (item.stat === "maxHp") { r.maxHp += item.value || 0; r.hp += item.value || 0; }
        } else if (item.type === "skill" && item.skill) {
          r.skills.push(item.skill);
        }
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
        r.shopItems = generateShop();
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
          r.phase = "defeat";
          if (!r.settled) {
            s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
            r.settled = true;
          }
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
      s.run.bossRollsLeft = 30;
      s.run.phase = "explore";
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
