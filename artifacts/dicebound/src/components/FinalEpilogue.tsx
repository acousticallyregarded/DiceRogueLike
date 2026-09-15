import { Home, ShieldCheck, Sparkles, Sun, Trees } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { getCharacter, type CharacterId } from '../characters';
import { SpriteAnimator } from './SpriteAnimator';
import johnUrl from '../assets/custom-lobby-hero.png';
import uncUrl from '../assets/characters/unc-selection.png';
import alanUrl from '../assets/characters/bard-selection.png';
import './final-epilogue.css';

interface FinalEpilogueProps {
  characterId?: CharacterId;
  step: number;
  gemsEarned: number;
  convertedGold: number;
  onAdvance: () => void;
}

const closingLines: Record<CharacterId, string> = {
  john: '“The roads are safe again. But a fighter’s work is never truly done.”',
  unc: '“The magic runs pure once more. A good flame warms, rather than consumes.”',
  'alan-a-dale': '“Every ballad needs an ending. This one, I think, will be sung for ages.”',
};

const cards = [
  {
    eyebrow: 'The Curse Broken',
    title: 'The Ash Settles',
    body: 'Sir Cinder falls. The Hollow Crown shatters into dust, its dark hold over the forest finally broken.',
    icon: ShieldCheck,
    tone: 'dawn',
  },
  {
    eyebrow: 'A New Morning',
    title: 'The Heartwood Breathes',
    body: 'Twisted paths straighten and dead wood blooms. The sun pierces the canopy for the first time in an age.',
    icon: Trees,
    tone: 'bloom',
  },
  {
    eyebrow: 'The Warden’s Bane',
    title: 'A Hero’s Rest',
    body: 'You stand at the edge of the restored woods. The lanterns glow bright, guiding travelers safely home.',
    icon: Sun,
    tone: 'hero',
  },
  {
    eyebrow: 'Journey’s End',
    title: 'The Tale is Told',
    body: 'Your deeds become legend, and the spoils of your adventure will prepare the next generation of heroes.',
    icon: Sparkles,
    tone: 'rewards',
  },
] as const;

export function FinalEpilogue({
  characterId,
  step,
  gemsEarned,
  convertedGold,
  onAdvance,
}: FinalEpilogueProps) {
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
      className={`final-epilogue final-epilogue--${card.tone}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="final-epilogue-title"
      aria-describedby="final-epilogue-copy"
      onKeyDown={(event) => {
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
      <div className="final-epilogue__vignette" aria-hidden="true" />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {card.title}. {card.body}
      </div>
      <div className="final-epilogue__card" key={safeStep}>
        <div className="final-epilogue__sigil" aria-hidden="true">
          <Icon />
        </div>
        <span className="final-epilogue__eyebrow">{card.eyebrow}</span>
        <h2 id="final-epilogue-title">{card.title}</h2>
        <p id="final-epilogue-copy">{card.body}</p>

        {safeStep === 2 && (
          <div className="final-epilogue__hero">
            <div className="final-epilogue__portrait">
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
              <q>{closingLines[character.id]}</q>
            </div>
          </div>
        )}

        {safeStep === 3 && (
          <div className="final-epilogue__rewards" aria-label="Adventure spoils">
            <div className="final-epilogue__reward-row">
              <span>Gems Recovered</span>
              <strong>+{gemsEarned}</strong>
            </div>
            <div className="final-epilogue__reward-row">
              <span>Gold Converted</span>
              <strong>+{convertedGold}</strong>
            </div>
            <hr className="final-epilogue__reward-divider" />
            <div className="final-epilogue__reward-row final-epilogue__reward-total">
              <span>Total Gems</span>
              <strong>+{gemsEarned + convertedGold}</strong>
            </div>
          </div>
        )}

        <div className="final-epilogue__progress" aria-label={`Epilogue card ${safeStep + 1} of ${cards.length}`}>
          {cards.map((_, index) => (
            <span key={index} className={index === safeStep ? 'is-current' : index < safeStep ? 'is-past' : ''} />
          ))}
        </div>

        <button ref={continueRef} type="button" className="final-epilogue__continue" onClick={onAdvance}>
          {safeStep === cards.length - 1 ? (
            <><Home aria-hidden="true" /> Return Home</>
          ) : (
            <>Continue <span aria-hidden="true">›</span></>
          )}
        </button>
      </div>
    </section>
  );
}
