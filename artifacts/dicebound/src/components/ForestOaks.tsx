import treeUrl from '../assets/tree.png';

// Stable placements: never reshuffle the forest when the hero takes a step.
const OAKS = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: 7 }, (_, column) => {
    const seed = row * 17 + column * 31;
    const x = (column - 3) * 128 + (row % 2 ? 40 : -20) + (seed % 29);
    const y = (row - 4) * 120 + (seed % 37);
    const height = 108 + seed % 49;
    return { x, y, height, width: height * 0.84, flip: seed % 3 === 0 };
  }),
).flat().filter(tree => {
  // Leave the whole raised board and courtyard open, including its walls.
  return Math.abs(tree.x) + Math.abs((tree.y - 55) * 2) > 430;
}).sort((a, b) => a.y - b.y);

export function ForestOaks() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
      {OAKS.map((tree, index) => (
        <img key={index} src={treeUrl} alt="" draggable={false}
          className="absolute max-w-none object-contain drop-shadow-xl"
          style={{
            width: tree.width, height: tree.height,
            left: tree.x - tree.width / 2, top: tree.y - tree.height,
            transform: tree.flip ? 'scaleX(-1)' : undefined,
          }} />
      ))}
    </div>
  );
}