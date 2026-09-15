import { BookMarked, Crown, X } from 'lucide-react';
import type { VictoryInterlude } from '../level-content';
import './victory-report.css';

export function CrownJournal({
  entries,
  onClose,
}: {
  entries: readonly VictoryInterlude[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crown-journal-title"
      onClick={onClose}
    >
      <section
        className="victory-parchment flex max-h-[88dvh] w-full max-w-sm flex-col overflow-hidden p-0 text-[#3f2b18]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[#78512b]/40 p-5">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em]">
              <Crown className="h-4 w-4" />
              The Broken Crown
            </p>
            <h2 id="crown-journal-title" className="mt-1 text-3xl italic">
              Fragment Journal
            </h2>
            <p className="mt-1 text-sm italic">
              {entries.length} of 3 Crown fragments recovered
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Crown Fragment Journal"
            onClick={onClose}
            className="rounded-full border-2 border-[#78512b]/40 bg-[#fff1cf]/60 p-2 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="overflow-y-auto p-5">
          {entries.length === 0 ? (
            <div className="py-8 text-center">
              <BookMarked className="mx-auto h-10 w-10 opacity-50" />
              <p className="mt-3 text-lg italic">No fragments recovered yet.</p>
              <p className="mt-1 text-sm">Defeat the guardians of the Crown to record their stories here.</p>
            </div>
          ) : (
            <ol className="space-y-5">
              {entries.map((entry, index) => (
                <li key={entry.fragment} className="border-b border-[#78512b]/30 pb-5 last:border-0 last:pb-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]">
                    Fragment {index + 1} · {entry.fragment}
                  </p>
                  <h3 className="my-2 text-2xl italic">{entry.title}</h3>
                  <p className="text-base leading-relaxed">{entry.body}</p>
                  <p className="mt-3 border-l-2 border-[#78512b]/50 pl-3 text-sm italic">
                    {entry.destination}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}