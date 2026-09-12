import { GameState, Tile } from '../game';
import { Sword, Coins, Tent, HelpCircle, Skull } from 'lucide-react';
import { cn } from '../lib/utils';

function getTilePosition(index: number) {
  if (index <= 7) return { x: index, y: 0 };
  if (index <= 12) return { x: 7, y: index - 7 };
  if (index <= 19) return { x: 7 - (index - 12), y: 5 };
  return { x: 0, y: 5 - (index - 19) };
}

const TILE_POSITIONS = Array.from({ length: 24 }).map((_, i) => getTilePosition(i));

export function GameBoard({ state, visualPosition }: { state: GameState, visualPosition: number }) {
  return (
    <div className="relative w-full max-w-3xl aspect-[8/6] bg-black/60 rounded-2xl border-[6px] border-card-border shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden p-2 backdrop-blur-md flex items-center justify-center">
      
      {/* Dynamic Background Scenery in the center */}
      <div className="absolute inset-[14%] bg-card/40 rounded-xl overflow-hidden pointer-events-none border border-border/30">
         <svg className="absolute inset-0 w-full h-full opacity-60 mix-blend-screen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="skyGrad" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                <stop offset="0%" stopColor="#4c1d95" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0.9" />
              </radialGradient>
              <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fde047" />
                <stop offset="100%" stopColor="#b45309" />
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#skyGrad)" />
            
            {/* Stars */}
            <circle cx="200" cy="150" r="1.5" fill="#fff" opacity="0.8" />
            <circle cx="650" cy="120" r="2" fill="#fff" opacity="0.6" />
            <circle cx="500" cy="200" r="1" fill="#fff" opacity="0.9" />
            <circle cx="300" cy="100" r="1.5" fill="#fff" opacity="0.5" />
            <circle cx="150" cy="250" r="2.5" fill="#fff" opacity="0.7" />
            <circle cx="700" cy="300" r="1" fill="#fff" opacity="0.4" />
            
            {/* Moon */}
            <circle cx="600" cy="150" r="45" fill="url(#moonGrad)" filter="drop-shadow(0px 0px 15px rgba(253,224,71,0.5))" />
            
            {/* Background Mountains */}
            <path d="M-50,600 L150,300 L350,550 L550,250 L850,600 Z" fill="#0f172a" opacity="0.8" />
            <path d="M200,600 L450,350 L750,600 Z" fill="#020617" opacity="0.9" />
            
            {/* Castle / Ruin Silhouette */}
            <path d="M420,400 L420,320 L440,320 L440,290 L460,320 L480,320 L480,400 Z" fill="#09090b" />
            <rect x="430" y="350" width="10" height="20" fill="#fde047" opacity="0.6" />
            <rect x="460" y="350" width="10" height="20" fill="#fde047" opacity="0.6" />
            
            {/* Foreground Trees */}
            <path d="M50,600 L100,450 L150,600 Z" fill="#020617" />
            <path d="M20,600 L60,500 L100,600 Z" fill="#09090b" />
            <path d="M120,600 L170,480 L220,600 Z" fill="#09090b" />
            
            <path d="M650,600 L700,420 L750,600 Z" fill="#020617" />
            <path d="M720,600 L760,480 L800,600 Z" fill="#09090b" />
            
            {/* Mist at the bottom */}
            <rect x="0" y="500" width="800" height="100" fill="url(#skyGrad)" opacity="0.5" filter="blur(10px)" />
         </svg>
      </div>

      <div className="absolute inset-2">
        {state.tiles.map((tile, i) => {
          const pos = TILE_POSITIONS[i];
          return (
            <div 
              key={tile.id}
              className="absolute flex items-center justify-center p-1.5 transition-all"
              style={{
                left: `${(pos.x / 8) * 100}%`,
                top: `${(pos.y / 6) * 100}%`,
                width: `${100 / 8}%`,
                height: `${100 / 6}%`,
              }}
            >
              <TileView tile={tile} index={i} isCurrent={visualPosition === i} />
            </div>
          );
        })}
        
        <PlayerToken visualPosition={visualPosition} />
      </div>
    </div>
  );
}

function TileView({ tile, index, isCurrent }: { tile: Tile, index: number, isCurrent: boolean }) {
  const isBoss = index === 23;
  let Icon = HelpCircle;
  let color = "text-muted-foreground";
  let bg = "bg-card/80";
  let border = "border-border";

  switch (tile.type) {
    case 'battle':
      Icon = Sword;
      color = "text-orange-500";
      bg = "bg-orange-950/60";
      border = "border-orange-900/50";
      break;
    case 'treasure':
      Icon = Coins;
      color = "text-yellow-400";
      bg = "bg-yellow-950/60";
      border = "border-yellow-900/50";
      break;
    case 'camp':
      Icon = Tent;
      color = "text-emerald-500";
      bg = "bg-emerald-950/60";
      border = "border-emerald-900/50";
      break;
    case 'boss':
      Icon = Skull;
      color = "text-purple-400";
      bg = "bg-purple-950/80";
      border = "border-purple-800";
      break;
    case 'event':
      Icon = HelpCircle;
      color = "text-blue-400";
      bg = "bg-blue-950/60";
      border = "border-blue-900/50";
      break;
  }

  return (
    <div className={cn(
      "w-full h-full rounded-lg border-2 flex items-center justify-center shadow-inner relative transition-colors backdrop-blur-sm",
      bg, border,
      isCurrent && "ring-2 ring-primary ring-offset-2 ring-offset-black/50"
    )}>
       <Icon className={cn("w-3/5 h-3/5 opacity-80", color)} strokeWidth={1.5} />
       
       {index === 0 && (
         <div className="absolute -top-1 -left-1 text-[9px] font-bold bg-background text-foreground px-1.5 py-0.5 rounded border border-border uppercase tracking-widest z-0">
           Start
         </div>
       )}
       {isBoss && (
         <div className="absolute -bottom-2 text-[10px] bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-800 font-bold uppercase tracking-widest z-0 whitespace-nowrap">
           Boss
         </div>
       )}
    </div>
  );
}

function PlayerToken({ visualPosition }: { visualPosition: number }) {
  const pos = TILE_POSITIONS[visualPosition] || { x: 0, y: 0 };
  
  return (
    <div 
      className="absolute flex items-center justify-center pointer-events-none transition-all duration-200 ease-linear z-10"
      style={{
        left: `${(pos.x / 8) * 100}%`,
        top: `${(pos.y / 6) * 100}%`,
        width: `${100 / 8}%`,
        height: `${100 / 6}%`,
      }}
    >
      <div className="w-[85%] h-[85%] bg-gradient-to-br from-primary to-amber-600 rounded-full shadow-[0_0_20px_rgba(255,215,0,0.6)] border-[3px] border-white flex items-center justify-center animate-in zoom-in duration-300">
        <svg viewBox="0 0 24 24" className="w-3/4 h-3/4 text-white fill-white/20 drop-shadow-md">
          <path fill="currentColor" d="M12 2C10.89 2 10 2.89 10 4V6H7C5.89 6 5 6.89 5 8V18C5 19.11 5.89 20 7 20H17C18.11 20 19 19.11 19 18V8C19 6.89 18.11 6 17 6H14V4C14 2.89 13.11 2 12 2ZM12 4C12.55 4 13 4.45 13 5V6H11V5C11 4.45 11.45 4 12 4ZM7 8H17V18H7V8ZM12 9C10.9 9 10 9.9 10 11C10 12.1 10.9 13 12 13C13.1 13 14 12.1 14 11C14 9.9 13.1 9 12 9ZM12 11C11.45 11 11 10.55 11 10C11 9.45 11.45 9 12 9C12.55 9 13 9.45 13 10C13 10.55 12.55 11 12 11ZM9 14V16H15V14H9Z"/>
        </svg>
      </div>
    </div>
  );
}