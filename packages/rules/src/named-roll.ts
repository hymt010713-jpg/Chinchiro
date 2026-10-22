import { judge, type HandKey } from './hands';
import { rollDie, type Rng } from './rng';

const SPECIAL_NAMES = new Set(['ひろきちくん', 'ひろきち', '新滝']);
const OUTCOMES = 6 ** 5;
// 1/2・1/3・1.5倍を整数の抽選口数で扱う。
const TICKETS_PER_OUTCOME = 6;
const TOTAL_TICKETS = OUTCOMES * TICKETS_PER_OUTCOME;

interface Bucket {
  dice: number[][];
  end: number;
}

const tables = new Map<boolean, Bucket[]>();

function getTable(shintaki: boolean): Bucket[] {
  const cached = tables.get(shintaki);
  if (cached) return cached;

  const groups = new Map<HandKey, number[][]>();
  for (let n = 0; n < OUTCOMES; n++) {
    let x = n;
    const dice = Array.from({ length: 5 }, () => {
      const value = (x % 6) + 1;
      x = Math.floor(x / 6);
      return value;
    });
    const key = judge(dice, { shintaki }).key;
    const group = groups.get(key) ?? [];
    group.push(dice);
    groups.set(key, group);
  }

  const tickets = new Map<HandKey, number>();
  for (const [key, dice] of groups) {
    const perOutcome = key === 'hifumi' ? 3
      : key === 'gyakuShintaki' ? 2
      : key === 'arashi' || key === 'yonzoro' ? 9
      : TICKETS_PER_OUTCOME;
    tickets.set(key, dice.length * perOutcome);
  }
  // 他の役は再正規化せず、増減の差額だけ通常の「目」で調整する。
  const excess = [...tickets.values()].reduce((sum, n) => sum + n, 0) - TOTAL_TICKETS;
  tickets.set('me', tickets.get('me')! - excess);
  if (tickets.get('me')! < 0) throw new Error('通常の目で確率を調整できません');

  let end = 0;
  const table = [...groups].map(([key, dice]) => {
    end += tickets.get(key)!;
    return { dice, end };
  });
  tables.set(shintaki, table);
  return table;
}

/** 保存された名前の完全一致。役の中では全ての出目・並びを等確率で選ぶ。 */
export function rollDiceForName(name: string | undefined, shintaki: boolean, rng: Rng): number[] {
  if (name === undefined || !SPECIAL_NAMES.has(name)) {
    return Array.from({ length: 5 }, () => rollDie(rng));
  }
  const table = getTable(shintaki);
  const ticket = Math.floor(rng() * TOTAL_TICKETS);
  const bucket = table.find((entry) => ticket < entry.end)!;
  // 履歴や演出による書き換えが抽選表へ影響しないようコピーする。
  return [...bucket.dice[Math.floor(rng() * bucket.dice.length)]!];
}
