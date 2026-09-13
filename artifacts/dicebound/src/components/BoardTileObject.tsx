import type { CSSProperties } from 'react';
import type { TileType } from '../engine';
import rest from '../assets/board-objects/rest.png';
import shop from '../assets/board-objects/shop.png';
import event from '../assets/board-objects/event.png';
import enemy from '../assets/board-objects/enemy.png';
import elite from '../assets/board-objects/elite.png';
import minigame from '../assets/board-objects/minigame.png';
import './board-tile-object.css';

const OBJECTS = {
  minigame: { url: minigame, frames: 9 },
  rest: { url: rest, frames: 9 },
  shop: { url: shop, frames: 9 },
  event: { url: event, frames: 9 },
  enemy: { url: enemy, frames: 13 },
  elite: { url: elite, frames: 13 },
};

export function BoardTileObject({ type, occupied }: { type: TileType; occupied: boolean }) {
  if (!(type in OBJECTS)) return null;
  const object = OBJECTS[type as keyof typeof OBJECTS];
  return (
    <div className="board-object-anchor" style={{ opacity: occupied ? 0 : 1 }} aria-hidden="true">
      <div className="board-object-sprite" style={{
        backgroundImage: `url(${object.url})`,
        backgroundSize: `${object.frames * 100}% 100%`,
        '--object-duration': `${object.frames * 200}ms`,
        '--object-steps': object.frames,
        '--object-end': `${-60 * object.frames}px`,
      } as CSSProperties} />
    </div>
  );
}