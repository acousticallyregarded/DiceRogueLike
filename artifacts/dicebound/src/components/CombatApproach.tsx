import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePrefersReducedMotion } from "./SpriteAnimator";

/** Moves only artwork; the measured home slot and health bars stay in place. */
export function CombatApproach({
  actorId, targetId, attackId, durationMs, enabled, paused, children,
}: {
  actorId: string;
  targetId: string;
  attackId: number;
  durationMs: number;
  enabled: boolean;
  paused: boolean;
  children: ReactNode;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const artwork = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useLayoutEffect(() => {
    const home = slot.current;
    const moving = artwork.current;
    if (!home || !moving || !enabled || !attackId || reducedMotion) return;
    const arena = home.closest("[data-combat-arena]");
    const target = Array.from(arena?.querySelectorAll<HTMLElement>("[data-combat-home]") ?? [])
      .find(element => element.dataset.combatHome === targetId);
    if (!target) return;
    const from = home.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const distance = to.left + to.width / 2 - from.left - from.width / 2;
    const spacing = (from.width + to.width) * 0.32;
    const x = Math.sign(distance) * Math.max(0, Math.abs(distance) - spacing);
    const y = Math.max(-70, Math.min(70, to.bottom - from.bottom));
    const dash = Math.min(180, durationMs * 0.18);
    const retreat = Math.min(180, Math.max(80, durationMs * 0.12));
    const total = durationMs + retreat;
    // Rects are viewport pixels; a CSS-zoomed stage scales the translation,
    // so convert back into the artwork's own (zoomed) pixel space.
    const zoom = (moving as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
    const contact = `translate(${x / zoom}px, ${y / zoom}px)`;
    // Remain beside the committed target through authored impact, then return.
    // No gameplay callbacks: damage and attack completion remain engine-owned.
    const motion = moving.animate([
      { transform: "translate(0, 0)", offset: 0 },
      { transform: contact, offset: dash / total },
      { transform: contact, offset: durationMs / total },
      { transform: "translate(0, 0)", offset: 1 },
    ], { duration: total, easing: "ease-in-out" });
    animation.current = motion;
    home.style.zIndex = "20";
    motion.onfinish = () => { home.style.zIndex = ""; };
    if (pausedRef.current) motion.pause();
    return () => {
      motion.cancel();
      home.style.zIndex = "";
      animation.current = null;
    };
  }, [attackId, targetId, durationMs, enabled, reducedMotion]);

  useEffect(() => {
    const motion = animation.current;
    if (!motion || motion.playState === "finished") return;
    if (paused) motion.pause();
    else motion.play();
  }, [paused]);

  return (
    <div ref={slot} data-combat-home={actorId} className="relative">
      <div ref={artwork} data-combat-moving={actorId}>{children}</div>
    </div>
  );
}