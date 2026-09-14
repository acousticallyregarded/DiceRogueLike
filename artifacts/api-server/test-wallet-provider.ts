import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

// Browser-test fixture only. Not imported by either production application.
// Uses unfunded ephemeral keys; supports signatures but no transactions.
export function installTestWallet() {
  const key = "__dicebound_unfunded_test_keys__";
  const stored = sessionStorage.getItem(key);
  const keys = stored ? JSON.parse(stored) : [generatePrivateKey(), generatePrivateKey()];
  sessionStorage.setItem(key, JSON.stringify(keys));
  const accounts = keys.map((value: `0x${string}`) => privateKeyToAccount(value));
  let selected = 0;
  let chainId = "0x1237";
  let rejectSigning = false;
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const emit = (event: string, value: unknown) => listeners.get(event)?.forEach(fn => fn(value));
  const provider = {
    on(event: string, listener: (...args: any[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
    },
    removeListener(event: string, listener: (...args: any[]) => void) {
      listeners.get(event)?.delete(listener);
    },
    async request({ method, params = [] }: { method: string; params?: any[] }) {
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [accounts[selected].address];
      if (method === "eth_chainId") return chainId;
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
        chainId = params[0].chainId;
        emit("chainChanged", chainId);
        return null;
      }
      if (method === "personal_sign") {
        if (rejectSigning) throw Object.assign(new Error("Test user rejected signing"), { code: 4001 });
        return accounts[selected].signMessage({ message: { raw: params[0] } });
      }
      throw new Error("Unsupported test method; transactions are never enabled.");
    },
  };
  const info = { uuid: "e1217324-4f6e-49f1-b542-f59b6867c1ae", name: "Unfunded Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "test.dicebound.wallet" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info, provider } }));
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  const controls = {
    address: () => accounts[selected].address,
    switchAccount(index: number) { selected = index; emit("accountsChanged", [accounts[selected].address]); },
    switchChain(value: string) { chainId = value; emit("chainChanged", value); },
    rejectSigning(value: boolean) { rejectSigning = value; },
    announce,
  };
  Object.assign(window, { __diceboundTestWallet: controls });
  return controls;
}