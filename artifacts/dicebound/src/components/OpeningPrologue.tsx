import { Crown, Flame, Shield, SkipForward, Sparkles, Trees } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { getCharacter, type CharacterId } from '../characters';
import { SpriteAnimator } from './SpriteAnimator';
import johnUrl from '../assets/custom-lobby-hero.png';
import uncUrl from '../assets/characters/unc-selection.png';
import alanUrl from '../assets/characters/bard-selection.png';
import './opening-prologue.css';

interface OpeningPrologueProps {
  characterId?: CharacterId;
  step: number;
  onAdvance: () => void;
  onSkip: () => void;
}

const heroLines: Record<CharacterId, string> = {
  john: '“If the forest wants a fight, it picked the right traveler.”',
  unc: '“That lantern speaks in a language older than magic. Something is very wrong.”',
  'alan-a-dale': '“Every cursed kingdom begins with a terrible song. I suppose this is my verse.”',
};

const cards = [
  {
    eyebrow: 'Long ago',
    title: 'The Heartwood Endured',
    body: 'Its magic sheltered every road and village. Four ancient wardens kept watch from the forest to the Ashen Gate.',
    icon: Trees,
    tone: 'heartwood',
  },
  {
    eyebrow: 'Then came the Hollow Crown',
    title: 'The Wardens Fell',
    body: 'The Crown broke their vows. Paths began to shift, creatures turned hostile, and the Heartwood started to die.',
    icon: Crown,
    tone: 'crown',
  },
  {
    eyebrow: 'The silent village',
    title: 'One Lantern Remained',
    body: 'Every village light went dark—except the last forest lantern. It spoke your name and opened the forbidden trail.',
    icon: Sparkles,
    tone: 'lantern',
  },
  {
    eyebrow: 'Your quest',
    title: 'Break the Hollow Crown',
    body: 'Defeat the four corrupted wardens. Recover what they guard. Restore the Heartwood before its final ember dies.',
    icon: Flame,
    tone: 'quest',
  },
] as const;

export function OpeningPrologue({
  characterId,
  step,
  onAdvance,
  onSkip,
}: OpeningPrologueProps) {
  const safeStep = Math.min(cards.length - 1, Math.max(0, Math.floor(step)));
  const card = cards[safeStep];
  const Icon = card.icon;
  const character = getCharacter(characterId);
  const heroSprite = character.id === 'john'
    ? { sprite: 'custom-lobby-hero' as const, fallbackUrl: johnUrl, frames: 9, duration: 1800 }
    : character.id === 'unc'
      ? { sprite: 'unc-selection' as const, fallbackUrl: uncUrl, frames: 17, duration: 3400 }
      : { sprite: 'bard-selection' as const, fallbackUrl: alanUrl, frames: 21, duration: 4200 };
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    continueRef.current?.focus();
  }, [safeStep]);

  return (
    <section
      className={`opening-prologue opening-prologue--${card.tone}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-prologue-title"
      aria-describedby="opening-prologue-copy"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onSkip();
          return;
        }
        if (event.key !== 'Tab') return;
        const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
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
      }}
    >
      <div className="opening-prologue__vignette" aria-hidden="true" />
      <div className="opening-prologue__card" key={safeStep}>
        <div className="opening-prologue__sigil" aria-hidden="true">
          <Icon />
        </div>
        <span className="opening-prologue__eyebrow">{card.eyebrow}</span>
        <h2 id="opening-prologue-title">{card.title}</h2>
        <p id="opening-prologue-copy">{card.body}</p>

        {safeStep === 2 && (
          <div className="opening-prologue__hero">
            <div className="opening-prologue__portrait">
              <SpriteAnimator
                sprite={heroSprite.sprite}
                fallbackUrl={heroSprite.fallbackUrl}
                active
                loop
                frameCount={heroSprite.frames}
                durationMs={heroSprite.duration}
                alt={character.name}
              />
            </div>
            <div>
              <strong>{character.name}</strong>
              <span>{character.className}</span>
              <q>{heroLines[character.id]}</q>
            </div>
          </div>
        )}

        {safeStep === 3 && (
          <div className="opening-prologue__wardens" aria-label="The four corrupted wardens">
            <span>Skeleton King</span>
            <span>Grubgut</span>
            <span>Lady Silkmaw</span>
            <span>Sir Cinder</span>
          </div>
        )}

        <div className="opening-prologue__progress" aria-label={`Story card ${safeStep + 1} of ${cards.length}`}>
          {cards.map((_, index) => (
            <span key={index} className={index === safeStep ? 'is-current' : index < safeStep ? 'is-past' : ''} />
          ))}
        </div>

        <button ref={continueRef} type="button" className="opening-prologue__continue" onClick={onAdvance}>
          {safeStep === cards.length - 1 ? (
            <><Shield aria-hidden="true" /> Enter the Forest</>
          ) : (
            <>Continue <span aria-hidden="true">›</span></>
          )}
        </button>
        <button type="button" className="opening-prologue__skip" onClick={onSkip}>
          Skip story <SkipForward aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}