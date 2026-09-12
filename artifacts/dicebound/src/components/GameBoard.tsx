import { Tile, TileType } from '../engine';
import { HeroSprite } from './sprites/HeroSprite';
import { MonsterSprite } from './sprites/MonsterSprite';
import { MapPin, Coins, Sparkles, Sword, Skull, ShoppingBag, Gift, SkullIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

const BOARD_WIDTH = 800;
const BOARD_HEIGHT = 600;

function getTilePosition(index: number, total: number) {
  const cols = 6;
  const row = Math.floor(index / cols);
  const isEvenRow = row % 2 === 0;
  const col = isEvenRow ? (index % cols) : (cols - 1 - (index % cols));
  
  const cellW = BOARD_WIDTH / cols;
  const cellH = BOARD_HEIGHT / Math.ceil(total / cols);
  
  return {
    x: col * cellW + cellW / 2,
    y: row * cellH + cellH / 2
  };
}

const TILE_ICONS: Record<TileType, React.ElementType> = {
  start: MapPin,
  enemy: Sword,
  boss: Skull,
  buff: Sparkles,
  debuff: SkullIcon,
  minigame: Gift,
  shop: ShoppingBag
};

const TILE_COLORS: Record<TileType, string> = {
  start: "bg-green-600 text-green-100",
  enemy: "bg-red-900 text-red-100",
  boss: "bg-purple-900 text-purple-100",
  buff: "bg-blue-600 text-blue-100",
  debuff: "bg-zinc-800 text-red-500",
  minigame: "bg-yellow-600 text-yellow-100",
  shop: "bg-amber-800 text-amber-100"
};

export function GameBoard({ tiles, position }: { tiles: Tile[], position: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pos = getTilePosition(position, tiles.length);
    if (containerRef.current) {
      const el = containerRef.current;
      const scrollX = pos.x - el.clientWidth / 2;
      const scrollY = pos.y - el.clientHeight / 2;
      el.scrollTo({ left: scrollX, top: scrollY, behavior: 'smooth' });
    }
  }, [position, tiles.length]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-emerald-950 relative border-4 border-amber-900/50 rounded-xl shadow-2xl"
      style={{
        backgroundImage: 'radial-gradient(#064e3b 2px, transparent 2px)',
        backgroundSize: '32px 32px'
      }}
    >
      <div 
        className="relative"
        style={{ width: BOARD_WIDTH, height: BOARD_HEIGHT }}
      >
        <svg className="absolute inset-0 pointer-events-none w-full h-full">
          <path 
            fill="none" 
            stroke="rgba(217, 119, 6, 0.4)" 
            strokeWidth="12" 
            strokeLinecap="round"
            strokeLinejoin="round"
            d={tiles.map((_, i) => {
              const p = getTilePosition(i, tiles.length);
              return (i === 0 ? "M " + p.x + " " + p.y : "L " + p.x + " " + p.y);
            }).join(" ")}
          />
        </svg>

        {tiles.map((t, i) => {
          const p = getTilePosition(i, tiles.length);
          const Icon = TILE_ICONS[t.type];
          return (
            <div 
              key={t.id}
              className={"absolute w-12 h-12 -ml-6 -mt-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20 transition-transform hover:scale-110 " + TILE_COLORS[t.type]}
              style={{ left: p.x, top: p.y }}
              title={t.type + " tile"}
            >
              <Icon className="w-6 h-6" />
            </div>
          );
        })}

        <div 
          className="absolute w-16 h-16 -ml-8 -mt-12 transition-all duration-700 ease-in-out drop-shadow-2xl z-10"
          style={{ 
            left: getTilePosition(position, tiles.length).x, 
            top: getTilePosition(position, tiles.length).y 
          }}
        >
          <HeroSprite className="w-full h-full drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]" />
        </div>
      </div>
    </div>
  );
}