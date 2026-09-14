import { act, type GameAction, type GameStateV4 } from "./engine";

export function isGemPurchase(action: GameAction): boolean {
  return action.type === "OPEN_CHEST" || action.type === "BUY_TALENT";
}

// Wallet identity stays outside the serializable save. A guest cannot unlock
// spending by importing a save containing a balance or a claimed wallet address.
export function applyGameAction(
  state: GameStateV4,
  action: GameAction,
  walletSaveActive: boolean,
): GameStateV4 {
  if (isGemPurchase(action) && !walletSaveActive) return state;
  return act(state, action);
}