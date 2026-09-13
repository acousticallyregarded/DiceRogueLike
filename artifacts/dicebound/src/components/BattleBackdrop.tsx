import type { EnemyState } from '../engine';
import { speciesKeyForName } from '../bestiary';
import forest from '../assets/battles/forest.webp';
import camp from '../assets/battles/camp.webp';
import crypt from '../assets/battles/crypt.webp';
import cavern from '../assets/battles/cavern.webp';
import frost from '../assets/battles/frost.webp';
import throne from '../assets/battles/throne.webp';
import './battle-backdrop.css';

export function BattleBackdrop({ enemies, boss }: { enemies: EnemyState[]; boss: boolean }) {
  const species = enemies.map(enemy => enemy.speciesKey ?? speciesKeyForName(enemy.name));
  const image = boss ? throne : species.includes('winter_wolf') ? frost
    : species.includes('mummy') || species.includes('skeleton') ? crypt
    : species.includes('ogre') || species.includes('goblin') ? camp
    : species.includes('ochre_jelly') ? cavern : forest;
  return (
    <div className="battle-backdrop" aria-hidden="true">
      <div className="battle-backdrop__scene" style={{ backgroundImage: `url(${image})` }} />
    </div>
  );
}