import { act, createInitialState, GameStateV2 } from './engine.js';

function runAssertions() {
  console.log("Running engine logic assertions...");
  
  let state = createInitialState();
  
  // Grant some gems and test purchase (Meta)
  state.meta.gems = 1000;
  state = act(state, { type: 'BUY_GEAR', stat: 'weapon' });
  state = act(state, { type: 'BUY_TALENT', stat: 'vitality' });
  
  if (state.meta.gear.weaponLevel !== 1) throw new Error("Weapon purchase failed");
  if (state.meta.talents.vitality !== 1) throw new Error("Vitality purchase failed");
  if (state.meta.gems !== 1000 - 50 - 50) throw new Error("Gems not deducted properly");
  console.log("✓ Meta purchases working");

  // Start run
  state = act(state, { type: 'START_RUN' });
  if (!state.run) throw new Error("Run not started");
  
  const initialMaxHp = state.run.maxHp; // should be 100 + 1*20 = 120
  if (initialMaxHp !== 120) throw new Error("Max HP didn't scale with vitality");
  console.log("✓ Run initialization working");

  // Force position to a boss tile (id: 23)
  state.run.position = 23;
  state.run.tiles[23] = { id: 23, type: 'boss' };
  
  // Hack enemy in to simulate landing on boss
  state.run.enemy = {
    id: "boss1",
    name: "The Overlord",
    hp: 1, // 1 hp to kill instantly
    maxHp: 100,
    attack: 10,
    defense: 0,
    speed: 10,
    boss: true,
    attackTimer: 0
  };
  state.run.playerCombat = { attackTimer: 100 }; // ready to attack
  state.run.phase = "combat";

  // Tick combat
  state = act(state, { type: 'TICK_COMBAT', dtMs: 100 });
  
  // Boss dead -> should be reward phase
  if (state.run.phase !== 'reward') throw new Error("Did not transition to reward after boss death: " + state.run.phase);
  if (!state.run.rewardOptions || state.run.rewardOptions.length !== 3) throw new Error("No 3 upgrade options offered after boss");
  console.log("✓ Boss defeat -> Reward phase working");

  // Choose reward
  const rewardId = state.run.rewardOptions[0].id;
  state = act(state, { type: 'CHOOSE_REWARD', rewardId });
  
  // Floor 1 boss reward -> advances to floor 2
  if (state.run.floor !== 2) throw new Error("Floor did not advance after boss 1 reward");
  if (state.run.phase !== 'explore') throw new Error("Did not transition to explore on new floor");
  console.log("✓ Next floor transition working");

  // Skip to Floor 3 boss
  state.run.floor = 3;
  state.run.position = 23;
  state.run.tiles[23] = { id: 23, type: 'boss' };
  state.run.enemy = {
    id: "boss3",
    name: "Final Boss",
    hp: 1,
    maxHp: 100,
    attack: 10,
    defense: 0,
    speed: 10,
    boss: true,
    attackTimer: 0
  };
  state.run.playerCombat = { attackTimer: 100 };
  state.run.phase = "combat";

  // Tick combat
  state = act(state, { type: 'TICK_COMBAT', dtMs: 100 });
  
  // Reward phase
  if (state.run.phase !== 'reward') throw new Error("Floor 3 Boss did not trigger reward");
  
  // Select final reward
  const finalRewardId = state.run!.rewardOptions![0].id;
  
  const gemsBeforeWin = state.meta.gems;
  state = act(state, { type: 'CHOOSE_REWARD', rewardId: finalRewardId });
  
  if (state.run.phase !== 'victory') throw new Error("Did not transition to victory after floor 3 boss reward");
  if (!state.run.settled) throw new Error("Settlement flag not true on victory");
  
  const earned = state.run.gemsEarned + Math.floor(state.run.gold / 10);
  if (state.meta.gems !== gemsBeforeWin + earned) throw new Error("Gems not awarded correctly on victory");
  console.log("✓ Final Boss -> Victory and settlement working");

  // Verify multiple settlements blocked
  state = act(state, { type: 'RETURN_TO_LOBBY' });
  if (state.meta.gems !== gemsBeforeWin + earned) throw new Error("Settlement duplicated in RETURN_TO_LOBBY");
  if (state.run !== null) throw new Error("Run not cleared on return to lobby");
  console.log("✓ Settlement duplication prevented");
  
  console.log("All assertions passed!");
}

try {
  runAssertions();
} catch (e) {
  console.error("Assertion Failed:", e);
  process.exit(1);
}
