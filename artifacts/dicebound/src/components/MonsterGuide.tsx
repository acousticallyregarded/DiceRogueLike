import { X } from "lucide-react";
import {
  BESTIARY_ENTRIES,
  formatDamageType,
  type DamageTrait,
} from "../bestiary";

export const SRD_ATTRIBUTION =
  "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.";

function traitNames(traits: DamageTrait[], suffix: string) {
  if (traits.length === 0) return "None";
  return traits
    .map((trait) => `${formatDamageType(trait.damageType)}${trait.nonmagicalOnly ? " (nonmagical weapons)" : ""} ${suffix}`)
    .join(" • ");
}

export function MonsterGuide({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-[70] bg-black/70 p-4 backdrop-blur-sm flex items-center justify-center pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bestiary-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[28px] border-4 border-[#1c1c1c] shadow-2xl w-full max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="p-4 border-b-2 border-slate-200 flex items-center justify-between">
          <div>
            <h2 id="bestiary-title" className="text-2xl font-black uppercase text-slate-800">
              Monster Guide
            </h2>
            <p className="text-[10px] font-bold text-slate-500">
              Tap an enemy in battle for a focused readout.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Monster Guide"
            onClick={onClose}
            className="rounded-full p-2 bg-slate-100 text-slate-600 border-2 border-slate-200 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {BESTIARY_ENTRIES.map((entry) => (
            <article
              key={entry.key}
              className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-black text-slate-800">{entry.name}</h3>
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-600">
                  {entry.family}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug font-semibold text-slate-600">
                {entry.blurb}
              </p>
              <p className="mt-1 text-[11px] leading-snug font-bold text-slate-700">
                Tactic: {entry.tactic}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-1 text-[10px] font-black">
                <div className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800">
                  Resistance ½: {traitNames(entry.resistances, "½")}
                </div>
                <div className="rounded-lg bg-red-50 px-2 py-1 text-red-800">
                  Vulnerability 2×: {traitNames(entry.vulnerabilities, "2×")}
                </div>
                <div className="rounded-lg bg-slate-200 px-2 py-1 text-slate-800">
                  Immunity 0: {traitNames(entry.immunities, "0")}
                </div>
              </div>
            </article>
          ))}
        </div>

        <footer className="border-t-2 border-slate-200 p-3 text-[9px] leading-snug font-semibold text-slate-500">
          <p>{SRD_ATTRIBUTION}</p>
          <p className="mt-1">
            Adapted stats and attack styles; not full D&amp;D rules. Ochre Jelly, wolves, and goblins use user-supplied Ragnarok Online Poporing, Wolf, and Goblin (Axe) sprite sheets. Other character art is original.
            No external copyrighted art or branding.
          </p>
        </footer>
      </div>
    </div>
  );
}