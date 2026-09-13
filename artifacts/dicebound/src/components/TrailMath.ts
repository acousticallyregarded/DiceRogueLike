export type TrailDirection = 'NE' | 'NW' | 'SE' | 'SW';

// 63 steps from 0 to 63
export const PATH_DIRS: TrailDirection[] = [
  'NE', 'NE', 'NE', 'NW', 'NW', 'NE', 'NE', 'NW',
  'NW', 'NW', 'NE', 'NE', 'NE', 'NE', 'SE', 'NE',
  'NE', 'NW', 'NW', 'NW', 'NW', 'NE', 'NE', 'NE',
  'NW', 'NW', 'NW', 'NE', 'NE', 'NE', 'NE', 'NE',
  'NW', 'NW', 'NW', 'NW', 'NE', 'NE', 'NE', 'SE',
  'SE', 'NE', 'NE', 'NE', 'NE', 'NW', 'NW', 'NW',
  'NW', 'NW', 'NW', 'NE', 'NE', 'NE', 'NE', 'NE',
  'NE', 'NE', 'NW', 'NW', 'NW', 'NW', 'NW'
];

export function getGridCoords(index: number) {
  let cx = 0, cy = 0;
  for (let i = 0; i < index; i++) {
    const d = PATH_DIRS[i] ?? 'NE';
    if (d === 'NE') cy--;
    else if (d === 'NW') cx--;
    else if (d === 'SE') cx++;
    else if (d === 'SW') cy++;
  }
  return { x: cx, y: cy };
}

export const TILE_WIDTH = 84;
export const TILE_HEIGHT = 42;

export function normalizeTileIndex(index: number, length: number = 64) {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  return Math.min(safeIndex, length - 1);
}

export function getTilePosition(index: number = 0, length: number = 64) {
  const i = normalizeTileIndex(index, length);
  const { x, y } = getGridCoords(i);
  
  const isoX = (x - y) * (TILE_WIDTH / 2);
  const isoY = (x + y) * (TILE_HEIGHT / 2);
  
  return { x: isoX, y: isoY, zIndex: 100 + x + y, gridX: x, gridY: y };
}

export function getTrailWalkDirection(fromIndex: number, toIndex: number): 'south-east' | 'south-west' | 'north-west' | 'north-east' | null {
  if (toIndex === fromIndex) return null;
  // Determine actual coordinate change
  const cFrom = getGridCoords(fromIndex);
  const cTo = getGridCoords(toIndex);
  
  const dx = cTo.x - cFrom.x;
  const dy = cTo.y - cFrom.y;
  
  if (dx > 0 && dy === 0) return 'south-east';
  if (dx < 0 && dy === 0) return 'north-west';
  if (dy > 0 && dx === 0) return 'south-west';
  if (dy < 0 && dx === 0) return 'north-east';
  
  // If jumping multiple tiles, approximate based on first step
  const d = PATH_DIRS[Math.min(fromIndex, PATH_DIRS.length - 1)] ?? 'NE';
  if (d === 'NE') return 'north-east';
  if (d === 'NW') return 'north-west';
  if (d === 'SE') return 'south-east';
  if (d === 'SW') return 'south-west';
  
  return null;
}
