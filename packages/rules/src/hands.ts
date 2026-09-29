/**
 * 五面チンチロの役判定。
 *
 * 5個の出目から役を1つ選ぶ。上から順に調べ、最初に当てはまったものを返す。
 * 目なしは数学的に起きない（5個すべて違えば必ず 123 か 456 を含む）。
 */

export type HandKey =
  | 'gopin'
  | 'gozoro'
  | 'yonpin'
  | 'yonzoro'
  | 'pinzoro'
  | 'junShintaki'
  | 'arashi'
  | 'shigoro'
  | 'me'
  | 'hifumi'
  | 'gyakuShintaki'
  | 'shonben';

/** 演出の格。画面と効果音の強さを決める */
export type Tier = 'kiwami' | 'dai' | 'chu' | 'sho' | 'me' | 'make';

export interface Hand {
  key: HandKey;
  /** 表示名（目は「5の目」） */
  label: string;
  /** 強さ。大きいほど強い。同じなら親の勝ち。目は 1.4〜1.6 */
  rank: number;
  /** 勝ったときの倍率 */
  win: number;
  /** 負けたときの払い倍率 */
  lose: number;
  tier: Tier;
  /** 役を作った賽の位置（0〜4） */
  used: number[];
  /** 目・嵐・ゾロ目の数字 */
  value?: number;
  /** 判定理由（画面表示用） */
  reason: string;
}

export interface JudgeOptions {
  /** 新滝ルール（23456＝順新滝 5倍、12345＝逆新滝 5倍払い） */
  shintaki: boolean;
}

type Base = Pick<Hand, 'key' | 'rank' | 'win' | 'lose' | 'tier'> & { name: string };

export const HANDS: Record<HandKey, Base> = {
  gopin: { key: 'gopin', name: '五ピン', rank: 15, win: 15, lose: 1, tier: 'kiwami' },
  gozoro: { key: 'gozoro', name: '五ゾロ', rank: 10, win: 10, lose: 1, tier: 'kiwami' },
  yonpin: { key: 'yonpin', name: '四ピン', rank: 8, win: 8, lose: 1, tier: 'kiwami' },
  yonzoro: { key: 'yonzoro', name: '四ゾロ', rank: 5, win: 5, lose: 1, tier: 'dai' },
  pinzoro: { key: 'pinzoro', name: 'ピンゾロ', rank: 5, win: 5, lose: 1, tier: 'dai' },
  junShintaki: { key: 'junShintaki', name: '順新滝', rank: 5, win: 5, lose: 1, tier: 'dai' },
  arashi: { key: 'arashi', name: '嵐', rank: 3, win: 3, lose: 1, tier: 'chu' },
  shigoro: { key: 'shigoro', name: 'シゴロ', rank: 2, win: 2, lose: 1, tier: 'sho' },
  me: { key: 'me', name: '目', rank: 1, win: 1, lose: 1, tier: 'me' },
  hifumi: { key: 'hifumi', name: 'ヒフミ', rank: 0, win: 1, lose: 2, tier: 'make' },
  gyakuShintaki: { key: 'gyakuShintaki', name: '逆新滝', rank: -1, win: 1, lose: 5, tier: 'make' },
  shonben: { key: 'shonben', name: 'ションベン', rank: -2, win: 1, lose: 1, tier: 'make' },
};

const ALL = [0, 1, 2, 3, 4];

function make(key: HandKey, used: number[], reason: string, value?: number): Hand {
  const { name, ...base } = HANDS[key];
  const hand: Hand = { ...base, label: name, used, reason };
  if (value !== undefined) hand.value = value;
  if (key === 'me' && value !== undefined) {
    hand.rank = 1 + value / 10;
    hand.label = `${value}の目`;
  }
  return hand;
}

export function shonbenHand(): Hand {
  return make('shonben', [], '賽が丼の外に出た');
}

export function judge(dice: readonly number[], opts: JudgeOptions): Hand {
  if (dice.length !== 5 || dice.some((v) => !Number.isInteger(v) || v < 1 || v > 6)) {
    throw new RangeError(`出目は1〜6を5個: ${dice.join(',')}`);
  }
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const v of dice) c[v]++;
  const positions = (v: number, n: number) =>
    ALL.filter((i) => dice[i] === v).slice(0, n);
  const firstOf = (vs: number[]) => vs.map((v) => dice.indexOf(v));

  for (let v = 1; v <= 6; v++) {
    if (c[v] === 5) {
      return v === 1 ? make('gopin', ALL, '5個すべて 1', 1) : make('gozoro', ALL, `5個すべて ${v}`, v);
    }
  }
  for (let v = 1; v <= 6; v++) {
    if (c[v] === 4) {
      return v === 1
        ? make('yonpin', positions(1, 4), '1 が4個', 1)
        : make('yonzoro', positions(v, 4), `${v} が4個`, v);
    }
  }
  const has123 = c[1] > 0 && c[2] > 0 && c[3] > 0;
  const has456 = c[4] > 0 && c[5] > 0 && c[6] > 0;

  if (c[1] >= 3) {
    return make('pinzoro', positions(1, 3), '1 が3個' + (has123 ? '（ヒフミより優先）' : ''), 1);
  }
  const distinct = c.filter((n) => n > 0).length;
  if (opts.shintaki && distinct === 5 && (c[1] === 0 || c[6] === 0)) {
    return c[6] > 0
      ? make('junShintaki', ALL, '2・3・4・5・6（シゴロより優先）')
      : make('gyakuShintaki', ALL, '1・2・3・4・5（ヒフミより重い）');
  }
  for (let v = 6; v >= 2; v--) {
    if (c[v] >= 3) {
      const note = has456 ? '（シゴロより優先）' : has123 ? '（ヒフミより優先）' : '';
      return make('arashi', positions(v, 3), `${v} が3個${note}`, v);
    }
  }
  if (has456) return make('shigoro', firstOf([4, 5, 6]), '4・5・6 を含む');
  if (has123) {
    const pair = c.some((n) => n >= 2);
    return make('hifumi', firstOf([1, 2, 3]), '1・2・3 を含む' + (pair ? '（目より優先）' : ''));
  }
  // 目：1個 v を選び、残り4個にペアがあれば v の目。高い v から探す
  for (let v = 6; v >= 1; v--) {
    for (const i of ALL) {
      if (dice[i] !== v) continue;
      const rest = ALL.filter((j) => j !== i);
      for (let p = 6; p >= 1; p--) {
        const pair = rest.filter((j) => dice[j] === p);
        if (pair.length >= 2) {
          return make('me', [i, pair[0]!, pair[1]!], `${p}・${p} のペア ＋ ${v}`, v);
        }
      }
    }
  }
  throw new Error(`判定できない出目: ${dice.join('')}`);
}
