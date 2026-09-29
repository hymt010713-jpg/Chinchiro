import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  closeBets,
  createGame,
  currentRoller,
  drawFirstOya,
  judge,
  makeRoll,
  mulberry32,
  nextRound,
  oyaId,
  placeBet,
  rollFor,
  settle,
  shonbenHand,
  type GameState,
  type Roll,
} from '../src';

const j = (s: string, shintaki = false) => judge([...s].map(Number), { shintaki });
const fixed = (s: string, shintaki = false): Roll => ({
  dice: [...s].map(Number),
  shonben: false,
  hand: j(s, shintaki),
});
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'ABCDEF'[i]!, name: `P${i}` }));
const noRng = () => {
  throw new Error('fixed roll expected');
};

describe('settle（子から見た口数）', () => {
  it('役の強さが上なら子の勝ち：親の嵐 vs 子のピンゾロ', () => {
    expect(settle(j('11123'), j('22245'), 2)).toBe(10);
  });
  it('同じ強さは親の勝ち：嵐どうし、5倍どうし、同じ目', () => {
    expect(settle(j('66612'), j('22245'), 1)).toBe(-3);
    expect(settle(j('11145'), j('33334'), 1)).toBe(-5);
    expect(settle(j('15663'), j('22554'), 1)).toBe(-1);
  });
  it('目は数字で比べる', () => {
    expect(settle(j('44336'), j('15663'), 1)).toBe(1);
  });
  it('掛け算：子ヒフミ vs 親嵐 は 3×2', () => {
    expect(settle(j('12336'), j('66612'), 3)).toBe(-18);
  });
  it('最大：子の逆新滝 vs 親の五ピン は 15×5', () => {
    expect(settle(j('12345', true), j('11111', true), 5)).toBe(-375);
  });
  it('ションベンは最下位で1倍払い。両方ションベンなら親の勝ち', () => {
    expect(settle(shonbenHand(), j('12336'), 2)).toBe(-2);
    expect(settle(j('12345', true), shonbenHand(), 1)).toBe(1);
    expect(settle(shonbenHand(), shonbenHand(), 1)).toBe(-1);
  });
});

describe('進行', () => {
  it('子が親の左隣から時計回りに振り、親が最後', () => {
    let g = createGame(players(4), DEFAULT_CONFIG, 2);
    expect(oyaId(g)).toBe('C');
    expect(g.order).toEqual(['D', 'A', 'B']);
    g = closeBets(g);
    const seen: string[] = [];
    while (g.phase !== 'settled') {
      const who = currentRoller(g)!;
      seen.push(who);
      g = rollFor(g, who, mulberry32(seen.length));
    }
    expect(seen).toEqual(['D', 'A', 'B', 'C']);
  });

  it('自分の番以外は振れない、賭けは子だけ1〜5口', () => {
    let g = createGame(players(3), DEFAULT_CONFIG, 0);
    expect(() => placeBet(g, 'A', 2)).toThrow('親は賭けない');
    expect(() => placeBet(g, 'B', 6)).toThrow();
    expect(() => placeBet(g, 'B', 0)).toThrow();
    g = closeBets(placeBet(g, 'B', 5));
    expect(() => rollFor(g, 'C', noRng)).toThrow('あなたの番ではない');
    expect(() => rollFor(g, 'A', noRng)).toThrow('あなたの番ではない');
  });

  it('設計書の精算例（4人、親A）：合計0', () => {
    let g = createGame(players(4), DEFAULT_CONFIG, 0);
    g = placeBet(g, 'B', 2);
    g = placeBet(g, 'C', 1);
    g = placeBet(g, 'D', 3);
    g = closeBets(g);
    g = rollFor(g, 'B', noRng, fixed('11123'));
    g = rollFor(g, 'C', noRng, fixed('55512'));
    g = rollFor(g, 'D', noRng, fixed('12336'));
    g = rollFor(g, 'A', noRng, fixed('66634'));
    expect(g.deltas).toEqual({ A: 1100, B: 1000, C: -300, D: -1800 });
    expect(g.scores).toEqual({ A: 1100, B: 1000, C: -300, D: -1800 });
  });

  it('全員が同じ回数だけ親をやって終局。持ち点の合計は常に0', () => {
    for (const n of [2, 3, 6]) {
      for (const laps of [1, 2, 3]) {
        const rng = mulberry32(n * 10 + laps);
        let g: GameState = createGame(players(n), { ...DEFAULT_CONFIG, laps, shintaki: true, shonben: true }, n - 1);
        const oyaCount: Record<string, number> = {};
        while (g.phase !== 'gameOver') {
          oyaCount[oyaId(g)] = (oyaCount[oyaId(g)] ?? 0) + 1;
          for (const id of g.order) g = placeBet(g, id, 1 + Math.floor(rng() * 5));
          g = closeBets(g);
          while (g.phase !== 'settled') g = rollFor(g, currentRoller(g)!, rng);
          expect(Object.values(g.deltas!).reduce((a, b) => a + b, 0)).toBe(0);
          expect(Object.values(g.scores).reduce((a, b) => a + b, 0)).toBe(0);
          g = nextRound(g);
        }
        expect(g.history).toHaveLength(n * laps);
        expect(Object.values(oyaCount)).toEqual(Array(n).fill(laps));
      }
    }
  });

  it('引き分けはない：子の増減が0になる局は起きない', () => {
    const rng = mulberry32(7);
    let g = createGame(players(6), { ...DEFAULT_CONFIG, laps: 3 }, 0);
    while (g.phase !== 'gameOver') {
      g = closeBets(g);
      while (g.phase !== 'settled') g = rollFor(g, currentRoller(g)!, rng);
      for (const id of g.order) expect(g.deltas![id]).not.toBe(0);
      g = nextRound(g);
    }
  });
});

describe('乱数まわり', () => {
  it('ションベンは設定ONのときだけ、約1%', () => {
    const rng = mulberry32(42);
    let on = 0;
    let off = 0;
    const N = 200_000;
    for (let i = 0; i < N; i++) {
      if (makeRoll({ ...DEFAULT_CONFIG, shonben: true }, rng).shonben) on++;
      if (makeRoll(DEFAULT_CONFIG, rng).shonben) off++;
    }
    expect(off).toBe(0);
    expect(on / N).toBeGreaterThan(0.009);
    expect(on / N).toBeLessThan(0.011);
  });

  it('親決めは同点者だけで振り直して1人に決まる', () => {
    for (let seed = 0; seed < 200; seed++) {
      const d = drawFirstOya(6, mulberry32(seed));
      const last = d.rounds[d.rounds.length - 1]!;
      const top = Math.max(...last.map(([, v]) => v));
      expect(last.filter(([, v]) => v === top).map(([i]) => i)).toEqual([d.index]);
    }
  });
});
