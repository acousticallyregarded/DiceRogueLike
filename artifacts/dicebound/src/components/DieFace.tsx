import './die-face.css';

// Row-major positions on a traditional 3 × 3 pip grid.
const PIPS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function DieFace({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <div role="img" aria-label={`Die ${value}`} className={`die-face ${small ? 'die-face--small' : ''}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} aria-hidden="true" className={PIPS[value]?.includes(index) ? 'die-face__pip' : ''} />
      ))}
    </div>
  );
}