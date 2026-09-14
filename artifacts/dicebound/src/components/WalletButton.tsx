import { Cloud, Copy, LogOut, RefreshCw, ShieldCheck, Wallet, X } from "lucide-react";
import { useState } from "react";
import type { WalletCloudController } from "../hooks/use-wallet-cloud";
import { ROBINHOOD_CHAIN_ID, shortAddress } from "../wallet/provider";

interface WalletButtonProps {
  wallet: WalletCloudController;
  className?: string;
  compact?: boolean;
}

const STATUS_LABEL: Record<WalletCloudController["status"], string> = {
  guest: "Guest",
  connecting: "Connecting…",
  syncing: "Loading cloud…",
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline",
  conflict: "Conflict",
  expired: "Expired",
  locked: "Locked",
};

const STATUS_COLOR: Record<WalletCloudController["status"], string> = {
  guest: "bg-slate-400",
  connecting: "bg-amber-400 animate-pulse",
  syncing: "bg-amber-400 animate-pulse",
  saved: "bg-emerald-500",
  saving: "bg-amber-400 animate-pulse",
  offline: "bg-orange-500",
  conflict: "bg-rose-500",
  expired: "bg-rose-500",
  locked: "bg-rose-500",
};

function readableDate(date: string | null): string {
  if (!date) return "not synced yet";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? "recently" : parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function WalletButton({ wallet, className = "", compact = false }: WalletButtonProps) {
  const [open, setOpen] = useState(false);
  const status = wallet.status;
  const active = Boolean(wallet.session);

  const connect = () => {
    setOpen(true);
    void wallet.beginConnect();
  };

  const close = () => {
    if (status === "connecting" || status === "syncing" || status === "saving") return;
    // Cancelling a cloud/device choice is an explicit return to guest mode.
    // The wallet-specific cache remains intact in the hook.
    if (wallet.conflict || (!active && (status === "expired" || status === "locked"))) {
      void wallet.disconnect();
    }
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={active || status !== "guest" ? () => setOpen(true) : connect}
        className={`flex items-center gap-2 rounded-xl border-2 border-[#1c1c1c] bg-white px-3 py-2 font-black text-slate-800 shadow-[0_3px_0_#1c1c1c] transition-transform active:translate-y-0.5 active:shadow-none ${compact ? "text-xs" : "text-sm"} ${className}`}
        aria-label={active ? "Open wallet cloud save status" : "Connect wallet for cloud saves"}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[status]}`} aria-hidden="true" />
        {active ? shortAddress(wallet.address ?? "") : <><Wallet className="h-4 w-4 text-violet-700" /> {compact ? "Wallet" : "Connect wallet"}</>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={close}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-cloud-title"
            className="w-full max-w-[390px] max-h-[90dvh] overflow-y-auto rounded-[28px] border-4 border-[#1c1c1c] bg-white p-5 text-slate-800 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="wallet-cloud-title" className="flex items-center gap-2 text-xl font-black">
                  <Cloud className="h-5 w-5 text-violet-700" /> Cloud save
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-500">Off-chain wallet-linked progress</p>
              </div>
              <button type="button" onClick={close} aria-label="Close wallet dialog" className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border-2 border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between text-sm font-black">
                <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLOR[status]}`} /> Cloud</span>
                <span>{STATUS_LABEL[status]}</span>
              </div>
              {wallet.address && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
                  <span className="truncate">{wallet.address}</span>
                  <button type="button" aria-label="Copy wallet address" onClick={() => void navigator.clipboard?.writeText(wallet.address ?? "")} className="rounded-lg p-1 hover:bg-white">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {wallet.chainId && (
                <div className="mt-1 text-xs font-bold text-slate-500">Network: Robinhood Mainnet (chain {wallet.chainId})</div>
              )}
              {wallet.updatedAt && <div className="mt-1 text-xs font-bold text-slate-400">Last server save: {readableDate(wallet.updatedAt)}</div>}
            </div>

            {wallet.providerChoices.length > 1 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Choose an injected wallet</h3>
                {wallet.providerChoices.map((choice) => (
                  <button
                    type="button"
                    key={choice.uuid}
                    onClick={() => void wallet.chooseProvider(choice)}
                    className="flex w-full items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-3 text-left font-black shadow-sm transition-colors hover:border-violet-400 hover:bg-violet-50"
                  >
                    {choice.icon ? <img src={choice.icon} alt="" className="h-8 w-8 rounded-lg" /> : <Wallet className="h-8 w-8 text-violet-700" />}
                    <span>{choice.name}</span>
                  </button>
                ))}
              </div>
            )}

            {!active && !["connecting", "syncing", "saving"].includes(status) && wallet.providerChoices.length === 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold leading-relaxed text-slate-600">
                  {status === "guest"
                    ? "Connect an injected MetaMask, Rabby, or Robinhood Wallet account to sync your complete save across devices."
                    : "Reconnect and sign in again to resume this wallet's cloud save."}
                </p>
                <button type="button" onClick={connect} className="w-full rounded-2xl border-b-4 border-violet-900 bg-violet-700 py-3 text-lg font-black text-white active:translate-y-1 active:border-b-0">
                  Connect wallet
                </button>
                <p className="text-center text-[11px] font-bold text-slate-400">
                  No NFTs, funds, gas, or transactions. You only sign a short ownership message.
                </p>
              </div>
            )}

            {wallet.error && (
              <div className="mt-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-3 text-sm font-bold leading-relaxed text-rose-700">
                {wallet.error}
              </div>
            )}

            {wallet.conflict && (
              <div className="mt-4 space-y-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3">
                <div className="flex gap-2 text-sm font-black text-amber-900"><ShieldCheck className="h-5 w-5 shrink-0" /> Choose one complete save</div>
                <p className="text-xs font-semibold leading-relaxed text-amber-900">{wallet.conflict.message}</p>
                <p className="text-[11px] font-bold text-amber-800">Cloud saves are not merged: gems, inventory, gear, and any active run move together.</p>
                <div className="grid gap-2">
                  {wallet.conflict.cloudSave && (
                    <button type="button" onClick={() => { wallet.chooseCloud(); setOpen(false); }} className="rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white">
                      Use wallet cloud (revision {wallet.conflict.cloudRevision})
                    </button>
                  )}
                  <button type="button" onClick={() => void wallet.chooseDevice()} className="rounded-xl bg-amber-400 px-3 py-2 text-sm font-black text-slate-900">
                    Replace with this device
                  </button>
                  {wallet.conflict.kind === "cloud-empty" && (
                    <button type="button" onClick={() => { wallet.chooseFresh(); setOpen(false); }} className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-black text-slate-700">
                      Start a fresh wallet save
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {(status === "expired" || status === "locked") && (
                <button type="button" onClick={() => void wallet.beginConnect()} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-violet-700 px-3 py-2 text-sm font-black text-white">
                  <RefreshCw className="h-4 w-4" /> Reconnect wallet
                </button>
              )}
              {(status === "offline" || status === "conflict") && (
                <button type="button" onClick={() => void wallet.retry()} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-slate-200 px-3 py-2 text-sm font-black text-slate-700">
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              )}
              {active && (
                <button type="button" onClick={() => { void wallet.disconnect(); setOpen(false); }} className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-rose-100 px-3 py-2 text-sm font-black text-rose-700">
                  <LogOut className="h-4 w-4" /> Disconnect
                </button>
              )}
            </div>

            <p className="mt-4 text-center text-[10px] font-bold text-slate-400">
              Wallet-linked off-chain storage • chain {ROBINHOOD_CHAIN_ID} • no on-chain activity
            </p>
          </section>
        </div>
      )}
    </>
  );
}