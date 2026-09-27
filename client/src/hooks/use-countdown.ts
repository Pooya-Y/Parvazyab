import { useCallback, useEffect, useState } from "react";

/** Seconds left on a cooldown ("resend in 42 s"); `start(n)` begins a new one. */
export function useCountdown(): [remaining: number, start: (seconds: number) => void] {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) setUntil(null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [until]);

  const start = useCallback((seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  }, []);

  return [until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000)), start];
}
