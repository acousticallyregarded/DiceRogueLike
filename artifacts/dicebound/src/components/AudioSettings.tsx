import { Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAudio } from "../audio/use-audio";

function statusLabel(status: ReturnType<typeof useAudio>["status"]) {
  if (status === "ready") return "Sound ready";
  if (status === "loading") return "Loading sound…";
  if (status === "blocked") return "Tap or press a key to enable sound";
  if (status === "unavailable") return "Audio unavailable in this browser";
  return "Sound starts after your next gesture";
}

export function AudioSettingsButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const { settings, status, unlock, updateSettings } = useAudio();

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>("button, input");
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  const openSettings = () => {
    void unlock();
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Sound settings"
        title="Sound settings"
        onClick={openSettings}
        className={`rounded-full border-2 border-[#1c1c1c] bg-white p-1.5 text-slate-800 shadow-md active:scale-95 ${className}`}
      >
        {settings.musicMuted && settings.effectsMuted
          ? <VolumeX className="h-4 w-4" aria-hidden="true" />
          : <Volume2 className="h-4 w-4" aria-hidden="true" />}
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm pointer-events-auto"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sound-settings-title"
            className="w-full max-w-sm max-h-[calc(100dvh-2.5rem)] overflow-y-auto rounded-[28px] border-4 border-[#1c1c1c] bg-white p-5 text-slate-800 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="sound-settings-title" className="text-xl font-black uppercase">Sound</h2>
              <button
                type="button"
                aria-label="Close sound settings"
                onClick={() => setOpen(false)}
                className="rounded-full bg-slate-100 p-2 text-slate-700 active:scale-95"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p role="status" className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
              {statusLabel(status)}
            </p>

            <div className="space-y-4">
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-sm font-black">
                  <span>Music</span>
                  <span className="text-slate-500">{Math.round(settings.musicVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.musicVolume}
                  aria-label="Music volume"
                  onChange={event => updateSettings({ musicVolume: Number(event.target.value) })}
                  className="w-full accent-purple-600"
                />
              </label>
              <button
                type="button"
                aria-pressed={settings.musicMuted}
                onClick={() => updateSettings({ musicMuted: !settings.musicMuted })}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-black"
              >
                {settings.musicMuted ? "Music muted" : "Mute music"}
              </button>

              <label className="block">
                <div className="mb-1 flex items-center justify-between text-sm font-black">
                  <span>Effects</span>
                  <span className="text-slate-500">{Math.round(settings.effectsVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.effectsVolume}
                  aria-label="Effects volume"
                  onChange={event => updateSettings({ effectsVolume: Number(event.target.value) })}
                  className="w-full accent-purple-600"
                />
              </label>
              <button
                type="button"
                aria-pressed={settings.effectsMuted}
                onClick={() => updateSettings({ effectsMuted: !settings.effectsMuted })}
                className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-black"
              >
                {settings.effectsMuted ? "Effects muted" : "Mute effects"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-2xl bg-slate-200 py-3 font-black text-slate-700"
            >
              Done
            </button>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}