import { X, Sword, Shield, Wind, Heart, Star } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, CharacterId } from '../characters';
import johnUrl from '../assets/custom-lobby-hero.png';
import uncSelectionUrl from '../assets/characters/unc-selection.png';
import bardSelectionUrl from '../assets/characters/bard-selection.png';
import { SpriteAnimator } from './SpriteAnimator';

interface CharacterPickerModalProps {
  onClose: () => void;
  onConfirm: (characterId: CharacterId) => void;
}

export function CharacterPickerModal({ onClose, onConfirm }: CharacterPickerModalProps) {
  const [selectedId, setSelectedId] = useState<CharacterId>('john');
  const characters = Object.values(CHARACTERS);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);

  return (
    <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md pointer-events-auto" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="character-picker-title"
        className="bg-white rounded-[32px] w-full max-w-[360px] max-h-[85vh] flex flex-col overflow-hidden border-4 border-[#1c1c1c] shadow-2xl" onClick={e => e.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
          if (event.key !== 'Tab') return;
          const controls = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
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
        }}>
        <div className="bg-amber-400 p-4 border-b-4 border-[#1c1c1c] flex justify-between items-center shrink-0">
          <h2 id="character-picker-title" className="text-xl font-black uppercase tracking-widest text-slate-900">Choose Hero</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 bg-white rounded-full border-2 border-slate-900 active:scale-95 text-slate-900 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-400">
            <X className="w-5 h-5"/>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-zinc-100">
          {characters.map(char => {
            const isSelected = selectedId === char.id;
            return (
              <button
                key={char.id}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(char.id)}
                className={`relative w-full text-left rounded-2xl p-3 border-4 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500 focus-visible:ring-offset-2 ${
                  isSelected 
                    ? 'border-fuchsia-500 bg-white shadow-[0_4px_0_rgba(217,70,239,1)]' 
                    : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-slate-400 shadow-[0_4px_0_rgba(203,213,225,1)] hover:-translate-y-0.5'
                }`}
              >
                <div className="flex gap-4 items-center">
                  <div className="w-16 h-16 shrink-0 bg-slate-200 rounded-xl border-2 border-slate-300 flex items-center justify-center overflow-hidden">
                      <SpriteAnimator
                        sprite={char.id === 'john' ? 'custom-lobby-hero' : char.id === 'unc' ? 'unc-selection' : 'bard-selection'}
                        fallbackUrl={char.id === 'john' ? johnUrl : char.id === 'unc' ? uncSelectionUrl : bardSelectionUrl}
                        active
                        loop
                        frameCount={char.id === 'john' ? 9 : char.id === 'unc' ? 17 : 21}
                        durationMs={char.id === 'john' ? 1800 : char.id === 'unc' ? 3400 : 4200}
                        alt={char.id === 'john' ? 'John eating' : char.id === 'unc' ? 'Unc raising his arm' : 'Alan-a-Dale playing his lute'}
                        className="w-14 h-14"
                      />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="font-black text-lg text-slate-800 truncate">{char.name}</h3>
                      {isSelected && <Star className="w-4 h-4 text-fuchsia-500 fill-current shrink-0" />}
                    </div>
                    <div className="text-xs font-bold text-fuchsia-600 uppercase tracking-wider mb-1">
                      {char.className}
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] font-bold text-slate-600 mt-1">
                      <div className="flex items-center gap-1"><Heart className="w-3 h-3 text-red-500" /> {char.baseStats.maxHp}</div>
                      <div className="flex items-center gap-1"><Sword className="w-3 h-3 text-amber-500" /> {char.baseStats.attack}</div>
                      <div className="flex items-center gap-1"><Shield className="w-3 h-3 text-blue-500" /> {char.baseStats.defense}</div>
                      <div className="flex items-center gap-1"><Wind className="w-3 h-3 text-teal-500" /> {char.baseStats.speed}</div>
                    </div>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-3 pt-3 border-t-2 border-slate-100">
                    <p className="text-xs font-semibold text-slate-600 italic leading-snug">
                      {char.description}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4 bg-white border-t-4 border-[#1c1c1c] shrink-0">
          <button 
            onClick={() => onConfirm(selectedId)}
            className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 active:bg-fuchsia-600 text-white py-4 rounded-2xl font-black text-xl uppercase tracking-wider border-4 border-[#1c1c1c] shadow-[0_4px_0_rgba(28,28,28,1)] active:shadow-none active:translate-y-1 transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-fuchsia-500 focus-visible:ring-offset-2"
          >
            Start Adventure
          </button>
        </div>
      </div>
    </div>
  );
}