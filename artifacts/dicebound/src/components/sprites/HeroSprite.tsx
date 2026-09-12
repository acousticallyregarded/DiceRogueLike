export function HeroSprite({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Shadow */}
      <ellipse cx="50" cy="90" rx="30" ry="10" fill="rgba(0,0,0,0.3)" />
      {/* Cape */}
      <path d="M 30 40 Q 20 70 25 90 Q 40 95 60 80 Z" fill="#8b0000" />
      {/* Body */}
      <rect x="40" y="45" width="20" height="35" rx="5" fill="#2d3748" />
      {/* Head */}
      <circle cx="50" cy="30" r="15" fill="#fcd5ce" />
      {/* Helmet/Hair */}
      <path d="M 32 30 A 18 18 0 0 1 68 30 L 68 20 A 18 18 0 0 0 32 20 Z" fill="#a0aec0" />
      <path d="M 45 15 L 50 5 L 55 15 Z" fill="#cbd5e0" />
      {/* Sword */}
      <rect x="70" y="30" width="4" height="40" fill="#a0aec0" transform="rotate(20 70 30)" />
      <rect x="65" y="60" width="14" height="4" fill="#718096" transform="rotate(20 70 30)" />
      <rect x="70" y="64" width="4" height="10" fill="#4a5568" transform="rotate(20 70 30)" />
    </svg>
  );
}
