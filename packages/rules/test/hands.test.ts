import { describe, expect, it } from 'vitest';
import { judge, type Hand } from '../src/hands';

const j = (s: string, shintaki = false) => judge([...s].map(Number), { shintaki });

function allRolls(): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < 7776; i++) {
    const d: number[] = [];
    let x = i;
    for (let k = 0; k < 5; k++) {
      d.push((x % 6) + 1);
      x = Math.floor(x / 6);
    }
    out.push(d);
  }
  return out;
}

describe('依頼文の例', () => {
  it.each([
    ['11123', 'ピンゾロ'],
    ['22213', '嵐'],
    ['33312', '嵐'],
    ['44456', '嵐'],
    ['12336', 'ヒフミ'],
    ['32116', 'ヒフミ'],
    ['15663', '5の目'],
    ['44336', '6の目'],
    ['11664', '6の目'],
    ['12456', 'シゴロ'],
    ['33334', '四ゾロ'],
    ['11112', '四ピン'],
    ['44444', '五ゾロ'],
    ['11111', '五ピン'],
    ['12345', 'ヒフミ'],
    ['23456', 'シゴロ'],
  ])('%s → %s', (dice, label) => {
    expect(j(dice).label).toBe(label);
  });

  it('新滝ON：23456 は順新滝、12345 は逆新滝', () => {
    expect(j('23456', true).label).toBe('順新滝');
    expect(j('65432', true).label).toBe('順新滝');
    expect(j('12345', true).label).toBe('逆新滝');
    expect(j('12345', true).lose).toBe(5);
  });

  it('新滝ONでも、1と6を両方含む5種はそのまま', () => {
    expect(j('12456', true).label).toBe('シゴロ');
    expect(j('12346', true).label).toBe('ヒフミ');
    expect(j('13456', true).label).toBe('シゴロ');
  });
});

describe('役を作った賽', () => {
  it('目は選んだ1個とペアを指す', () => {
    const h = j('15663');
    expect(h.used.map((i) => '15663'[i]).sort().join('')).toBe('566');
  });
  it('ヒフミは 1・2・3 を1個ずつ', () => {
    expect(j('12336').used.map((i) => '12336'[i]).sort().join('')).toBe('123');
  });
});

describe('全7,776通り', () => {
  const tally = (shintaki: boolean) => {
    const t: Record<string, number> = {};
    for (const d of allRolls()) {
      const l = judge(d, { shintaki }).label;
      t[l] = (t[l] ?? 0) + 1;
    }
    return t;
  };

  it('新滝OFFの内訳', () => {
    expect(tally(false)).toEqual({
      '6の目': 1890, '5の目': 1260, '嵐': 1250, 'ヒフミ': 1170, 'シゴロ': 1170, '4の目': 630,
      'ピンゾロ': 250, '四ゾロ': 125, '四ピン': 25, '五ゾロ': 5, '五ピン': 1,
    });
  });

  it('新滝ONの内訳', () => {
    const t = tally(true);
    expect(t['順新滝']).toBe(120);
    expect(t['逆新滝']).toBe(120);
    expect(t['ヒフミ']).toBe(1050);
    expect(t['シゴロ']).toBe(1050);
  });

  it('目は4〜6しか出ず、どの出目でも必ず判定できる', () => {
    for (const d of allRolls()) {
      const h: Hand = judge(d, { shintaki: false });
      if (h.key === 'me') expect(h.value).toBeGreaterThanOrEqual(4);
    }
  });

  it('並び順を変えても同じ役', () => {
    for (const d of allRolls()) {
      const a = judge(d, { shintaki: true });
      const b = judge([...d].reverse(), { shintaki: true });
      expect(b.label).toBe(a.label);
    }
  });
});

it('不正な出目は拒否する', () => {
  expect(() => judge([1, 2, 3], { shintaki: false })).toThrow(RangeError);
  expect(() => judge([1, 2, 3, 4, 7], { shintaki: false })).toThrow(RangeError);
});
