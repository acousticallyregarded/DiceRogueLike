// Follow the outside of the board's western wall, then meander into the forest.
export function riverX(y: number) {
  const wallDistance = Math.max(0, -y, y - 120);
  const boardWidth = Math.max(0, 294 - wallDistance * 2);
  return -135 - boardWidth - Math.sin(y / 85) * 24;
}

const riverPath = Array.from({ length: 351 }, (_, i) => {
  const y = -1400 + i * 8;
  return `${i ? 'L' : 'M'} ${riverX(y)} ${y}`;
}).join(' ');

export function ForestRiver() {
  return (
    <svg aria-hidden="true" className="absolute pointer-events-none max-w-none"
      width="1400" height="2800" viewBox="-700 -1400 1400 2800"
      style={{ left: -700, top: -1400, zIndex: -1 }}>
      <defs>
        <linearGradient id="forest-river-water" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#388b92" />
          <stop offset=".3" stopColor="#56b6c4" />
          <stop offset=".6" stopColor="#348ea9" />
          <stop offset="1" stopColor="#76c9cf" />
        </linearGradient>
      </defs>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={riverPath} stroke="#547747" strokeWidth="84" />
        <path d={riverPath} stroke="#9e9a65" strokeWidth="74" />
        <path d={riverPath} stroke="#c2b789" strokeWidth="65" />
        <path d={riverPath} stroke="#347f87" strokeWidth="57" />
        <path d={riverPath} stroke="url(#forest-river-water)" strokeWidth="51" />
        <path d={riverPath} stroke="#a8e3df" strokeWidth="2"
          strokeDasharray="18 94 8 61" opacity=".5" />
      </g>
      {Array.from({ length: 45 }, (_, i) => {
        const y = -1300 + i * 59;
        const x = riverX(y);
        return <path key={i} d={`M ${x - 15} ${y} q 8 4 16 0`}
          fill="none" stroke="#d1f1e6" opacity=".3" strokeWidth="1.5" />;
      })}
    </svg>
  );
}