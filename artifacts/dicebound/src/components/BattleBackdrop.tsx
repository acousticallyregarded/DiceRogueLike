import type { EnemyState } from '../engine';
import { speciesKeyForName } from '../bestiary';
import forest from '../assets/battles/forest.webp';
import camp from '../assets/battles/camp.webp';
import crypt from '../assets/battles/crypt.webp';
import cavern from '../assets/battles/cavern.webp';
import frost from '../assets/battles/frost.webp';
import throne from '../assets/battles/throne.webp';
import { getBossId } from '../level-content';
import './battle-backdrop.css';

export function BattleBackdrop({ enemies, boss, floor = 1 }: { enemies: EnemyState[]; boss: boolean; floor?: number }) {
  const species = enemies.map(enemy => enemy.speciesKey ?? speciesKeyForName(enemy.name));
  const bossId = enemies.find(enemy => enemy.boss) ? getBossId(enemies.find(enemy => enemy.boss)!) : null;
  const biome = floor === 2 ? 'swamp' : floor === 3 ? 'webwood' : floor === 4 ? 'ashlands' : 'forest';
  const image = biome === 'forest' && boss ? throne : biome === 'forest' ? species.includes('winter_wolf') ? frost
    : species.includes('mummy') || species.includes('skeleton') ? crypt
    : species.includes('ogre') || species.includes('goblin') ? camp
    : species.includes('ochre_jelly') ? cavern : forest : undefined;
  return (
    <div className={`battle-backdrop battle-backdrop--${biome} ${boss ? 'battle-backdrop--boss' : ''}`} aria-hidden="true" data-boss-id={bossId ?? undefined}>
      <div className="battle-backdrop__scene" style={image ? { backgroundImage: `url(${image})` } : undefined}>
        {biome === 'swamp' && <div className="battle-backdrop__bridge" />}
        {biome === 'webwood' && <div className="battle-backdrop__hollow-tree" />}
        {biome === 'ashlands' && <div className="battle-backdrop__fortress-gate" />}
        <div className="battle-backdrop__particles" />
      </div>
    </div>
  );
}