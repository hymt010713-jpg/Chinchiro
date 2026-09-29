import type { GameState, Hand, Rng } from '@chinchiro/rules';

/** 端末の暗号学的乱数から作る Rng */
export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 4294967296;
};

export const SEAT_COLORS = ['#E8C064', '#8FB3C9', '#9CC79F', '#D9A07A', '#C9A0C0', '#E58F7E'];

export const DEFAULT_NAMES = ['あおい', 'けん', 'みさき', 'りょう', 'はる', 'そら'];

export function signed(n: number): string {
  if (n === 0) return '0';
  return (n > 0 ? '+' : '−') + Math.abs(n).toLocaleString('ja-JP');
}

export function payNote(h: Hand): string {
  if (h.lose > 1) return `負けたら${h.lose}倍払い`;
  if (h.win > 1) return `勝てば${h.win}倍`;
  return '1倍';
}

export function isBad(h: Hand): boolean {
  return h.rank < 1;
}

export function vibrate(ms: number | number[]) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 振動できない端末は無視
  }
}

const KEY = 'chinchiro-go:v1';

export interface Saved {
  game: GameState;
}

export function saveGame(game: GameState | null) {
  try {
    if (game) localStorage.setItem(KEY, JSON.stringify({ game } satisfies Saved));
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できなくても遊べる
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { game } = JSON.parse(raw) as Saved;
    return game?.phase && game.phase !== 'gameOver' ? game : null;
  } catch {
    return null;
  }
}
