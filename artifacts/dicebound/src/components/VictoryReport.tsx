import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { BookMarked } from 'lucide-react';
import type { GameAction, RunState } from '../engine';
import type { VictoryInterlude } from '../level-content';
import { getLevelDefinition, getVictoryInterlude } from '../level-content';
import verdantCrownFragment from '../assets/story/verdant-crown-fragment.png';
import mireCrownFragment from '../assets/story/mire-crown-fragment.png';
import silkenCrownFragment from '../assets/story/silken-crown-fragment.png';
import { CrownJournal } from './CrownJournal';
import './victory-report.css';

const crownFragmentImages: Record<string, { src: string; alt: string }> = {
  'The Verdant Shard': {
    src: verdantCrownFragment,
    alt: 'The Verdant Shard, a broken gold Crown fragment set with a glowing green crystal',
  },
  'The Mire Shard': {
    src: mireCrownFragment,
    alt: 'The Mire Shard, a broken gold Crown fragment set with a glowing marsh-green crystal',
  },
  'The Silken Shard': {
    src: silkenCrownFragment,
    alt: 'The Silken Shard, a broken gold Crown fragment set with a glowing purple crystal wrapped in silver silk',
  },
};

export function VictoryReport({ report, recoveredFragments, dispatch }: {
  report: NonNullable<RunState['victoryReport']>;
  recoveredFragments: readonly VictoryInterlude[];
  dispatch: (action: GameAction) => void;
}) {
  const [ready, setReady] = useState(Date.now() >= report.showAt);
  const [journalOpen, setJournalOpen] = useState(false);
  const level = getLevelDefinition(report.floor);
  const interlude = report.boss ? getVictoryInterlude(report.floor) : null;
  const fragmentImage = interlude ? crownFragmentImages[interlude.fragment] : null;
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), Math.max(0, report.showAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [report.showAt]);
  useEffect(() => { if (ready) button.current?.focus(); }, [ready, report.interludeVisible]);
  const keepFocusInDialog = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  // Do not mount a transparent modal while the combat death exit is still
  // settling: even an empty pointer-events layer blocks the board controls.
  if (!ready) return null;
  const journalButton = (
    <button
      type="button"
      onClick={() => setJournalOpen(true)}
      aria-label={`Read Crown Fragment Journal, ${recoveredFragments.length} of 3 recovered`}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border-2 border-[#78512b]/50 bg-[#fff1cf]/45 py-2.5 text-sm italic focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#624323]"
    >
      <BookMarked className="h-4 w-4" />
      Read Crown Journal ({recoveredFragments.length}/3)
    </button>
  );
  if (interlude && report.interludeVisible) {
    return (
      <>
        <div className="absolute inset-0 z-[80] flex items-center justify-center p-5 pointer-events-auto"
          style={{ background: 'rgb(10 8 5 / 72%)' }}>
          <section ref={dialog} role="dialog" aria-modal={!journalOpen} aria-labelledby="victory-interlude-title"
            aria-hidden={journalOpen}
            onKeyDown={keepFocusInDialog}
            className="victory-parchment w-full max-w-sm max-h-[85%] overflow-y-auto p-7 text-center">
            <p className="text-xs tracking-[0.2em] uppercase">Crown recovered · {interlude.fragment}</p>
            <h2 id="victory-interlude-title" className="my-4 text-4xl italic">
              {interlude.title}
            </h2>
            {fragmentImage && (
              <img
                src={fragmentImage.src}
                alt={fragmentImage.alt}
                className="mx-auto -mt-2 mb-3 h-36 w-44 object-contain drop-shadow-[0_8px_8px_rgba(45,73,29,0.35)]"
              />
            )}
            <p className="text-left text-lg leading-relaxed">{interlude.body}</p>
            <p className="mt-5 border-y border-[#78512b]/40 py-4 text-left italic">
              {interlude.destination}
            </p>
            <button ref={button} type="button"
              onClick={() => dispatch({ type: 'DISMISS_VICTORY_REPORT' })}
              className="mt-6 w-full border-2 border-[#624323] rounded-sm bg-[#624323] py-3 text-[#fff1cf] text-lg italic shadow-md transition-colors hover:bg-[#78512b] hover:border-[#78512b] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#624323]">
              Journey to {getLevelDefinition(report.floor + 1).name}
            </button>
            {journalButton}
          </section>
        </div>
        {journalOpen && <CrownJournal entries={recoveredFragments} onClose={() => setJournalOpen(false)} />}
      </>
    );
  }
  return (
    <>
      <div className="absolute inset-0 z-[80] flex items-center justify-center p-5 pointer-events-auto"
        style={{ background: 'rgb(10 8 5 / 55%)' }}>
        <section ref={dialog} role="dialog" aria-modal={!journalOpen} aria-labelledby="victory-report-title"
          aria-hidden={journalOpen}
          onKeyDown={keepFocusInDialog}
          className="victory-parchment w-full max-w-sm max-h-[85%] overflow-y-auto p-7">
          <p className="text-center text-xs tracking-[0.2em] uppercase">Floor {report.floor} · Battle record</p>
          <h2 id="victory-report-title" className="my-3 text-center text-4xl italic">
             {report.boss ? `${level.boss.name} Has Fallen` : 'Victory!'}
          </h2>
          <p className="text-center italic mb-5">The spoils of your triumph</p>
          <dl className="space-y-3 border-y border-[#78512b]/40 py-4 text-lg">
            <div className="flex justify-between"><dt>Experience</dt><dd>+{report.xp} EXP</dd></div>
            <div className="flex justify-between"><dt>Gold</dt><dd>+{report.gold}</dd></div>
            {report.gems > 0 && <div className="flex justify-between"><dt>Gems</dt><dd>+{report.gems}</dd></div>}
            {report.healing > 0 && <div className="flex justify-between"><dt>Health restored</dt><dd>+{report.healing} HP</dd></div>}
          </dl>
          <h3 className="mt-4 text-lg italic">Equipment received</h3>
          {report.equipment.length ? <ul className="mt-1 list-disc pl-4">
            {report.equipment.map((name, i) => <li key={i}>{name}</li>)}
          </ul> : <p className="mt-1 text-sm italic">No equipment found in this battle.</p>}
          <button ref={button} type="button"
            onClick={() => dispatch({ type: interlude ? 'ADVANCE_VICTORY_REPORT' : 'DISMISS_VICTORY_REPORT' })}
            className="mt-6 w-full border-2 border-[#624323] rounded-sm bg-[#624323] py-3 text-[#fff1cf] text-lg italic shadow-md transition-colors hover:bg-[#78512b] hover:border-[#78512b] active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#624323]">
            {interlude ? 'Reveal the Crown Fragment' : 'Continue'}
          </button>
          {interlude && (
            <button type="button"
              onClick={() => dispatch({ type: 'DISMISS_VICTORY_REPORT' })}
              className="mt-3 w-full py-2 text-sm italic underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#624323]">
              Skip story
            </button>
          )}
           {journalButton}
        </section>
      </div>
      {journalOpen && <CrownJournal entries={recoveredFragments} onClose={() => setJournalOpen(false)} />}
    </>
  );
}