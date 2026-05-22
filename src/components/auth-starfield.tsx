import { useMemo } from "react";

interface Star {
  top: number;
  left: number;
  size: number;
  dur: number;
  delay: number;
  minOp: number;
  maxOp: number;
}

function rand(seed: number) {
  // deterministic pseudo-random so SSR and client match
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function AuthStarfield() {
  const stars = useMemo<Star[]>(() => {
    const arr: Star[] = [];
    const total = 70;
    for (let i = 0; i < total; i++) {
      const isBig = i % 12 === 0;
      arr.push({
        top: rand(i * 1.7) * 100,
        left: rand(i * 2.3 + 11) * 100,
        size: isBig ? 3 : rand(i * 3.1 + 5) > 0.5 ? 2 : 1,
        dur: 2 + rand(i * 4.7 + 9) * 4,
        delay: rand(i * 5.9 + 3) * 4,
        minOp: isBig ? 0.4 : 0.15,
        maxOp: isBig ? 1 : 0.7,
      });
    }
    return arr;
  }, []);

  return (
    <div className="auth-starfield" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          className="auth-star"
          style={
            {
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              "--dur": `${s.dur}s`,
              "--delay": `${s.delay}s`,
              "--min-op": s.minOp,
              "--max-op": s.maxOp,
              boxShadow: s.size >= 3 ? "0 0 6px rgba(255,255,255,0.8)" : undefined,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}