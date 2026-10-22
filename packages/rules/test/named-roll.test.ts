import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG, closeBets, createGame, currentRoller, judge, makeRoll,
  mulberry32, rollDie, rollFor, shonbenHand, type Rng,
} from '../src';

const names = ['ひろきちくん', 'ひろきち', '新滝'];

describe('名前による確率補正', () => {
  it.each([false, true])('全抽選口の内訳が指定倍率になり、他の役は変わらない：新滝=%s', (shintaki) => {
    // 通常の7,776通りを6倍して、1/2・1/3・1.5倍を整数で検証する。
    const counts: Record<string, number> = {};
    for (let ticket = 0; ticket < 46_656; ticket++) {
      let call = 0;
      const roll = makeRoll({ ...DEFAULT_CONFIG, shintaki },
        () => call++ === 0 ? (ticket + 0.5) / 46_656 : 0.5, names[0]);
      counts[roll.hand.key] = (counts[roll.hand.key] ?? 0) + 1;
    }
    expect(counts).toEqual({
      gopin: 6, gozoro: 30, yonpin: 150, yonzoro: 1_125, pinzoro: 1_500,
      arashi: 11_250, hifumi: shintaki ? 3_150 : 3_510,
      shigoro: shintaki ? 6_300 : 7_020, me: shintaki ? 22_185 : 22_065,
      ...(shintaki ? { gyakuShintaki: 240, junShintaki: 720 } : {}),
    });
  });

  it.each(names)('%s は全設定で同じ補正を受け、表示の出目と役も一致する', (name) => {
    for (const shintaki of [false, true]) {
      for (const shonben of [false, true]) {
        const config = { ...DEFAULT_CONFIG, shintaki, shonben };
        const rng = mulberry32(37);
        const reference = mulberry32(37);
        for (let n = 0; n < 500; n++) {
          const roll = makeRoll(config, rng, name);
          expect(roll).toEqual(makeRoll(config, reference, names[0]));
          expect(roll.hand).toEqual(roll.shonben ? shonbenHand() : judge(roll.dice, { shintaki }));
        }
      }
    }
  });

  it.each([undefined, 'あおい', 'ひろき', 'ひろきちくん2', '新瀧', '新滝さん', ' ひろきち'])('%s は従来の5個のサイコロ抽選のまま', (name) => {
    for (const shintaki of [false, true]) {
      for (const shonben of [false, true]) {
        const config = { ...DEFAULT_CONFIG, shintaki, shonben };
        const rng = mulberry32(42);
        const oldRng = mulberry32(42);
        for (let n = 0; n < 100; n++) {
          const outside = shonben && oldRng() < 0.01;
          const dice = Array.from({ length: 5 }, () => rollDie(oldRng));
          expect(makeRoll(config, rng, name)).toEqual({
            dice, shonben: outside,
            hand: outside ? shonbenHand() : judge(dice, { shintaki }),
          });
        }
        expect(rng()).toBe(oldRng());
      }
    }
  });

  it.each(names)('%s のションベンも1%%のまま', (name) => {
    let outside = 0;
    for (let n = 0; n < 1_000; n++) {
      let call = 0;
      const roll = makeRoll({ ...DEFAULT_CONFIG, shonben: true },
        () => call++ === 0 ? (n + 0.5) / 1_000 : 0.5, name);
      if (roll.shonben) outside++;
    }
    expect(outside).toBe(10);
  });

  it('通常の目の4:5:6の比率と出目の並びを保つ', () => {
    // 抽選口の中央は「目」の範囲。各出目を1回ずつ選ぶ。
    const counts: Record<string, number> = {};
    const diceSet = new Set<string>();
    for (let i = 0; i < 3_780; i++) {
      let call = 0;
      const roll = makeRoll(DEFAULT_CONFIG,
        () => call++ === 0 ? 0.5 : (i + 0.5) / 3_780, names[0]);
      counts[roll.hand.label] = (counts[roll.hand.label] ?? 0) + 1;
      diceSet.add(roll.dice.join(''));
    }
    expect(counts).toEqual({ '4の目': 630, '5の目': 1_260, '6の目': 1_890 });
    expect(diceSet.size).toBe(3_780);
  });

  it('取得した出目を変更しても、次の抽選に影響しない', () => {
    const first = makeRoll(DEFAULT_CONFIG, () => 0.1, names[0]);
    const expected = [...first.dice];
    first.dice.fill(99);
    expect(makeRoll(DEFAULT_CONFIG, () => 0.1, names[0]).dice).toEqual(expected);
  });
});

describe('共通の対局処理への適用', () => {
  const rng = (): Rng => {
    let i = 0;
    return () => [0.1, 0.2, 0.3, 0.4, 0.5][i++]!;
  };

  it.each(names)('%s 本人の名前を使い、親・子どちらでも補正する', (name) => {
    for (const firstOya of [0, 1]) {
      let game = closeBets(createGame([
        { id: 'A', name }, { id: 'B', name: '別の人' },
      ], DEFAULT_CONFIG, firstOya));
      for (let turn = 0; turn < 2; turn++) {
        const id = currentRoller(game)!;
        game = rollFor(game, id, rng());
      }
      expect(game.rolls.A!.hand.key).toBe('arashi');
      expect(game.rolls.B!.hand.key).toBe('hifumi');
      expect(game.phase).toBe('settled');
      expect(Object.values(game.deltas!).reduce((sum, value) => sum + value, 0)).toBe(0);
    }
  });
});
