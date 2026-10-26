import type { CSSProperties } from 'react';

/** 精算で増えた点数と一緒に、小判を短く弾ませる。 */
export function CoinBurst() {
  return <span className="coin-burst" aria-hidden="true">
    {Array.from({ length: 7 }, (_, i) => <i key={i} style={{
      '--coin-x': `${(i - 3) * 19}px`,
      '--coin-y': `${-35 - (3 - Math.abs(i - 3)) * 10}px`,
      '--coin-r': `${(i - 3) * 45}deg`,
      '--coin-delay': `${i * 35}ms`,
    } as CSSProperties} />)}
  </span>;
}
