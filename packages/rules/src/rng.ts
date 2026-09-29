/** 0以上1未満を返す乱数。サーバーでは crypto 由来のものを渡す */
export type Rng = () => number;

/** テストとリプレイ用の再現できる乱数 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng() * 6);
}
