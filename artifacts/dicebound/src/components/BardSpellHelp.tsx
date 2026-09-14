export function BardSpellHelp({ dc, armorClass }: { dc: number; armorClass: number }) {
  return (
    <details className="relative text-[10px]">
      <summary className="cursor-pointer font-bold text-indigo-100 underline">Spell rules</summary>
      <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border-2 border-indigo-300 bg-slate-950 p-3 text-[11px] leading-relaxed text-white shadow-xl">
        <p className="font-black">Bard tactics · Spell DC {dc}</p>
        <p className="mt-1">Sleep and Cutting Words: the target rolls a d20 + its Wisdom bonus. A total of {dc} or more resists the spell. Lower Wisdom makes a target easier to affect.</p>
        <p className="mt-2"><strong>Sleep:</strong> a failed save skips the next two enemy turns. Any damage wakes the target early—attack someone else to keep it asleep.</p>
        <p className="mt-2"><strong>Cutting Words:</strong> a failed save deals a lighter psychic hit and hinders the target’s next attack. It rolls two d20s, keeps the lower, and must beat or equal your Armor Class ({armorClass}) to hit. A natural 1 misses; a natural 20 hits.</p>
        <p className="mt-2"><strong>Electric:</strong> full-strength lightning damage with no saving throw. Resistances and immunities still apply.</p>
        <p className="mt-2 text-indigo-200">Simplified, 5e-inspired rules: ordinary attacks stay reliable. Only hindered enemy attacks make an accuracy roll. Tap Spell rules again to close.</p>
      </div>
    </details>
  );
}