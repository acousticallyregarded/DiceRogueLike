import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectAndSign,
  discoverWallets,
  normalizeAddress,
  readableWalletError,
  ROBINHOOD_CHAIN_ID,
  watchProvider,
  type Eip1193Provider,
  type WalletInfo,
} from "../wallet/provider";
import {
  createInitialState,
  validateState,
  type GameStateV4,
} from "../engine";

const API_ROOT = "/api";
const WALLET_POINTER_KEY = "dicebound-wallet-last-owner";
const WALLET_SAVE_PREFIX = "dicebound-wallet-save-v1:";
const WALLET_SESSION_EVENT_KEY = "dicebound-wallet-session-event-v1";
const WALLET_LOGOUT_PENDING_KEY = "dicebound-wallet-logout-pending-v1";
const WALLET_ENVELOPE_VERSION = 1;

const WALLET_PURCHASE_INTENT_KEY = "dicebound-wallet-purchase-intent-v1:";

function purchaseIntentKey(address: string): string {
  return `${WALLET_PURCHASE_INTENT_KEY}${normalizeAddress(address)}`;
}

interface PurchaseIntent {
  symbol: string;
  idempotencyKey: string;
  purchaseId?: string;
}

function readPurchaseIntent(address: string): { intent: PurchaseIntent | null; error: string | null } {
  const read = readLocalValue(purchaseIntentKey(address));
  if (read.error || !read.value) return { intent: null, error: read.error };
  try {
    const parsed = JSON.parse(read.value) as PurchaseIntent;
    if (typeof parsed?.symbol === "string" && typeof parsed?.idempotencyKey === "string") {
      return { intent: parsed, error: null };
    }
    return { intent: null, error: "Invalid intent format." };
  } catch {
    return { intent: null, error: "Could not read intent." };
  }
}

function writePurchaseIntent(address: string, symbol: string, idempotencyKey: string, purchaseId?: string): string | null {
  return writeLocalValue(
    purchaseIntentKey(address),
    JSON.stringify({ symbol, idempotencyKey, purchaseId } satisfies PurchaseIntent)
  );
}

function clearPurchaseIntent(address: string): string | null {
  return removeLocalValue(purchaseIntentKey(address));
}

export type CloudStatus =
  | "guest"
  | "connecting"
  | "syncing"
  | "saved"
  | "saving"
  | "offline"
  | "conflict"
  | "expired"
  | "locked";

export interface CloudRecord {
  save: GameStateV4 | null;
  revision: number;
  updatedAt: string | null;
}

export interface WalletSaveEnvelope {
  version: 1;
  address: string;
  save: GameStateV4;
  revision: number;
  updatedAt: string | null;
  pendingDirty: boolean;
}

export interface WalletSession {
  address: string;
  chainId: number;
  csrfToken: string;
  provider: Eip1193Provider | null;
}

export interface WalletConflict {
  kind: "cloud-device" | "cloud-empty" | "revision";
  cloudSave: GameStateV4 | null;
  cloudRevision: number;
  cloudUpdatedAt: string | null;
  deviceSave: GameStateV4;
  message: string;
}

export interface TokenInventoryItem {
  symbol: "GLD" | "SLV";
  tokenAddress: string;
  decimals: number;
  gemCost: number;
  usdValue: string;
  tokenAmount: string;
  quotePrice: string;
  quoteSource: string;
  quoteTimestamp: string;
  quoteDelayed: string;
  delayed: boolean;
  available: boolean;
  escrowBalance: string;
  escrowBalanceBaseUnits: string;
}

export interface TokenPurchaseResponse {
  id: string;
  symbol: string;
  status: "pending" | "signed" | "submitted" | "confirmed" | "failed";
  gemCost: number;
  tokenAmount: string;
  quotePrice: string;
  quoteSource: string;
  quoteTimestamp: string;
  quoteDelayed: string;
  delayed: boolean;
  transactionHash?: string | null;
  redeemableGemBalance?: number;
}

export interface TokenRewardBalances {
  enabled: boolean;
  GLD: string;
  SLV: string;
  GLDValueCents: number;
  SLVValueCents: number;
  count: number;
}

export interface TokenRewardClaim {
  id: string | null;
  status: string;
  GLD: string;
  SLV: string;
  pending: boolean;
}

export interface WalletCloudController {
  canSpendGems: boolean;
  status: CloudStatus;
  session: WalletSession | null;
  address: string | null;
  chainId: number | null;
  revision: number;
  updatedAt: string | null;
  error: string | null;
  providerChoices: WalletInfo[];
  conflict: WalletConflict | null;
  beginConnect: () => Promise<void>;
  chooseProvider: (wallet: WalletInfo) => Promise<void>;
  chooseCloud: () => void;
  chooseDevice: () => Promise<void>;
  chooseFresh: () => void;
  retry: () => Promise<void>;
  disconnect: () => Promise<void>;
  inventory: TokenInventoryItem[] | null;
  refreshInventory: () => Promise<void>;
  isPurchasing: boolean;
  purchaseError: string | null;
  lastTxHash: string | null;
  lastPurchase: TokenPurchaseResponse | null;
  buyToken: (symbol: string) => Promise<void>;
  clearPurchaseState: () => void;
  redeemableGemBalance: number | null;
  redeemableGemsLoading: boolean;
  redeemableGemsError: string | null;
  pendingPurchases: TokenPurchaseResponse[];
  pendingIntent: { symbol: string; idempotencyKey: string } | null;
  refreshRedeemableGems: () => Promise<void>;
  refreshPendingPurchases: () => Promise<void>;
  rewards: TokenRewardBalances | null;
  rewardsLoading: boolean;
  rewardsError: string | null;
  rewardClaim: TokenRewardClaim | null;
  refreshRewards: () => Promise<void>;
  claimRewards: () => Promise<TokenRewardClaim | null>;
}

interface UseWalletCloudArgs {
  state: GameStateV4 | null;
  replaceState: (state: GameStateV4) => void;
  setPaused: (paused: boolean) => void;
  setGuestPersistence: (enabled: boolean) => void;
}

interface PrepareSessionOptions {
  /**
   * A valid HttpOnly session surviving a page boot may restore the last
   * wallet owner. Explicit Connect always keeps the guest/device fork choice.
   */
  autoRestore?: boolean;
}

type HttpError = Error & { status?: number; body?: any };

function apiUrl(path: string): string {
  // Keep the API root independent from Vite's BASE_PATH. The API server is
  // mounted at /api even when the web artifact is served from a sub-path.
  return `${API_ROOT}${path}`;
}

function makeHttpError(response: Response, body: any): HttpError {
  const error = new Error(
    typeof body?.error === "string" ? body.error : `Cloud save request failed (${response.status}).`,
  ) as HttpError;
  error.status = response.status;
  error.body = body;
  return error;
}

async function requestJson(path: string, init?: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: "same-origin",
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch (error) {
    const networkError = new Error("Cloud save is offline.") as HttpError;
    networkError.status = 0;
    networkError.cause = error;
    throw networkError;
  }
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) throw makeHttpError(response, body);
  return body;
}

function walletStorageKey(address: string): string {
  return `${WALLET_SAVE_PREFIX}${normalizeAddress(address)}`;
}

function readLocalValue(key: string): { value: string | null; error: string | null } {
  try {
    return { value: localStorage.getItem(key), error: null };
  } catch {
    return { value: null, error: "Browser storage is unavailable. Cloud saves can still work while this tab stays open." };
  }
}

function writeLocalValue(key: string, value: string): string | null {
  try {
    localStorage.setItem(key, value);
    return null;
  } catch {
    return "Browser storage is unavailable. Your cloud save is safe, but offline recovery is limited.";
  }
}

function removeLocalValue(key: string): string | null {
  try {
    localStorage.removeItem(key);
    return null;
  } catch {
    return "Browser storage is unavailable. The pending wallet logout will be retried when storage works again.";
  }
}

interface LogoutPendingTombstone {
  version: 1;
  address: string;
  createdAt: number;
}

function readLogoutPending(): { tombstone: LogoutPendingTombstone | null; error: string | null } {
  const read = readLocalValue(WALLET_LOGOUT_PENDING_KEY);
  if (read.error || !read.value) return { tombstone: null, error: read.error };
  try {
    const parsed = JSON.parse(read.value) as LogoutPendingTombstone;
    if (parsed?.version !== 1 || typeof parsed.address !== "string") {
      return { tombstone: null, error: "A pending wallet logout marker was invalid and was not activated." };
    }
    return {
      tombstone: {
        version: 1,
        address: normalizeAddress(parsed.address),
        createdAt: Number.isFinite(parsed.createdAt) ? parsed.createdAt : Date.now(),
      },
      error: null,
    };
  } catch {
    return { tombstone: null, error: "A pending wallet logout marker could not be read. Guest mode is safe." };
  }
}

function writeLogoutPending(address: string): string | null {
  return writeLocalValue(
    WALLET_LOGOUT_PENDING_KEY,
    JSON.stringify({
      version: 1,
      address: normalizeAddress(address),
      createdAt: Date.now(),
    } satisfies LogoutPendingTombstone),
  );
}

function readEnvelope(address: string): { envelope: WalletSaveEnvelope | null; error: string | null } {
  const read = readLocalValue(walletStorageKey(address));
  if (read.error || !read.value) return { envelope: null, error: read.error };
  try {
    const parsed = JSON.parse(read.value) as WalletSaveEnvelope;
    if (
      parsed?.version !== WALLET_ENVELOPE_VERSION
      || normalizeAddress(parsed.address) !== normalizeAddress(address)
      || !parsed.save
    ) {
      return { envelope: null, error: "The cached wallet save was invalid and was not loaded." };
    }
    return { envelope: { ...parsed, save: validateState(parsed.save) }, error: null };
  } catch {
    return { envelope: null, error: "The cached wallet save could not be read. The cloud copy remains available." };
  }
}

function writeEnvelope(address: string, save: GameStateV4, revision: number, pendingDirty: boolean, updatedAt: string | null): string | null {
  return writeLocalValue(
    walletStorageKey(address),
    JSON.stringify({
      version: WALLET_ENVELOPE_VERSION,
      address: normalizeAddress(address),
      save,
      revision,
      updatedAt,
      pendingDirty,
    } satisfies WalletSaveEnvelope),
  );
}

function setLastOwner(address: string): string | null {
  return writeLocalValue(WALLET_POINTER_KEY, normalizeAddress(address));
}

function broadcastSessionEvent(address: string | null): string | null {
  return writeLocalValue(
    WALLET_SESSION_EVENT_KEY,
    JSON.stringify({ address: address ? normalizeAddress(address) : null, at: Date.now() }),
  );
}

function lastOwner(): { address: string | null; error: string | null } {
  const read = readLocalValue(WALLET_POINTER_KEY);
  return { address: read.value ? normalizeAddress(read.value) : null, error: read.error };
}

function sameSave(left: GameStateV4 | null | undefined, right: GameStateV4 | null | undefined): boolean {
  if (!left || !right) return left === right;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function hasGuestProgress(save: GameStateV4 | null | undefined): boolean {
  if (!save) return false;
  return Boolean(
    save.run
    || save.meta.gems > 0
    || save.meta.inventory.length > 0
    || Object.values(save.meta.talents).some((value) => value > 0),
  );
}

function cloudRecordFrom(body: any): CloudRecord {
  const save = body?.save ? validateState(body.save) : null;
  return {
    save,
    revision: Number.isFinite(body?.revision) ? Math.max(0, Math.floor(body.revision)) : 0,
    updatedAt: typeof body?.updatedAt === "string" ? body.updatedAt : null,
  };
}

function sessionFrom(body: any): WalletSession | null {
  const value = body?.session ?? body;
  if (!value || typeof value.address !== "string") return null;
  const chainId = Number(value.chainId);
  if (normalizeAddress(value.address).length < 4 || chainId !== ROBINHOOD_CHAIN_ID) return null;
  return {
    address: normalizeAddress(value.address),
    chainId,
    csrfToken: typeof value.csrfToken === "string" ? value.csrfToken : "",
    provider: null,
  };
}

interface PendingLogoutResult {
  present: boolean;
  cleared: boolean;
  error?: string;
}

/**
 * Complete a logout left behind by a previous tab/load. A pending marker is
 * deliberately a hard gate: this helper never returns a session for
 * activation and only removes the marker after logout success or a 401.
 */
async function retryPendingLogout(): Promise<PendingLogoutResult> {
  const pending = readLogoutPending();
  if (pending.error) return { present: true, cleared: false, error: pending.error };
  if (!pending.tombstone) return { present: false, cleared: true };

  try {
    const body = await requestJson("/wallet/session", { method: "GET" });
    const restored = sessionFrom(body);
    if (
      !restored
      || restored.address !== pending.tombstone.address
      || !restored.csrfToken
    ) {
      return { present: true, cleared: false };
    }
    await requestJson("/wallet/logout", {
      method: "POST",
      headers: {
        "x-wallet-address": restored.address,
        "x-csrf-token": restored.csrfToken,
      },
    });
    const clearError = removeLocalValue(WALLET_LOGOUT_PENDING_KEY);
    return clearError
      ? { present: true, cleared: false, error: clearError }
      : { present: true, cleared: true };
  } catch (rawError) {
    const requestError = rawError as HttpError;
    if (requestError.status === 401) {
      const clearError = removeLocalValue(WALLET_LOGOUT_PENDING_KEY);
      return clearError
        ? { present: true, cleared: false, error: clearError }
        : { present: true, cleared: true };
    }
    return { present: true, cleared: false };
  }
}

export function useWalletCloud({
  state,
  replaceState,
  setPaused,
  setGuestPersistence,
}: UseWalletCloudArgs): WalletCloudController {
  const [status, setStatus] = useState<CloudStatus>("guest");
  const [session, setSession] = useState<WalletSession | null>(null);
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerChoices, setProviderChoices] = useState<WalletInfo[]>([]);
  const [conflict, setConflict] = useState<WalletConflict | null>(null);

  const [inventory, setInventory] = useState<TokenInventoryItem[] | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastPurchase, setLastPurchase] = useState<TokenPurchaseResponse | null>(null);

  const [redeemableGemBalance, setRedeemableGemBalance] = useState<number | null>(null);
  const [redeemableGemsLoading, setRedeemableGemsLoading] = useState(false);
  const [redeemableGemsError, setRedeemableGemsError] = useState<string | null>(null);
  const [pendingPurchases, setPendingPurchases] = useState<TokenPurchaseResponse[]>([]);
  const [pendingIntent, setPendingIntent] = useState<{ symbol: string; idempotencyKey: string } | null>(null);
  const [rewards, setRewards] = useState<TokenRewardBalances | null>(null);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [rewardsError, setRewardsError] = useState<string | null>(null);
  const [rewardClaim, setRewardClaim] = useState<TokenRewardClaim | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const replaceStateRef = useRef(replaceState);
  replaceStateRef.current = replaceState;
  const setPausedRef = useRef(setPaused);
  setPausedRef.current = setPaused;
  const setGuestPersistenceRef = useRef(setGuestPersistence);
  setGuestPersistenceRef.current = setGuestPersistence;

  const guestOriginalRef = useRef<GameStateV4 | null>(null);
  const trackGuestRef = useRef(true);
  const sessionRef = useRef<WalletSession | null>(null);
  // Keep headers for an invalidated provider session until an explicit
  // disconnect can tombstone/logout it. The public session stays null so the
  // UI cannot treat it as authorized.
  const invalidSessionRef = useRef<WalletSession | null>(null);
  const activeRef = useRef(false);
  const ownerEpochRef = useRef(0);
  const latestQueuedRef = useRef<{ save: GameStateV4; expectedRevision: number; epoch: number } | null>(null);
  const flushPromiseRef = useRef<Promise<void> | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const skipStateRef = useRef<string | null>(null);
  const cleanupProviderRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);
  const localStorageErrorRef = useRef<string | null>(null);
  const restoredSessionRef = useRef<WalletSession | null>(null);
  const autoRestoreSessionRef = useRef(false);
  const observedSaveRef = useRef<string | null>(null);

  const refreshPendingPurchasesRef = useRef<(() => Promise<void>) | null>(null);
  const clearPurchaseState = useCallback(() => {
    setPurchaseError(null);
    setLastTxHash(null);
    setLastPurchase(null);
  }, []);

  const refreshRedeemableGems = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    setRedeemableGemsLoading(true);
    setRedeemableGemsError(null);
    try {
      const body = await requestJson("/wallet/redeemable-gems", {
        method: "GET",
        headers: { "x-wallet-address": s.address },
      });
      if (body && typeof body.balance === "number") {
        setRedeemableGemBalance(body.balance);
      }
    } catch (e) {
      const err = e as HttpError;
      setRedeemableGemsError(err.message || "Failed to fetch redeemable gems");
    } finally {
      setRedeemableGemsLoading(false);
    }
  }, []);

  const refreshPendingPurchases = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;

    let items: TokenPurchaseResponse[] = [];
    try {
      const body = await requestJson("/wallet/purchases/pending", {
        method: "GET",
        headers: { "x-wallet-address": s.address },
      });
      if (body && Array.isArray(body.items)) {
        items = body.items;
        setPendingPurchases(items);
      }
    } catch (e) {
      // ignore
    }

    const read = readPurchaseIntent(s.address);
    if (read.intent) {
      let currentIntent = read.intent;

      const matchedItem = currentIntent.purchaseId
        ? items.find(i => i.id === currentIntent.purchaseId)
        : items.find(i => i.symbol === currentIntent.symbol);

      if (matchedItem) {
        if (!currentIntent.purchaseId) {
          currentIntent = { ...currentIntent, purchaseId: matchedItem.id };
          writePurchaseIntent(s.address, currentIntent.symbol, currentIntent.idempotencyKey, currentIntent.purchaseId);
        }

        if (matchedItem.status === "confirmed" || matchedItem.status === "failed") {
          setLastPurchase(matchedItem);
          if (typeof matchedItem.redeemableGemBalance === 'number') {
            setRedeemableGemBalance(matchedItem.redeemableGemBalance);
          }
          clearPurchaseIntent(s.address);
          setPendingIntent(null);
          return;
        }
      }

      if (currentIntent.purchaseId && !items.find(i => i.id === currentIntent.purchaseId)) {
        try {
          const body = await requestJson(`/wallet/purchase/${currentIntent.purchaseId}`, {
            method: "GET",
            headers: { "x-wallet-address": s.address },
          }) as TokenPurchaseResponse;

          setLastPurchase(body);
          if (typeof body.redeemableGemBalance === 'number') {
            setRedeemableGemBalance(body.redeemableGemBalance);
          }

          if (body.status === "confirmed" || body.status === "failed") {
            clearPurchaseIntent(s.address);
            setPendingIntent(null);
            return;
          }
        } catch (e) {
          // ignore
        }
      }

      setPendingIntent(currentIntent);
    } else {
      setPendingIntent(null);
    }
  }, []);

  refreshPendingPurchasesRef.current = refreshPendingPurchases;

  useEffect(() => {
    if (pendingPurchases.length === 0 && pendingIntent === null) return;

    let timer: number;
    const poll = async () => {
      if (refreshPendingPurchasesRef.current) {
        await refreshPendingPurchasesRef.current();
      }
      timer = window.setTimeout(poll, 5000);
    };
    timer = window.setTimeout(poll, 5000);

    return () => window.clearTimeout(timer);
  }, [pendingPurchases.length, pendingIntent !== null, session?.address]);

  const refreshInventory = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    try {
      const body = await requestJson("/wallet/inventory", {
        method: "GET",
        headers: { "x-wallet-address": s.address },
      });
      if (body && Array.isArray(body.items)) {
        setInventory(body.items);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const refreshRewards = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) {
      setRewards(null);
      return;
    }
    setRewardsLoading(true);
    setRewardsError(null);
    try {
      const body = await requestJson("/wallet/rewards", {
        headers: { "x-wallet-address": s.address },
      }) as TokenRewardBalances;
      if (body && typeof body.GLD === "string" && typeof body.SLV === "string") setRewards(body);
    } catch (rawError) {
      const error = rawError as HttpError;
      setRewardsError(error.body?.error || error.message || "Rewards are unavailable.");
    } finally {
      setRewardsLoading(false);
    }
  }, []);

  const claimRewards = useCallback(async (): Promise<TokenRewardClaim | null> => {
    const s = sessionRef.current;
    if (!s || !activeRef.current) return null;
    setRewardsLoading(true);
    setRewardsError(null);
    try {
      const body = await requestJson("/wallet/rewards/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": s.address,
          "x-csrf-token": s.csrfToken,
        },
        body: JSON.stringify({}),
      }) as TokenRewardClaim;
      setRewardClaim(body);
      await refreshRewards();
      return body;
    } catch (rawError) {
      const error = rawError as HttpError;
      setRewardsError(error.body?.error || error.message || "Reward claim failed.");
      return null;
    } finally {
      setRewardsLoading(false);
    }
  }, [refreshRewards]);

  const invalidateSession = useCallback((nextStatus: "expired" | "locked", message: string) => {
    if (sessionRef.current) invalidSessionRef.current = sessionRef.current;
    activeRef.current = false;
    ownerEpochRef.current += 1;
    sessionRef.current = null;
    setRewards(null);
    setRewardsError(null);
    setRewardClaim(null);
    setSession(null);
    setProviderChoices([]);
    setConflict(null);
    setStatus(nextStatus);
    setError(message);
    setPausedRef.current(true);
  }, []);

  useEffect(() => {
    // Keep the latest complete guest snapshot, not only the first state seen
    // on mount. Explicit wallet auth freezes this ref until disconnect so a
    // wallet run can never replace the guest save.
    if (state && trackGuestRef.current && !activeRef.current && !sessionRef.current) {
      guestOriginalRef.current = state;
    }
  }, [state]);

  const writeCache = useCallback((address: string, save: GameStateV4, rev: number, pending: boolean, at: string | null) => {
    const storageError = writeEnvelope(address, save, rev, pending, at);
    if (storageError) {
      localStorageErrorRef.current = storageError;
      setError(storageError);
    }
  }, []);

  const markStateReplacement = useCallback((save: GameStateV4) => {
    skipStateRef.current = JSON.stringify(save);
    observedSaveRef.current = skipStateRef.current;
    replaceStateRef.current(save);
  }, []);

  const activate = useCallback((nextState: GameStateV4, address: string, rev: number, at: string | null) => {
    activeRef.current = true;
    trackGuestRef.current = false;
    latestQueuedRef.current = null;
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setGuestPersistenceRef.current(false);
    setRevision(rev);
    setUpdatedAt(at);
    setConflict(null);
    setProviderChoices([]);
    setStatus("saved");
    setError(localStorageErrorRef.current);
    markStateReplacement(nextState);
    writeCache(address, nextState, rev, false, at);
    const ownerStorageError = setLastOwner(address);
    if (ownerStorageError) {
      localStorageErrorRef.current = ownerStorageError;
      setError(ownerStorageError);
    }
    const eventStorageError = broadcastSessionEvent(address);
    if (eventStorageError) {
      localStorageErrorRef.current = eventStorageError;
      setError(eventStorageError);
    }
    setPausedRef.current(false);

    void refreshRedeemableGems();
    void refreshPendingPurchases();
    void refreshRewards();
  }, [markStateReplacement, writeCache, refreshRedeemableGems, refreshPendingPurchases, refreshRewards]);

  const setConflictState = useCallback((
    nextConflict: WalletConflict,
    nextStatus: CloudStatus = "conflict",
  ) => {
    activeRef.current = false;
    setStatus(nextStatus);
    setConflict(nextConflict);
    setPausedRef.current(true);
    setGuestPersistenceRef.current(false);
  }, []);

  const fetchCloud = useCallback(async (address: string): Promise<CloudRecord> => {
    const body = await requestJson("/wallet/save", {
      method: "GET",
      headers: { "x-wallet-address": address },
    });
    return cloudRecordFrom(body);
  }, []);

  const buyToken = useCallback(async (symbol: string) => {
    const s = sessionRef.current;
    if (!s || !activeRef.current) return;

    // Create or reuse intent
    let activeIntent = pendingIntent;
    if (!activeIntent || activeIntent.symbol !== symbol) {
      if (activeIntent) {
        setPurchaseError(`Finish checking the pending ${activeIntent.symbol} purchase before buying ${symbol}.`);
        return;
      }
      activeIntent = { symbol, idempotencyKey: crypto.randomUUID() };
      writePurchaseIntent(s.address, symbol, activeIntent.idempotencyKey);
      setPendingIntent(activeIntent);
    }

    setIsPurchasing(true);
    setPurchaseError(null);
    setLastTxHash(null);
    setLastPurchase(null);

    try {
      const body = await requestJson("/wallet/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": s.address,
          "x-csrf-token": s.csrfToken,
          "Idempotency-Key": activeIntent.idempotencyKey,
        },
        body: JSON.stringify({ symbol }),
      }) as TokenPurchaseResponse;

      const txHash = body?.transactionHash || null;
      setLastPurchase(body);

      if (typeof body?.redeemableGemBalance === "number") {
        setRedeemableGemBalance(body.redeemableGemBalance);
      }

      if (body?.status === "failed") {
        setPurchaseError("The on-chain transfer failed.");
        setIsPurchasing(false);
        clearPurchaseIntent(s.address);
        setPendingIntent(null);
        void refreshPendingPurchases();
        return;
      }

      if (body?.id) {
        writePurchaseIntent(s.address, activeIntent.symbol, activeIntent.idempotencyKey, body.id);
        setPendingIntent(prev => prev ? { ...prev, purchaseId: body.id } : null);
      }

      setLastTxHash(txHash);
      if (body?.status === "confirmed") {
        clearPurchaseIntent(s.address);
        setPendingIntent(null);
      }

      setIsPurchasing(false);
      void refreshInventory();
      void refreshPendingPurchases();
    } catch (rawError) {
      const requestError = rawError as HttpError;
      if (requestError.status && requestError.status >= 400 && requestError.status < 500) {
        clearPurchaseIntent(s.address);
        setPendingIntent(null);
      }
      setPurchaseError(requestError.body?.error || requestError.message || "Purchase failed.");
      setIsPurchasing(false);
    }
  }, [refreshInventory, pendingIntent, refreshPendingPurchases]);

  const putCloud = useCallback(async (
    walletSession: WalletSession,
    save: GameStateV4,
    expectedRevision: number,
  ): Promise<CloudRecord> => {
    const body = await requestJson("/wallet/save", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": walletSession.address,
        "x-csrf-token": walletSession.csrfToken,
      },
      body: JSON.stringify({ save, expectedRevision }),
    });
    return cloudRecordFrom(body);
  }, []);

  const makeConflict = useCallback((
    kind: WalletConflict["kind"],
    cloud: CloudRecord,
    deviceSave: GameStateV4,
    message: string,
  ): WalletConflict => ({
    kind,
    cloudSave: cloud.save,
    cloudRevision: cloud.revision,
    cloudUpdatedAt: cloud.updatedAt,
    deviceSave,
    message,
  }), []);

  const flush = useCallback(async (): Promise<void> => {
    if (flushPromiseRef.current) return flushPromiseRef.current;
    const task = (async () => {
      const queued = latestQueuedRef.current;
      const walletSession = sessionRef.current;
      if (!queued || !walletSession || !activeRef.current || queued.epoch !== ownerEpochRef.current) return;
      setStatus("saving");
      try {
        const cloud = await putCloud(walletSession, queued.save, queued.expectedRevision);
        if (!mountedRef.current || sessionRef.current !== walletSession || queued.epoch !== ownerEpochRef.current) return;
        setRevision(cloud.revision);
        setUpdatedAt(cloud.updatedAt);
        if (latestQueuedRef.current === queued) {
          latestQueuedRef.current = null;
          writeCache(walletSession.address, queued.save, cloud.revision, false, cloud.updatedAt);
          setStatus("saved");
        } else {
          // A newer local snapshot arrived while the request was in flight.
          // The acknowledged revision is authoritative for the next PUT.
          latestQueuedRef.current = {
            ...latestQueuedRef.current!,
            expectedRevision: cloud.revision,
          };
          setStatus("saving");
          window.setTimeout(() => void flush(), 0);
        }
      } catch (rawError) {
        const requestError = rawError as HttpError;
        if (requestError.status === 401) {
          invalidateSession("expired", "Your wallet session expired. Reconnect and sign in again before cloud saves resume.");
        } else if (requestError.status === 403) {
          invalidateSession("locked", "This wallet session no longer matches the selected account. No upload was made.");
        } else if (requestError.status === 409) {
          const cloud = cloudRecordFrom(requestError.body ?? {});
          activeRef.current = false;
          setConflictState(
            makeConflict(
              "revision",
              cloud,
              queued.save,
              "This wallet changed on another device. Choose which complete save to keep.",
            ),
          );
          if (flushTimerRef.current !== null) {
            window.clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
          }
        } else {
          setStatus("offline");
          setError("Cloud save is offline. Your latest play is cached on this device.");
        }
      }
    })();
    flushPromiseRef.current = task;
    try {
      await task;
    } finally {
      flushPromiseRef.current = null;
    }
  }, [invalidateSession, makeConflict, putCloud, setConflictState, writeCache]);

  const queueSnapshot = useCallback((save: GameStateV4) => {
    const walletSession = sessionRef.current;
    if (!walletSession || !activeRef.current) return;
    const epoch = ownerEpochRef.current;
    const expectedRevision = revision;
    latestQueuedRef.current = { save, expectedRevision, epoch };
    writeCache(walletSession.address, save, expectedRevision, true, updatedAt);
    if (flushTimerRef.current !== null) window.clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      void flush();
    }, 650);
  }, [flush, revision, updatedAt, writeCache]);

  const prepareSession = useCallback(async (
    walletSession: WalletSession,
    provider?: Eip1193Provider | null,
    options: PrepareSessionOptions = {},
  ) => {
    sessionRef.current = { ...walletSession, provider: provider ?? walletSession.provider };
    invalidSessionRef.current = null;
    trackGuestRef.current = false;
    setSession(sessionRef.current);
    const ownerEpoch = ownerEpochRef.current + 1;
    ownerEpochRef.current = ownerEpoch;
    setStatus("syncing");
    setError(null);
    setPausedRef.current(true);
    setConflict(null);
    const address = walletSession.address;
    let cloud: CloudRecord;
    try {
      cloud = await fetchCloud(address);
    } catch (rawError) {
      if (
        !mountedRef.current
        || sessionRef.current?.address !== address
        || ownerEpochRef.current !== ownerEpoch
      ) return;
      const requestError = rawError as HttpError;
      if (requestError.status === 401) {
        invalidateSession("expired", "Your wallet session expired. Reconnect to load its cloud save.");
      } else if (requestError.status === 403) {
        invalidateSession("locked", "The server rejected this wallet identity. No cloud save was changed.");
      } else {
        // A cloud read outage must not strand the player in a paused guest
        // screen. Do not activate this session or upload the guest state; an
        // explicit reconnect can retry later.
        activeRef.current = false;
        sessionRef.current = null;
        setSession(null);
        setGuestPersistenceRef.current(true);
        trackGuestRef.current = true;
        setStatus("offline");
        setError("Cloud save could not be reached. Retry when you are online.");
        setPausedRef.current(false);
      }
      if (requestError.status === 401 || requestError.status === 403) {
        setPausedRef.current(true);
      }
      return;
    }
    if (
      !mountedRef.current
      || sessionRef.current?.address !== address
      || ownerEpochRef.current !== ownerEpoch
    ) return;

    setRevision(cloud.revision);
    setUpdatedAt(cloud.updatedAt);
    const local = readEnvelope(address);
    if (local.error) {
      localStorageErrorRef.current = local.error;
      setError(local.error);
    }
    const owner = lastOwner();
    if (owner.error) {
      localStorageErrorRef.current = owner.error;
      setError(owner.error);
    }
    const guest = guestOriginalRef.current ?? stateRef.current ?? createInitialState();
    const cached = local.envelope;
    const deviceSave = cached?.pendingDirty ? cached.save : guest;
    const knownOwner = owner.address === address;

    if (cloud.save) {
      const pendingFork = cached?.pendingDirty && !sameSave(cached.save, cloud.save);
      const guestFork = hasGuestProgress(deviceSave)
        && !sameSave(deviceSave, cloud.save)
        && (!options.autoRestore || !knownOwner);
      if (pendingFork || guestFork) {
        setConflictState(
          makeConflict(
            pendingFork ? "revision" : "cloud-device",
            cloud,
            deviceSave,
            pendingFork
              ? "Offline play and the wallet cloud save are both newer. Nothing was merged or discarded."
              : "A device save and this wallet cloud save are different. Choose one complete save.",
          ),
        );
        return;
      }
      activate(cloud.save, address, cloud.revision, cloud.updatedAt);
    } else if (hasGuestProgress(deviceSave)) {
      setConflictState(
        makeConflict(
          "cloud-empty",
          cloud,
          deviceSave,
          "This wallet has no cloud save yet. Save the device progress to this wallet, or start fresh.",
        ),
      );
    } else {
      activate(createInitialState(), address, cloud.revision, cloud.updatedAt);
    }
  }, [activate, fetchCloud, invalidateSession, makeConflict, setConflictState]);

  const authenticate = useCallback(async (wallet: WalletInfo) => {
    const authEpoch = ownerEpochRef.current;
    autoRestoreSessionRef.current = false;
    setStatus("connecting");
    setError(null);
    try {
      const verified = await connectAndSign(
        wallet.provider,
        async (address) => {
          const body = await requestJson("/wallet/challenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, chainId: ROBINHOOD_CHAIN_ID }),
          });
          if (typeof body?.challengeId !== "string" || typeof body?.message !== "string") {
            throw new Error("The server returned an invalid wallet challenge.");
          }
          return { challengeId: body.challengeId, message: body.message };
        },
        async (challengeId, signature) => {
          const body = await requestJson("/wallet/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challengeId, signature }),
          });
          if (typeof body?.address !== "string" || !body?.csrfToken) {
            throw new Error("The server did not return a valid wallet session.");
          }
          return {
            address: body.address,
            chainId: Number(body.chainId),
            csrfToken: body.csrfToken,
          };
        },
      );
      if (!mountedRef.current || ownerEpochRef.current !== authEpoch) return;
      await prepareSession({
        address: verified.address,
        chainId: verified.chainId,
        csrfToken: verified.csrfToken,
        provider: verified.provider,
      }, verified.provider);
      if (sessionRef.current?.provider) {
        cleanupProviderRef.current?.();
        cleanupProviderRef.current = watchProvider(
          sessionRef.current.provider,
          (accounts) => {
            const activeAddress = sessionRef.current?.address;
            if (!activeAddress || !accounts.some((account) => normalizeAddress(account) === activeAddress)) {
              invalidateSession("expired", "The wallet account changed. Reconnect and sign the new account before saving.");
            } else {
              // A same-account event still requires an explicit re-auth. This
              // avoids treating a provider reconnect as proof of ownership.
              invalidateSession("expired", "Wallet accounts changed. Reconnect to re-authorize cloud saves.");
            }
          },
          () => {
            invalidateSession("expired", "The wallet network changed. Reconnect to Robinhood Mainnet before saving.");
          },
        );
      }
    } catch (rawError) {
      if (!mountedRef.current || ownerEpochRef.current !== authEpoch) return;
      const requestError = rawError as HttpError;
      const readable = requestError.status === 0
        ? "The wallet server is offline. Dicebound is still in guest mode."
        : readableWalletError(rawError, requestError.message || "Wallet sign-in was not completed.");
      setError(readable);
      setStatus("guest");
      setProviderChoices([]);
      setPausedRef.current(false);
      setGuestPersistenceRef.current(true);
      trackGuestRef.current = true;
      activeRef.current = false;
    }
  }, [invalidateSession, prepareSession]);

  const beginConnect = useCallback(async () => {
    trackGuestRef.current = false;
    setPausedRef.current(true);
    setStatus("connecting");
    setError(null);
    try {
      const pendingLogout = await retryPendingLogout();
      if (pendingLogout.present && !pendingLogout.cleared) {
        setStatus("offline");
        setError(pendingLogout.error ?? "A previous wallet logout is still pending. Retry it before reconnecting.");
        setPausedRef.current(false);
        setGuestPersistenceRef.current(true);
        trackGuestRef.current = true;
        return;
      }
      const choices = await discoverWallets();
      if (choices.length === 0) {
        throw new Error("No injected wallet was found. Open Dicebound in MetaMask, Rabby, or Robinhood Wallet's browser.");
      }
      setProviderChoices(choices);
      if (choices.length === 1) {
        await authenticate(choices[0]);
      }
    } catch (rawError) {
      setError(readableWalletError(rawError, (rawError as Error)?.message));
      setStatus("guest");
      setProviderChoices([]);
      setPausedRef.current(false);
      setGuestPersistenceRef.current(true);
      trackGuestRef.current = true;
    }
  }, [authenticate]);

  const chooseProvider = useCallback(async (wallet: WalletInfo) => {
    setProviderChoices([]);
    await authenticate(wallet);
  }, [authenticate]);

  const chooseCloud = useCallback(() => {
    if (!conflict || !sessionRef.current?.address || !conflict.cloudSave) return;
    activate(conflict.cloudSave, sessionRef.current.address, conflict.cloudRevision, conflict.cloudUpdatedAt);
    setPausedRef.current(false);
  }, [activate, conflict]);

  const chooseFresh = useCallback(() => {
    if (!sessionRef.current) return;
    activate(createInitialState(), sessionRef.current.address, conflict?.cloudRevision ?? revision, conflict?.cloudUpdatedAt ?? updatedAt);
    setPausedRef.current(false);
  }, [activate, conflict, revision, updatedAt]);

  const chooseDevice = useCallback(async () => {
    const walletSession = sessionRef.current;
    if (!walletSession || !conflict) return;
    const deviceSave = conflict.deviceSave;
    const choiceEpoch = ownerEpochRef.current;
    setStatus("saving");
    setError(null);
    try {
      const cloud = await putCloud(walletSession, deviceSave, conflict.cloudRevision);
      if (
        !mountedRef.current
        || ownerEpochRef.current !== choiceEpoch
        || sessionRef.current?.address !== walletSession.address
      ) return;
      activate(deviceSave, walletSession.address, cloud.revision, cloud.updatedAt);
      setPausedRef.current(false);
    } catch (rawError) {
      if (
        !mountedRef.current
        || ownerEpochRef.current !== choiceEpoch
        || sessionRef.current?.address !== walletSession.address
      ) return;
      const requestError = rawError as HttpError;
      if (requestError.status === 409) {
        const cloud = cloudRecordFrom(requestError.body ?? {});
        setConflictState(
          makeConflict("revision", cloud, deviceSave, "The cloud changed while choosing device progress. Choose again."),
        );
      } else if (requestError.status === 401) {
        invalidateSession("expired", "Your wallet session expired. Reconnect before replacing its cloud save.");
      } else if (requestError.status === 403) {
        invalidateSession("locked", "The server rejected this wallet identity. No upload was made.");
      } else {
        // Keep the selected device state in the wallet-specific cache. It can
        // be resumed safely after reload and is never written to the guest key.
        activeRef.current = true;
        setConflict(null);
        latestQueuedRef.current = {
          save: deviceSave,
          expectedRevision: conflict.cloudRevision,
          epoch: ownerEpochRef.current,
        };
        writeCache(walletSession.address, deviceSave, conflict.cloudRevision, true, conflict.cloudUpdatedAt);
        markStateReplacement(deviceSave);
        setStatus("offline");
        setError("Cloud save is offline. Device progress is cached and will retry when you choose Retry.");
        setPausedRef.current(false);
      }
    }
  }, [activate, conflict, invalidateSession, makeConflict, markStateReplacement, putCloud, setConflictState, writeCache]);

  const retry = useCallback(async () => {
    const walletSession = sessionRef.current;
    if (!walletSession) {
      const pendingLogout = await retryPendingLogout();
      if (pendingLogout.present && pendingLogout.cleared) {
        setStatus("guest");
        setError(null);
      } else if (pendingLogout.present) {
        setStatus("offline");
        setError(pendingLogout.error ?? "Logout is still pending; guest mode remains available.");
      } else {
        setError("Reconnect your wallet to retry this cloud session.");
      }
      return;
    }
    const retryEpoch = ownerEpochRef.current;
    if (!activeRef.current && (status === "offline" || status === "syncing")) {
      await prepareSession(walletSession, walletSession.provider, {
        autoRestore: autoRestoreSessionRef.current,
      });
      return;
    }
    if (conflict) {
      try {
        const cloud = await fetchCloud(walletSession.address);
        if (
          !mountedRef.current
          || ownerEpochRef.current !== retryEpoch
          || sessionRef.current?.address !== walletSession.address
        ) return;
        setRevision(cloud.revision);
        setUpdatedAt(cloud.updatedAt);
        setConflict((current) => current
          ? { ...current, cloudSave: cloud.save, cloudRevision: cloud.revision, cloudUpdatedAt: cloud.updatedAt }
          : current);
        setStatus("conflict");
      } catch {
        if (
          !mountedRef.current
          || ownerEpochRef.current !== retryEpoch
          || sessionRef.current?.address !== walletSession.address
        ) return;
        setStatus("offline");
        setError("Cloud save is still offline.");
      }
      return;
    }
    if (latestQueuedRef.current) {
      await flush();
      return;
    }
    try {
      const cloud = await fetchCloud(walletSession.address);
      if (
        !mountedRef.current
        || ownerEpochRef.current !== retryEpoch
        || sessionRef.current?.address !== walletSession.address
      ) return;
      setRevision(cloud.revision);
      setUpdatedAt(cloud.updatedAt);
      setStatus("saved");
      setError(null);
    } catch {
      if (
        !mountedRef.current
        || ownerEpochRef.current !== retryEpoch
        || sessionRef.current?.address !== walletSession.address
      ) return;
      setStatus("offline");
      setError("Cloud save is still offline.");
    }
  }, [conflict, fetchCloud, flush, prepareSession, status]);

  const disconnect = useCallback(async () => {
    const walletSession = sessionRef.current ?? invalidSessionRef.current;
    if (walletSession) {
      const tombstoneError = writeLogoutPending(walletSession.address);
      if (tombstoneError) {
        // Never send logout without a durable retry marker: otherwise a
        // failed request could silently restore the old HttpOnly cookie on
        // the next boot.
        setStatus("offline");
        setError(tombstoneError);
        return;
      }
    }
    // Pause state transitions before the network await. Guest mode is
    // restored immediately below and then unpaused, so a disconnected player
    // can keep playing offline while logout retries in the background.
    setPausedRef.current(true);
    cleanupProviderRef.current?.();
    cleanupProviderRef.current = null;
    ownerEpochRef.current += 1;
    latestQueuedRef.current = null;
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    activeRef.current = false;
    sessionRef.current = null;
    invalidSessionRef.current = null;
    setRewards(null);
    setRewardsError(null);
    setRewardClaim(null);
    setSession(null);
    setProviderChoices([]);
    setConflict(null);
    setStatus("guest");
    setError(null);
    setRevision(0);
    setUpdatedAt(null);
    setGuestPersistenceRef.current(true);
    trackGuestRef.current = true;
    const guest = guestOriginalRef.current;
    if (guest) markStateReplacement(guest);
    broadcastSessionEvent(walletSession?.address ?? null);
    setPausedRef.current(false);

    if (walletSession) {
      try {
        await requestJson("/wallet/logout", {
          method: "POST",
          headers: {
            "x-wallet-address": walletSession.address,
            "x-csrf-token": walletSession.csrfToken,
          },
        });
        const clearError = removeLocalValue(WALLET_LOGOUT_PENDING_KEY);
        if (clearError) setError(clearError);
      } catch (rawError) {
        const requestError = rawError as HttpError;
        if (requestError.status === 401) {
          // A 401 is an acknowledged end state: the old cookie is already
          // unusable, so the tombstone can be removed safely.
          const clearError = removeLocalValue(WALLET_LOGOUT_PENDING_KEY);
          if (clearError) setError(clearError);
        } else {
          // Keep the marker. Boot will retry with GET /session's fresh CSRF
          // token and will never activate that session while it exists.
          setStatus("offline");
          setError("Logout is pending while offline. Guest mode is available; retry when online.");
        }
      }
    }
  }, [markStateReplacement]);

  // A valid HttpOnly session may survive a reload. Reading it does not request
  // accounts, switch chains, or silently authorize an injected provider.
  useEffect(() => {
    let disposed = false;
    const pendingLogout = readLogoutPending();
    if (pendingLogout.error) {
      setError(pendingLogout.error);
      // If the marker cannot be read, do not risk activating a cookie whose
      // logout may have failed. Guest mode remains available.
      return () => {
        disposed = true;
      };
    }
    if (pendingLogout.tombstone) {
      setStatus("offline");
      setError("Finishing the previous wallet logout; guest mode is available.");
      void retryPendingLogout().then((result) => {
        if (disposed) return;
        if (result.error) setError(result.error);
        else if (result.present && !result.cleared) {
          setStatus("offline");
          setError("Logout is still pending while offline. Guest mode remains available.");
        } else {
          setStatus("guest");
          setError(null);
        }
      });
      return () => {
        disposed = true;
        cleanupProviderRef.current?.();
      };
    }

    requestJson("/wallet/session", { method: "GET" })
      .then(async (body) => {
        if (disposed) return;
        const restored = sessionFrom(body);
        if (!restored || !restored.csrfToken) return;
        if (!stateRef.current) {
          // useGame hydrates its guest key in an effect. Wait for that
          // snapshot before deciding whether a cloud/device choice is needed.
          restoredSessionRef.current = restored;
          return;
        }
        autoRestoreSessionRef.current = true;
        await prepareSession(restored, null, { autoRestore: true });
        if (disposed) return;
        // Listen for provider changes when one is already injected, but never
        // call eth_requestAccounts during page load.
        if (window.ethereum) {
          cleanupProviderRef.current?.();
          cleanupProviderRef.current = watchProvider(
            window.ethereum,
            () => {
              invalidateSession("expired", "The wallet account changed. Reconnect to re-authorize cloud saves.");
            },
            () => {
              invalidateSession("expired", "The wallet network changed. Reconnect to Robinhood Mainnet.");
            },
          );
        }
      })
      .catch(() => {
        // A missing session is the normal guest path. Network errors are
        // intentionally not shown until the player explicitly connects.
      });
    return () => {
      disposed = true;
      mountedRef.current = false;
      cleanupProviderRef.current?.();
    };
  }, [invalidateSession, prepareSession]);

  useEffect(() => {
    if (!state || !restoredSessionRef.current) return;
    const restored = restoredSessionRef.current;
    restoredSessionRef.current = null;
    autoRestoreSessionRef.current = true;
    void prepareSession(restored, null, { autoRestore: true }).then(() => {
      if (!mountedRef.current || !window.ethereum) return;
      cleanupProviderRef.current?.();
      cleanupProviderRef.current = watchProvider(
        window.ethereum,
        () => {
          invalidateSession("expired", "The wallet account changed. Reconnect to re-authorize cloud saves.");
        },
        () => {
          invalidateSession("expired", "The wallet network changed. Reconnect to Robinhood Mainnet.");
        },
      );
    });
  }, [invalidateSession, prepareSession, state]);

  // Keep the browser cache immediate and coalesce the autosave stream. The
  // game action reducer remains authoritative; this effect never mutates it.
  useEffect(() => {
    if (!state || !activeRef.current || !sessionRef.current || conflict) return;
    const serialized = JSON.stringify(state);
    if (skipStateRef.current === serialized) {
      skipStateRef.current = null;
      return;
    }
    // A successful upload changes revision/updatedAt and therefore
    // queueSnapshot's identity. That is not new gameplay: uploading it again
    // would create an endless save/ack loop and keep the local cache dirty.
    if (observedSaveRef.current === serialized) return;
    observedSaveRef.current = serialized;
    queueSnapshot(state);
  }, [conflict, queueSnapshot, state]);

  useEffect(() => {
    const onOnline = () => {
      if (activeRef.current && latestQueuedRef.current) void flush();
      void retryPendingLogout().then((result) => {
        if (!result.present) return;
        if (result.error) setError(result.error);
        else if (result.cleared) {
          setStatus("guest");
          setError(null);
        } else {
          setStatus("offline");
          setError("Logout is still pending while offline. Guest mode remains available.");
        }
      });
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  // Another tab can share the same cookie and wallet cache. Never let a
  // background tab continue uploading after it observes that ownership or
  // the wallet session changed elsewhere.
  useEffect(() => {
    const lockForExternalChange = (message: string) => {
      activeRef.current = false;
      ownerEpochRef.current += 1;
      latestQueuedRef.current = null;
      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (sessionRef.current) invalidSessionRef.current = sessionRef.current;
      sessionRef.current = null;
      setSession(null);
      setConflict(null);
      setStatus("expired");
      setError(message);
      setPausedRef.current(true);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === WALLET_SESSION_EVENT_KEY && event.newValue) {
        lockForExternalChange("This wallet session changed in another Dicebound tab. Reconnect before saving.");
        return;
      }
      const address = sessionRef.current?.address;
      if (address && event.key === walletStorageKey(address) && event.newValue) {
        lockForExternalChange("This wallet save changed in another Dicebound tab. Reconnect to review it safely.");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    canSpendGems: activeRef.current && Boolean(session) && !conflict
      && (status === "saved" || status === "saving" || status === "offline"),
    status,
    session,
    address: session?.address ?? null,
    chainId: session?.chainId ?? null,
    revision,
    updatedAt,
    error,
    providerChoices,
    conflict,
    beginConnect,
    chooseProvider,
    chooseCloud,
    chooseDevice,
    chooseFresh,
    retry,
    disconnect,
    inventory,
    refreshInventory,
    isPurchasing,
    purchaseError,
    lastTxHash,
    lastPurchase,
    buyToken,
    clearPurchaseState,
    redeemableGemBalance,
    redeemableGemsLoading,
    redeemableGemsError,
    pendingPurchases,
    pendingIntent,
    refreshRedeemableGems,
    refreshPendingPurchases,
    rewards,
    rewardsLoading,
    rewardsError,
    rewardClaim,
    refreshRewards,
    claimRewards,
  };
}

export { apiUrl, walletStorageKey };