/**
 * Small, dependency-free EIP-1193/EIP-6963 adapter used by Dicebound.
 *
 * The game never asks for a private key, sends a transaction, or needs a
 * wallet SDK.  A provider is only used to request the currently selected
 * account and to sign the server supplied challenge.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
}

export interface WalletInfo {
  uuid: string;
  name: string;
  icon?: string;
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }

  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<{
      info?: { uuid?: string; name?: string; icon?: string };
      provider: Eip1193Provider;
    }>;
  }
}

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_HEX = "0x1237";
export const ROBINHOOD_CHAIN = {
  chainId: ROBINHOOD_CHAIN_HEX,
  chainName: "Robinhood Mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

function providerName(provider: Eip1193Provider, index: number): string {
  const candidate = provider as Eip1193Provider & {
    isMetaMask?: boolean;
    isRabby?: boolean;
    isRobinhoodWallet?: boolean;
  };
  if (candidate.isRobinhoodWallet) return "Robinhood Wallet";
  if (candidate.isRabby) return "Rabby";
  if (candidate.isMetaMask) return "MetaMask";
  return `Injected wallet ${index + 1}`;
}

function uniqueProviders(providers: Array<{ provider: Eip1193Provider; info?: WalletInfo }>): WalletInfo[] {
  const seen = new Set<Eip1193Provider>();
  return providers.reduce<WalletInfo[]>((result, item, index) => {
    if (seen.has(item.provider)) return result;
    seen.add(item.provider);
    result.push({
      uuid: item.info?.uuid ?? `injected-${index}`,
      name: item.info?.name ?? providerName(item.provider, index),
      icon: item.info?.icon,
      provider: item.provider,
    });
    return result;
  }, []);
}

/**
 * Ask EIP-6963 wallets to announce themselves.  This is intentionally called
 * from an explicit Connect click, rather than on page load.
 */
export async function discoverWallets(waitMs = 250): Promise<WalletInfo[]> {
  if (typeof window === "undefined") return [];

  const announcements: Array<{ provider: Eip1193Provider; info?: WalletInfo }> = [];
  const onAnnouncement = (event: CustomEvent<{ info?: { uuid?: string; name?: string; icon?: string }; provider: Eip1193Provider }>) => {
    if (!event.detail?.provider) return;
    announcements.push({
      provider: event.detail.provider,
      info: event.detail.info
        ? {
            uuid: event.detail.info.uuid ?? "",
            name: event.detail.info.name ?? "",
            icon: event.detail.info.icon,
            provider: event.detail.provider,
          }
        : undefined,
    });
  };

  window.addEventListener("eip6963:announceProvider", onAnnouncement as EventListener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise<void>((resolve) => window.setTimeout(resolve, waitMs));
  window.removeEventListener("eip6963:announceProvider", onAnnouncement as EventListener);

  const injected = window.ethereum;
  const legacyProviders = injected?.providers?.length
    ? injected.providers
    : injected
      ? [injected]
      : [];
  const all = announcements.concat(legacyProviders.map((provider) => ({ provider })));
  return uniqueProviders(all);
}

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export function readableWalletError(error: unknown, fallback = "Wallet connection was not completed."): string {
  const candidate = error as { code?: number | string; message?: string } | null;
  const code = String(candidate?.code ?? "");
  const message = candidate?.message ?? "";
  if (code === "4001" || /user rejected|user denied|rejected by user|denied/i.test(message)) {
    return "The wallet request was declined. Dicebound is still in guest mode.";
  }
  if (code === "4902" || /unknown chain|unrecognized chain/i.test(message)) {
    return "Robinhood Mainnet is not available in this wallet yet.";
  }
  if (/not found|no provider|ethereum/i.test(message) || !window.ethereum) {
    return "No injected wallet was found. Open Dicebound in MetaMask, Rabby, or Robinhood Wallet's browser.";
  }
  if (/chain|network/i.test(message)) {
    return "Switching to Robinhood Mainnet was not completed.";
  }
  return message || fallback;
}

export function utf8Hex(message: string): string {
  const bytes = new TextEncoder().encode(message);
  let result = "0x";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

async function requestChainSwitch(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_CHAIN_HEX }],
    });
  } catch (error) {
    const code = String((error as { code?: number | string })?.code ?? "");
    if (code !== "4902") throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [ROBINHOOD_CHAIN] });
    // Some providers switch as part of add, while others require this second
    // request.  Calling it again is harmless and keeps the state explicit.
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ROBINHOOD_CHAIN_HEX }],
    });
  }
}

export async function connectAndSign(
  provider: Eip1193Provider,
  requestChallenge: (address: string) => Promise<{ challengeId: string; message: string }>,
  verifyChallenge: (challengeId: string, signature: string) => Promise<{
    address: string;
    chainId: number;
    csrfToken: string;
  }>,
): Promise<{ address: string; chainId: number; csrfToken: string; provider: Eip1193Provider }> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : "";
  if (!address) throw new Error("The wallet did not return an account.");

  const chain = await provider.request({ method: "eth_chainId" });
  const chainHex = String(chain).toLowerCase();
  if (chainHex !== ROBINHOOD_CHAIN_HEX) await requestChainSwitch(provider);

  const challenge = await requestChallenge(normalizeAddress(address));
  const signature = await provider.request({
    method: "personal_sign",
    params: [utf8Hex(challenge.message), address],
  });
  if (typeof signature !== "string" || !signature) throw new Error("The wallet did not return a signature.");

  const verified = await verifyChallenge(challenge.challengeId, signature);
  if (normalizeAddress(verified.address) !== normalizeAddress(address)) {
    throw new Error("The signed wallet account changed before verification.");
  }
  if (verified.chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error("The signature was verified on the wrong network.");
  }
  return { ...verified, address: normalizeAddress(verified.address), provider };
}

export function watchProvider(
  provider: Eip1193Provider,
  onAccountsChanged: (accounts: string[]) => void,
  onChainChanged: (chainId: string) => void,
): () => void {
  const accountsHandler = (accounts: unknown) => {
    onAccountsChanged(Array.isArray(accounts) ? accounts.filter((item): item is string => typeof item === "string") : []);
  };
  const chainHandler = (chainId: unknown) => onChainChanged(String(chainId));
  provider.on?.("accountsChanged", accountsHandler);
  provider.on?.("chainChanged", chainHandler);
  return () => {
    provider.removeListener?.("accountsChanged", accountsHandler);
    provider.removeListener?.("chainChanged", chainHandler);
  };
}