import { Tile, TileType, RunState } from '../engine';
import { MapPin, Sparkles, Sword, Skull, ShoppingBag, Gift, Tent, AlertTriangle } from 'lucide-react';
import { useEffect, useRef } from 'react';

import statueUrl from '../assets/statue.png';
import treeUrl from '../assets/tree.png';
import heroUrl from '../assets/hero.png';

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

function getGridCoords(index: number) {
  if (index < 7) {
    return { x: index, y: 0 };
  } else if (index < 13) {
    return { x: 6, y: index - 6 };
  } else if (index < 19) {
    return { x: 6 - (index - 12), y: 6 };
  } else {
    return { x: 0, y: 6 - (index - 18) };
  }
}

export function getTilePosition(index: number = 0) {
  const safeIndex = (Number(index) || 0) % 24;
  const i = safeIndex < 0 ? safeIndex + 24 : safeIndex;
  
  const { x, y } = getGridCoords(i);
  const cx = x - 3;
  const cy = y - 3;
  
  const isoX = (cx - cy) * (TILE_WIDTH / 2);
  const isoY = (cx + cy) * (TILE_HEIGHT / 2);
  
  return { x: isoX, y: isoY, zIndex: x + y };
}

const TILE_THEMES: Record<TileType, { bg: string, color: string, icon: any }> = {
  start: { bg: '#ffffff', color: 'text-gray-400', icon: MapPin },
  enemy: { bg: '#e2e8f0', color: 'text-slate-500', icon: Sword },
  elite: { bg: '#fecaca', color: 'text-red-700', icon: Skull },
  event: { bg: '#c4b5fd', color: 'text-purple-700', icon: AlertTriangle },
  shop: { bg: '#fed7aa', color: 'text-orange-600', icon: ShoppingBag },
  rest: { bg: '#bfdbfe', color: 'text-blue-600', icon: Tent },
  minigame: { bg: '#fef08a', color: 'text-yellow-700', icon: Gift }
};

const TileSVG = ({ bg, thickness = 10 }: { bg: string, thickness?: number }) => (
  <svg viewBox="0 0 64 42" className="w-[64px] absolute top-0 left-0" style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.15))' }}>
    {/* Left Face */}
    <path d={`M 0 16 L 32 32 L 32 ${32 + thickness} L 0 ${16 + thickness} Z`} fill={bg} filter="brightness(0.7)" />
    {/* Right Face */}
    <path d={`M 32 32 L 64 16 L 64 ${16 + thickness} L 32 ${32 + thickness} Z`} fill={bg} filter="brightness(0.5)" />
    {/* Top Face */}
    <path d="M 32 0 L 64 16 L 32 32 L 0 16 Z" fill={bg} />
  </svg>
);

export function GameBoard({ run, visualPosition }: { run: RunState, visualPosition: number }) {
  const heroPos = getTilePosition(visualPosition);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div 
        className="relative w-0 h-0 transition-transform duration-500 ease-in-out"
        style={{ transform: `translate(${-heroPos.x}px, ${-heroPos.y + 40}px)` }}
      >
        
        {/* Scenery - Trees and Statue */}
        <div className="absolute w-[200px] h-[200px] -ml-[100px] -mt-[140px] z-[0]">
           <img src={statueUrl} className="w-full h-full object-contain" alt="Statue" />
        </div>
        
        <div className="absolute w-[100px] h-[120px] -ml-[180px] -mt-[20px] z-[1]">
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        <div className="absolute w-[80px] h-[100px] ml-[100px] -mt-[80px] z-[0]">
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        <div className="absolute w-[120px] h-[140px] -ml-[50px] mt-[40px] z-[10]">
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        
        {/* Grid Tiles */}
        {run.tiles.map((t, i) => {
          const p = getTilePosition(i);
          const theme = TILE_THEMES[t.type];
          const Icon = theme.icon;
          
          return (
            <div 
              key={t.id}
              className="absolute w-[64px] h-[32px] -ml-[32px] -mt-[16px] transition-transform duration-300"
              style={{ 
                transform: `translate(${p.x}px, ${p.y}px)`, 
                zIndex: p.zIndex 
              }}
            >
              <TileSVG bg={theme.bg} />
              {t.type !== 'start' && (
                <div className="absolute inset-0 flex items-center justify-center -mt-[8px]">
                  <Icon className={`w-4 h-4 ${theme.color}`} strokeWidth={3} />
                </div>
              )}
            </div>
          );
        })}

        {/* Hero */}
        <div 
          className="absolute w-[64px] h-[64px] -ml-[32px] -mt-[48px] transition-all duration-500 ease-in-out"
          style={{ 
            transform: `translate(${heroPos.x}px, ${heroPos.y}px)`, 
            zIndex: heroPos.zIndex + 1 
          }}
        >
          <img src={heroUrl} className="w-full h-full object-contain drop-shadow-xl animate-bounce-slow" alt="Hero" />
        </div>

      </div>
    </div>
  );
}