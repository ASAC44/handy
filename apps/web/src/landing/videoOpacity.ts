export function opacityAt(start: number, target: number, elapsed: number, duration: number): number {
  const progress = Math.min(Math.max(elapsed / duration, 0), 1);
  return start + (target - start) * progress;
}
