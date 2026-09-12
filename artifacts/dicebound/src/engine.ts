export type TileType = "start" | "enemy" | "buff" | "debuff" | "minigame" | "shop" | "boss";

export interface Tile {
  id: number;
  type: TileType;
}

export interface EnemyState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  boss: boolean;
  attackTimer: number;
}

export interface PlayerCombatState {
  attackTimer: number;
}

export type UpgradeOption = {
  id: string;
  name: string;
  description: string;
  type: "heal" | "maxHp" | "attack" | "defense" | "speed" | "gems";
  value: number;
};

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: "heal" | "attack" | "defense" | "speed";
  value: number;
}

export interface RunState {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  gold: number;
  gemsEarned: number;
  
  floor: number;
  position: number;
  tiles: Tile[];
  lastRoll: number | null;
  
  phase: "explore" | "combat" | "reward" | "shop" | "minigame" | "event" | "victory" | "defeat";
  
  enemy: EnemyState | null;
  playerCombat: PlayerCombatState | null;
  rewardOptions: UpgradeOption[] | null;
  shopItems: ShopItem[] | null;
  
  log: string[];
  settled: boolean;
}

export interface MetaState {
  version: 3;
  gems: number;
  gear: {
    weaponLevel: number;
    armorLevel: number;
  };
  talents: {
    vitality: number;
    quickness: number;
  };
}

export interface GameStateV2 {
  meta: MetaState;
  run: RunState | null;
}

export type GameAction =
  | { type: "START_RUN" }
  | { type: "ROLL_DICE" }
  | { type: "TICK_COMBAT"; dtMs: number }
  | { type: "CHOOSE_REWARD"; rewardId: string }
  | { type: "PLAY_MINIGAME" }
  | { type: "LEAVE_MINIGAME" }
  | { type: "BUY_SHOP"; itemId: string }
  | { type: "LEAVE_SHOP" }
  | { type: "ACK_EVENT" }
  | { type: "RETURN_TO_LOBBY" }
  | { type: "BUY_GEAR"; stat: "weapon" | "armor" }
  | { type: "BUY_TALENT"; stat: "vitality" | "quickness" }
  | { type: "RESET_SAVE" };

const BOARD_SIZE = 24;

export function generateBoard(floor: number): Tile[] {
  return Array.from({ length: BOARD_SIZE }).map((_, i) => {
    if (i === 0) return { id: i, type: "start" };
    if (i === BOARD_SIZE - 1) return { id: i, type: "boss" };
    
    if (i % 4 === 0) {
      const rnd = Math.random();
      if (rnd < 0.25) return { id: i, type: "buff" };
      if (rnd < 0.50) return { id: i, type: "debuff" };
      if (rnd < 0.75) return { id: i, type: "minigame" };
      return { id: i, type: "shop" };
    }
    
    return { id: i, type: "enemy" };
  });
}

function generateRewards(floor: number, isBoss: boolean): UpgradeOption[] {
  const mult = isBoss ? 2 : 1;
  const pool: Omit<UpgradeOption, "id">[] = [
    { name: "Vitality", description: "+15 Max HP", type: "maxHp", value: 15 * mult },
    { name: "Sharpen", description: "+3 Attack", type: "attack", value: 3 * mult },
    { name: "Harden", description: "+1 Defense", type: "defense", value: 1 * mult },
    { name: "Quickstep", description: "+10 Speed", type: "speed", value: 10 * mult },
    { name: "Mend", description: "Restore 40 HP", type: "heal", value: 40 * mult },
  ];
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled.map((o, i) => ({ ...o, id: "rew_" + i }));
}

function generateShop(floor: number): ShopItem[] {
  const pool: Omit<ShopItem, "id">[] = [
    { name: "Health Potion", description: "Restore 50 HP", type: "heal", value: 50, cost: 20 },
    { name: "Iron Sword", description: "+5 Attack", type: "attack", value: 5, cost: 50 },
    { name: "Steel Shield", description: "+2 Defense", type: "defense", value: 2, cost: 60 },
    { name: "Wind Boots", description: "+15 Speed", type: "speed", value: 15, cost: 40 },
  ];
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 3);
  return shuffled.map((o, i) => ({ ...o, id: "shop_" + i }));
}

function logMessage(r: RunState, msg: string) {
  r.log = [msg, ...r.log].slice(0, 10);
}

function triggerBuffTile(r: RunState) {
  const buffs = [
    { msg: "A glowing spring invigorates you! +30 HP", effect: () => { r.hp = Math.min(r.maxHp, r.hp + 30); } },
    { msg: "You find an ancient whetstone. +2 Attack", effect: () => { r.attack += 2; } },
    { msg: "A mysterious mist makes you faster. +5 Speed", effect: () => { r.speed += 5; } },
  ];
  const b = buffs[Math.floor(Math.random() * buffs.length)];
  b.effect();
  logMessage(r, b.msg);
  r.phase = "event";
}

function triggerDebuffTile(s: GameStateV2, r: RunState) {
  const debuffs = [
    { msg: "A hidden trap spikes you! -15 HP", effect: () => { r.hp -= 15; } },
    { msg: "A thief steals from you in the shadows! -20 Gold", effect: () => { r.gold = Math.max(0, r.gold - 20); } },
    { msg: "A toxic spore weakens you. -2 Speed", effect: () => { r.speed = Math.max(10, r.speed - 2); } }
  ];
  const d = debuffs[Math.floor(Math.random() * debuffs.length)];
  d.effect();
  logMessage(r, d.msg);
  r.phase = "event";
  if (r.hp <= 0) {
    r.phase = "defeat";
    if (!r.settled) {
      s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
      r.settled = true;
    }
  }
}

function applyUpgrade(r: RunState, upg: { type: string, value: number }) {
  if (upg.type === "heal") {
    r.hp = Math.min(r.maxHp, r.hp + upg.value);
  } else if (upg.type === "maxHp") {
    r.maxHp += upg.value;
    r.hp += upg.value;
  } else if (upg.type === "attack") {
    r.attack += upg.value;
  } else if (upg.type === "defense") {
    r.defense += upg.value;
  } else if (upg.type === "speed") {
    r.speed += upg.value;
  } else if (upg.type === "gems") {
    r.gemsEarned += upg.value;
  }
}

export function createInitialState(): GameStateV2 {
  return {
    meta: {
      version: 3,
      gems: 0,
      gear: { weaponLevel: 0, armorLevel: 0 },
      talents: { vitality: 0, quickness: 0 }
    },
    run: null
  };
}

export function getMetaCost(level: number) {
  return 50 + level * 25;
}

export function validateState(s: any): GameStateV2 {
  if (!s || s.meta?.version !== 3) return createInitialState();
  if (typeof s.meta.gems !== "number") return createInitialState();
  return s as GameStateV2;
}

export function act(state: GameStateV2, action: GameAction): GameStateV2 {
  const s: GameStateV2 = JSON.parse(JSON.stringify(state));

  if (action.type === "RESET_SAVE") {
    return createInitialState();
  }

  if (action.type === "BUY_GEAR") {
    if (s.run) return s; 
    const lvl = action.stat === "weapon" ? s.meta.gear.weaponLevel : s.meta.gear.armorLevel;
    const cost = getMetaCost(lvl);
    if (s.meta.gems >= cost) {
      s.meta.gems -= cost;
      if (action.stat === "weapon") s.meta.gear.weaponLevel++;
      else s.meta.gear.armorLevel++;
    }
  }

  if (action.type === "BUY_TALENT") {
    if (s.run) return s; 
    const lvl = action.stat === "vitality" ? s.meta.talents.vitality : s.meta.talents.quickness;
    const cost = getMetaCost(lvl);
    if (s.meta.gems >= cost) {
      s.meta.gems -= cost;
      if (action.stat === "vitality") s.meta.talents.vitality++;
      else s.meta.talents.quickness++;
    }
  }

  if (action.type === "START_RUN") {
    s.run = {
      hp: 100 + s.meta.talents.vitality * 20,
      maxHp: 100 + s.meta.talents.vitality * 20,
      attack: 10 + s.meta.gear.weaponLevel * 3,
      defense: 2 + s.meta.gear.armorLevel * 1,
      speed: 40 + s.meta.talents.quickness * 5,
      gold: 0,
      gemsEarned: 0,
      floor: 1,
      position: 0,
      tiles: generateBoard(1),
      lastRoll: null,
      phase: "explore",
      enemy: null,
      playerCombat: null,
      rewardOptions: null,
      shopItems: null,
      log: ["You enter the realm. The adventure begins!"],
      settled: false
    };
  }

  if (action.type === "ROLL_DICE") {
    const r = s.run;
    if (!r || r.phase !== "explore") return s;
    const roll = Math.floor(Math.random() * 6) + 1;
    r.lastRoll = roll;
    r.position += roll;
    if (r.position >= r.tiles.length - 1) {
      r.position = r.tiles.length - 1;
    }
    logMessage(r, "Rolled a " + roll + ".");
    
    const tile = r.tiles[r.position];
    if (tile.type === "enemy" || tile.type === "boss") {
      const boss = tile.type === "boss";
      const hpScale = boss ? 3 : 1;
      r.enemy = {
        id: "e_" + Date.now(),
        name: boss ? "The Overlord" : ["Goblin", "Slime", "Wolf", "Skeleton"][Math.floor(Math.random() * 4)],
        hp: (25 + r.floor * 15) * hpScale,
        maxHp: (25 + r.floor * 15) * hpScale,
        attack: (6 + r.floor * 3) * (boss ? 1.5 : 1),
        defense: Math.floor((1 + r.floor * 1) * (boss ? 1.5 : 1)),
        speed: 30 + r.floor * 5 + (boss ? 15 : 0),
        boss,
        attackTimer: 0
      };
      r.playerCombat = { attackTimer: 0 };
      r.phase = "combat";
      logMessage(r, "Encountered " + r.enemy.name + "!");
    } else if (tile.type === "buff") {
       triggerBuffTile(r);
    } else if (tile.type === "debuff") {
       triggerDebuffTile(s, r);
    } else if (tile.type === "minigame") {
       r.phase = "minigame";
       logMessage(r, "You stumble upon a mysterious game...");
    } else if (tile.type === "shop") {
       r.phase = "shop";
       r.shopItems = generateShop(r.floor);
       logMessage(r, "A wandering merchant offers their wares.");
    }
  }

  if (action.type === "TICK_COMBAT") {
    const r = s.run;
    if (!r || r.phase !== "combat" || !r.enemy || !r.playerCombat) return s;
    const e = r.enemy;
    const pc = r.playerCombat;
    
    pc.attackTimer += r.speed * (action.dtMs / 1000);
    e.attackTimer += e.speed * (action.dtMs / 1000);

    if (pc.attackTimer >= 100) {
      pc.attackTimer -= 100;
      const dmg = Math.max(1, r.attack - e.defense);
      e.hp = Math.max(0, e.hp - dmg);
      logMessage(r, "You strike " + e.name + " for " + dmg + " damage.");
    }
    
    if (e.hp > 0 && e.attackTimer >= 100) {
      e.attackTimer -= 100;
      const dmg = Math.max(1, e.attack - r.defense);
      r.hp = Math.max(0, r.hp - dmg);
      logMessage(r, e.name + " hits you for " + dmg + " damage.");
    }
    
    if (r.hp <= 0) {
      r.phase = "defeat";
      if (!r.settled) {
        s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
        r.settled = true;
      }
      logMessage(r, "You have been defeated...");
    } else if (e.hp <= 0) {
      r.phase = "reward";
      if (e.boss) {
        r.gemsEarned += 50 * r.floor;
        r.gold += 50 + r.floor * 20;
        logMessage(r, "Boss defeated! Gained gems and gold.");
        r.rewardOptions = generateRewards(r.floor, true);
      } else {
        r.gold += 15 + r.floor * 5;
        logMessage(r, e.name + " defeated! Choose a reward.");
        r.rewardOptions = generateRewards(r.floor, false);
      }
    }
  }

  if (action.type === "CHOOSE_REWARD") {
    const r = s.run;
    if (r && r.phase === "reward" && r.rewardOptions) {
      const choice = r.rewardOptions.find(o => o.id === action.rewardId);
      if (choice) {
        applyUpgrade(r, choice);
        logMessage(r, "Chose " + choice.name + ".");
        r.rewardOptions = null;
        
        // Are we on the boss tile?
        if (r.position === r.tiles.length - 1) {
          if (r.floor >= 3) {
            r.phase = "victory";
            if (!r.settled) {
              s.meta.gems += r.gemsEarned + Math.floor(r.gold / 10);
              r.settled = true;
            }
            logMessage(r, "You have conquered the final floor!");
          } else {
            r.floor++;
            r.position = 0;
            r.tiles = generateBoard(r.floor);
            r.phase = "explore";
            r.hp = r.maxHp;
            logMessage(r, "You descend to Floor " + r.floor + ". HP restored.");
          }
        } else {
          r.phase = "explore";
        }
      }
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

  if (action.type === "BUY_SHOP") {
    const r = s.run;
    if (r && r.phase === "shop" && r.shopItems) {
      const item = r.shopItems.find(i => i.id === action.itemId);
      if (item && r.gold >= item.cost) {
        r.gold -= item.cost;
        applyUpgrade(r, item);
        r.shopItems = r.shopItems.filter(i => i.id !== action.itemId);
        logMessage(r, "Bought " + item.name + ".");
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

  if (action.type === "ACK_EVENT") {
    const r = s.run;
    if (r && r.phase === "event") {
      r.phase = "explore";
    }
  }

  if (action.type === "RETURN_TO_LOBBY") {
    if (s.run && (s.run.phase === "victory" || s.run.phase === "defeat")) {
      // Settlement is already done during phase transition.
      s.run = null;
    }
  }

  return s;
}
