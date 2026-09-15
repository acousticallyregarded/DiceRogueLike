import { useEffect, useRef, useState } from 'react';
import type { GameAction, RunState } from '../engine';
import { getLevelDefinition, getVictoryInterlude } from '../level-content';
import './victory-report.css';

export function VictoryReport({ report, dispatch }: {
  report: NonNullable<RunState['victoryReport']>;
  dispatch: (action: GameAction) => void;
}) {
  const [ready, setReady] = useState(Date.now() >= report.showAt);
  const level = getLevelDefinition(report.floor);
  const interlude = report.boss ? getVictoryInterlude(report.floor) : null;
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), Math.max(0, report.showAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [report.showAt]);
  useEffect(() => { if (ready) button.current?.focus(); }, [ready]);
  // Do not mount a transparent modal while the combat death exit is still
  // settling: even an empty pointer-events layer blocks the board controls.
  if (!ready) return null;
  if (interlude && report.interludeVisible) {
    return (
      <div className="absolute inset-0 z-[80] flex items-center justify-center p-5 pointer-events-auto"
        style={{ background: 'rgb(10 8 5 / 72%)' }}>
        <section role="dialog" aria-modal="true" aria-labelledby="victory-interlude-title"
          className="victory-parchment w-full max-w-sm max-h-[85%] overflow-y-auto p-7 text-center">
          <p className="text-xs tracking-[0.2em] uppercase">Crown recovered · {interlude.fragment}</p>
          <h2 id="victory-interlude-title" className="my-4 text-4xl italic">
            {interlude.title}
          </h2>
          <p className="text-left text-lg leading-relaxed">{interlude.body}</p>
          <p className="mt-5 border-y border-[#78512b]/40 py-4 text-left italic">
            {interlude.destination}
          </p>
          <button ref={button} type="button"
            onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); button.current?.focus(); } }}
            onClick={() => dispatch({ type: 'DISMISS_VICTORY_REPORT' })}
            className="mt-6 w-full border-2 border-[#624323] rounded-sm bg-[#624323] py-3 text-[#fff1cf] text-lg italic shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#624323]">
            Journey to {getLevelDefinition(report.floor + 1).name}
          </button>
        </section>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center p-5 pointer-events-auto"
      style={{ background: 'rgb(10 8 5 / 55%)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="victory-report-title"
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
            onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); button.current?.focus(); } }}
            onClick={() => dispatch({ type: interlude ? 'ADVANCE_VICTORY_REPORT' : 'DISMISS_VICTORY_REPORT' })}
            className="mt-6 w-full border-2 border-[#624323] rounded-sm bg-[#624323] py-3 text-[#fff1cf] text-lg italic shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#624323]">
            {interlude ? 'Reveal the Crown Fragment' : 'Continue'}
          </button>
          {interlude && (
            <button type="button"
              onClick={() => dispatch({ type: 'DISMISS_VICTORY_REPORT' })}
              className="mt-3 w-full py-2 text-sm italic underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#624323]">
              Skip story
            </button>
          )}
      </section>
    </div>
  );
}