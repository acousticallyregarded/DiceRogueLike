export function MonsterSprite({ name, className = "" }: { name?: string, className?: string }) {
  const isBoss = name?.includes("Overlord");
  const isGoblin = name?.includes("Goblin");
  const isWolf = name?.includes("Wolf");

  if (isBoss) {
    return (
      <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="90" rx="40" ry="15" fill="rgba(0,0,0,0.4)" />
        <path d="M 20 90 L 30 30 L 50 10 L 70 30 L 80 90 Z" fill="#2d3748" />
        <circle cx="50" cy="40" r="15" fill="#e53e3e" />
        <path d="M 40 35 L 45 40 L 40 45" stroke="#fff" strokeWidth="2" />
        <path d="M 60 35 L 55 40 L 60 45" stroke="#fff" strokeWidth="2" />
        {/* Crown */}
        <path d="M 35 15 L 40 0 L 50 10 L 60 0 L 65 15 Z" fill="#ecc94b" />
      </svg>
    );
  }

  if (isGoblin) {
    return (
      <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="90" rx="25" ry="8" fill="rgba(0,0,0,0.3)" />
        <rect x="35" y="50" width="30" height="35" rx="5" fill="#48bb78" />
        <circle cx="50" cy="40" r="15" fill="#48bb78" />
        {/* Ears */}
        <path d="M 35 40 L 15 30 L 35 30 Z" fill="#38a169" />
        <path d="M 65 40 L 85 30 L 65 30 Z" fill="#38a169" />
        {/* Club */}
        <rect x="15" y="40" width="8" height="40" rx="2" fill="#744210" transform="rotate(-15 15 40)" />
      </svg>
    );
  }

  if (isWolf) {
    return (
      <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="50" cy="90" rx="35" ry="10" fill="rgba(0,0,0,0.3)" />
        <path d="M 20 70 Q 50 40 80 70 Q 50 90 20 70 Z" fill="#718096" />
        <circle cx="25" cy="50" r="12" fill="#4a5568" />
        {/* Ears */}
        <path d="M 15 45 L 20 25 L 30 45 Z" fill="#2d3748" />
        {/* Snout */}
        <path d="M 25 55 L 5 60 L 25 65 Z" fill="#4a5568" />
        <circle cx="5" cy="60" r="3" fill="#000" />
      </svg>
    );
  }

  // Slime (default)
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="85" rx="35" ry="12" fill="rgba(0,0,0,0.3)" />
      <path d="M 15 85 Q 15 40 50 40 Q 85 40 85 85 Z" fill="#4299e1" />
      <circle cx="35" cy="65" r="5" fill="#fff" />
      <circle cx="65" cy="65" r="5" fill="#fff" />
      <circle cx="35" cy="65" r="2" fill="#000" />
      <circle cx="65" cy="65" r="2" fill="#000" />
    </svg>
  );
}
