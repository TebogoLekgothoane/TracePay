import { useEffect, useRef, useState } from "react";

/** Eases a displayed number from its previous value to the new one. */
export function useCountUp(target: number, duration = 700): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const begin = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min((Date.now() - begin) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = start + (target - start) * eased;
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}
