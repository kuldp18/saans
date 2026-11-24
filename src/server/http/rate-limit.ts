export function createRequestGate(cap: number, now: () => number = Date.now) {
  let bucket = -1;
  let count = 0;
  return () => {
    const time = now();
    const current = Math.floor(time / 60_000);
    if (bucket !== current) {
      bucket = current;
      count = 0;
    }
    if (count >= cap) return Math.max(1, Math.ceil(((bucket + 1) * 60_000 - time) / 1000));
    count++;
    return 0;
  };
}
