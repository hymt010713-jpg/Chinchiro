import type { Hand } from './hands';

/**
 * 子1人と親の勝負。子から見た増減を「口」で返す（親の増減はその符号反転）。
 * 強さが上の方が勝ち、同じなら親の勝ち。
 * 支払い＝口数 × 勝った側の勝ち倍率 × 負けた側の払い倍率。
 */
export function settle(ko: Hand, oya: Hand, bet: number): number {
  if (ko.rank > oya.rank) return bet * ko.win * oya.lose;
  return -bet * oya.win * ko.lose;
}
